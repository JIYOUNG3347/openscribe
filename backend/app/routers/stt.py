import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.database import get_db_session
from app.models.meeting import Meeting, MeetingStatus
from app.tasks.task_manager import TaskManager

router = APIRouter()


@router.get("/{meeting_id}/progress")
async def stream_progress(meeting_id: str):
    """SSE endpoint for real-time STT progress updates."""

    async def event_generator():
        manager = TaskManager.get_instance()
        task = manager.get_task(meeting_id)

        if not task:
            yield f"data: {json.dumps({'error': 'Task not found'})}\n\n"
            return

        while not task.completed and task.error is None:
            data = {
                "step": task.step,
                "progress": task.progress,
                "message": task.message,
                "queue_position": task.queue_position,
            }
            yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
            await task.wait_for_update(timeout=15.0)

        # Final event
        if task.error:
            yield f"data: {json.dumps({'step': 'failed', 'error': task.error})}\n\n"
        else:
            yield f"data: {json.dumps({'step': 'complete', 'progress': 100})}\n\n"

        manager.remove_task(meeting_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{meeting_id}/cancel")
async def cancel_processing(meeting_id: str):
    manager = TaskManager.get_instance()
    task = manager.get_task(meeting_id)
    if task:
        task.cancel()
        # Update DB status immediately
        async with get_db_session() as session:
            meeting = await session.get(Meeting, meeting_id)
            if meeting and meeting.status in (MeetingStatus.queued, MeetingStatus.processing):
                meeting.status = MeetingStatus.failed
                meeting.error_message = "사용자가 취소했습니다"
        return {"status": "cancelled"}
    return {"status": "not_found"}
