import asyncio
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class STTJob:
    """A queued STT processing job."""

    meeting_id: str
    engine_name: str
    audio_path: str
    stt_options: dict


class TaskProgress:
    """Tracks progress of a single STT processing job."""

    def __init__(self, meeting_id: str):
        self.meeting_id = meeting_id
        self.step = "queued"
        self.progress = 0
        self.message = ""
        self.error: Optional[str] = None
        self.completed = False
        self._event = asyncio.Event()
        self._cancelled = False
        self.queue_position = 0

    def update(self, step: str, progress: int, message: str = "") -> None:
        self.step = step
        self.progress = progress
        self.message = message
        self._event.set()
        self._event = asyncio.Event()

    def mark_complete(self) -> None:
        self.completed = True
        self.progress = 100
        self.step = "complete"
        self._event.set()

    def mark_failed(self, error: str) -> None:
        self.error = error
        self.step = "failed"
        self._event.set()

    def cancel(self) -> None:
        self._cancelled = True
        self.mark_failed("사용자가 취소했습니다")

    @property
    def is_cancelled(self) -> bool:
        return self._cancelled

    async def wait_for_update(self, timeout: float = 30.0) -> None:
        try:
            await asyncio.wait_for(self._event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            pass  # Heartbeat — SSE will send current state


class TaskManager:
    """Singleton managing the STT job queue and active tasks."""

    _instance: Optional["TaskManager"] = None

    def __init__(self):
        self._tasks: dict[str, TaskProgress] = {}
        self._queue: asyncio.Queue[STTJob] = asyncio.Queue()
        self._worker_started = False

    @classmethod
    def get_instance(cls) -> "TaskManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def enqueue(self, job: STTJob) -> TaskProgress:
        """Add a job to the queue and return its TaskProgress tracker."""
        task = TaskProgress(job.meeting_id)
        task.queue_position = self._queue.qsize() + 1
        task.message = f"대기 중 ({task.queue_position}번째)"
        self._tasks[job.meeting_id] = task
        await self._queue.put(job)
        self._update_queue_positions()
        return task

    def get_task(self, meeting_id: str) -> Optional[TaskProgress]:
        return self._tasks.get(meeting_id)

    def remove_task(self, meeting_id: str) -> None:
        self._tasks.pop(meeting_id, None)

    def _update_queue_positions(self) -> None:
        """Recalculate queue positions for all queued tasks."""
        pos = 1
        for task in self._tasks.values():
            if task.step == "queued":
                task.queue_position = pos
                task.message = f"대기 중 ({pos}번째)"
                task._event.set()
                task._event = asyncio.Event()
                pos += 1

    async def start_worker(self) -> None:
        """Start the background worker that processes queued STT jobs."""
        if self._worker_started:
            return
        self._worker_started = True
        asyncio.create_task(self._worker_loop())
        logger.info("STT queue worker started")

    async def _worker_loop(self) -> None:
        """Process STT jobs one at a time from the queue."""
        from app.tasks.stt_pipeline import execute_stt_job

        while True:
            job = await self._queue.get()
            task = self.get_task(job.meeting_id)

            if task and task.is_cancelled:
                logger.info("Skipping cancelled job: %s", job.meeting_id)
                self._queue.task_done()
                self._update_queue_positions()
                continue

            try:
                await execute_stt_job(job, task)
            except Exception:
                logger.exception("Unhandled error in worker for job %s", job.meeting_id)
            finally:
                self._queue.task_done()
                self._update_queue_positions()
