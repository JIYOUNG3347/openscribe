from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class TranscriptionSegment(BaseModel):
    speaker: str
    start: float
    end: float
    text: str


class TranscriptionData(BaseModel):
    segments: list[TranscriptionSegment]
    options: dict[str, Any]


class MeetingCreate(BaseModel):
    title: str
    date: str
    engine: str  # whisper | clova | riva
    stt_options: dict[str, Any] = {}
    template_id: Optional[str] = None


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    transcription: Optional[dict[str, Any]] = None
    template_id: Optional[str] = None


class SpeakerNamesUpdate(BaseModel):
    """PATCH body: speaker label → display name, e.g. {"SPEAKER_00": "홍길동"}."""
    speaker_names: dict[str, str]


class MeetingResponse(BaseModel):
    id: str
    title: str
    date: str
    engine: str
    duration: float
    speaker_count: int
    status: str
    progress: int
    transcription: Optional[dict[str, Any]] = None
    speaker_names: Optional[dict[str, str]] = None
    notes: Optional[str] = None
    template_id: Optional[str] = None
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class MeetingListResponse(BaseModel):
    meetings: list[MeetingResponse]
    total: int
