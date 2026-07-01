import enum

from sqlalchemy import Column, DateTime, Enum, Float, Integer, JSON, String, Text
from sqlalchemy.sql import func

from app.database import Base


class MeetingStatus(str, enum.Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    date = Column(String, nullable=False)
    engine = Column(String, nullable=False)  # whisper | clova | riva
    duration = Column(Float, default=0)
    speaker_count = Column(Integer, default=0)
    status = Column(Enum(MeetingStatus), default=MeetingStatus.queued)
    progress = Column(Integer, default=0)

    # File paths
    audio_file_path = Column(String, nullable=True)

    # STT options (JSON)
    stt_options = Column(JSON, nullable=True)

    # Results
    transcription = Column(JSON, nullable=True)
    # Speaker label → display name mapping, e.g. {"SPEAKER_00": "홍길동"}
    speaker_names = Column(JSON, nullable=True)
    notes = Column(Text, nullable=True)
    template_id = Column(String, nullable=True)

    # Error
    error_message = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
