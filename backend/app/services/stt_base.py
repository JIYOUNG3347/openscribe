from abc import ABC, abstractmethod
from typing import Callable, Optional

from app.schemas.stt import STTOptions, STTResult

ProgressCallback = Callable[[str, int, str], None]


class BaseSTTEngine(ABC):
    """Abstract base for all STT engines."""

    @abstractmethod
    async def transcribe(
        self,
        audio_path: str,
        options: STTOptions,
        on_progress: Optional[ProgressCallback] = None,
    ) -> STTResult:
        """Run the full transcription pipeline. Calls on_progress with (step, progress%, message)."""
        ...

    @abstractmethod
    def name(self) -> str: ...
