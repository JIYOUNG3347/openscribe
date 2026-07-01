from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel


class STTOptions(BaseModel):
    timestamp_enabled: bool = True
    diarization_enabled: bool = True
    speaker_count: int | str = "auto"
    engine_options: dict[str, Any] = {}


class STTResult(BaseModel):
    segments: list[STTSegment]
    duration: float
    speaker_count: int
    options: dict[str, Any]


class STTSegment(BaseModel):
    speaker: str
    start: float
    end: float
    text: str


class NotesGenerateRequest(BaseModel):
    meeting_id: str
    template_sections: list[dict]
    model_id: str  # e.g. gemma3:4b, ollama/qwen2.5:7b, gpt-4o
    segments: list[dict]
    meeting_title: str
    meeting_date: str


class NotesGenerateResponse(BaseModel):
    notes: str
    model_id: str
