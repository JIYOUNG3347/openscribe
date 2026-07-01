import asyncio
import logging
from typing import Optional

from app.database import get_db_session
from app.models.meeting import Meeting, MeetingStatus
from app.schemas.stt import STTOptions
from app.services.stt_factory import get_stt_engine
from app.tasks.task_manager import STTJob, TaskProgress

logger = logging.getLogger(__name__)

# Maximum processing time: 30 minutes
PIPELINE_TIMEOUT_SECONDS = 30 * 60


async def execute_stt_job(job: STTJob, task: Optional[TaskProgress]) -> None:
    """Execute an STT job from the queue. Called by the TaskManager worker."""

    try:
        # Update DB status: queued → processing
        async with get_db_session() as session:
            meeting = await session.get(Meeting, job.meeting_id)
            if meeting:
                meeting.status = MeetingStatus.processing
                meeting.progress = 0

        if task:
            task.update("preprocess", 5, "처리 시작...")

        engine = get_stt_engine(job.engine_name)
        options = STTOptions(**job.stt_options)

        def progress_callback(step: str, progress: int, message: str = "") -> None:
            if task and task.is_cancelled:
                raise asyncio.CancelledError("User cancelled")
            if task:
                task.update(step, progress, message)
            # Also update DB progress
            # (non-blocking fire-and-forget; main update is at end)

        # Run STT with timeout
        result = await asyncio.wait_for(
            engine.transcribe(job.audio_path, options, on_progress=progress_callback),
            timeout=PIPELINE_TIMEOUT_SECONDS,
        )

        # Check cancellation before saving (inference may have finished after cancel)
        if task and task.is_cancelled:
            raise asyncio.CancelledError("User cancelled")

        # Update DB with results
        async with get_db_session() as session:
            meeting = await session.get(Meeting, job.meeting_id)
            if meeting:
                meeting.transcription = {
                    "segments": [s.model_dump() for s in result.segments],
                    "options": result.options,
                }
                meeting.duration = result.duration
                meeting.speaker_count = result.speaker_count
                meeting.status = MeetingStatus.completed
                meeting.progress = 100

        if task:
            task.mark_complete()

    except asyncio.CancelledError:
        async with get_db_session() as session:
            meeting = await session.get(Meeting, job.meeting_id)
            if meeting:
                meeting.status = MeetingStatus.failed
                meeting.error_message = "사용자가 취소했습니다"

        if task:
            task.mark_failed("Cancelled by user")

    except asyncio.TimeoutError:
        logger.error("STT pipeline timed out for meeting %s", job.meeting_id)
        async with get_db_session() as session:
            meeting = await session.get(Meeting, job.meeting_id)
            if meeting:
                meeting.status = MeetingStatus.failed
                meeting.error_message = f"처리 시간 초과 ({PIPELINE_TIMEOUT_SECONDS // 60}분). 파일 크기를 확인해주세요."

        if task:
            task.mark_failed("Processing timed out")

    except Exception as e:
        logger.exception("STT pipeline failed for meeting %s", job.meeting_id)
        async with get_db_session() as session:
            meeting = await session.get(Meeting, job.meeting_id)
            if meeting:
                meeting.status = MeetingStatus.failed
                meeting.error_message = str(e)

        if task:
            task.mark_failed(str(e))
