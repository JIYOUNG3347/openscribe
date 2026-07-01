import json
import mimetypes
import os
import shutil
import uuid

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.meeting import Meeting, MeetingStatus
from app.schemas.meeting import (
    MeetingListResponse,
    MeetingResponse,
    MeetingUpdate,
    SpeakerNamesUpdate,
)

router = APIRouter()

# Chunk size for ranged audio streaming (1 MiB)
_AUDIO_CHUNK = 1024 * 1024

# Valid status filter values
_STATUS_VALUES = {s.value for s in MeetingStatus}


def _guess_audio_type(path: str) -> str:
    mime, _ = mimetypes.guess_type(path)
    return mime or "application/octet-stream"


@router.get("", response_model=MeetingListResponse)
async def list_meetings(
    q: str | None = None,
    status: list[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """List meetings, optionally filtered by free-text `q` and one or more `status`.

    `q` searches title + transcription + notes (case-insensitive substring).
    `status` may be repeated for multi-select (queued/processing/completed/failed).
    """
    stmt = select(Meeting).order_by(Meeting.created_at.desc())

    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Meeting.title).like(like),
                func.lower(cast(Meeting.transcription, String)).like(like),
                func.lower(Meeting.notes).like(like),
            )
        )

    valid = [MeetingStatus(s) for s in status if s in _STATUS_VALUES]
    if valid:
        stmt = stmt.where(Meeting.status.in_(valid))

    result = await db.execute(stmt)
    meetings = result.scalars().all()
    return MeetingListResponse(
        meetings=[MeetingResponse.model_validate(m) for m in meetings],
        total=len(meetings),
    )


@router.get("/{meeting_id}", response_model=MeetingResponse)
async def get_meeting(meeting_id: str, db: AsyncSession = Depends(get_db)):
    meeting = await db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.get("/{meeting_id}/audio")
async def stream_audio(
    meeting_id: str,
    range: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Serve the meeting's audio file, with HTTP Range support for seeking."""
    meeting = await db.get(Meeting, meeting_id)
    if not meeting or not meeting.audio_file_path or not os.path.exists(meeting.audio_file_path):
        raise HTTPException(status_code=404, detail="Audio not found")

    path = meeting.audio_file_path
    file_size = os.path.getsize(path)
    media_type = _guess_audio_type(path)

    # No Range header → return the whole file.
    if not range:
        return FileResponse(
            path,
            media_type=media_type,
            headers={"Accept-Ranges": "bytes", "Cache-Control": "no-cache"},
        )

    # Parse a single "bytes=start-end" range (incl. suffix "bytes=-N").
    try:
        units, _, rng = range.partition("=")
        if units.strip() != "bytes":
            raise ValueError
        start_s, _, end_s = rng.strip().partition("-")
        if start_s == "" and end_s != "":
            # suffix range: the last N bytes
            length = int(end_s)
            start = max(0, file_size - length)
            end = file_size - 1
        else:
            start = int(start_s) if start_s else 0
            end = int(end_s) if end_s else file_size - 1
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Range header")

    start = max(0, start)
    end = min(end, file_size - 1)
    if start > end:
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    async def iter_file():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = f.read(min(_AUDIO_CHUNK, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
        "Cache-Control": "no-cache",
    }
    return StreamingResponse(iter_file(), status_code=206, media_type=media_type, headers=headers)


@router.post("", status_code=201)
async def create_meeting(
    file: UploadFile = File(...),
    title: str = Form(...),
    date: str = Form(...),
    engine: str = Form(...),
    stt_options: str = Form("{}"),
    template_id: str = Form(None),
    db: AsyncSession = Depends(get_db),
):
    meeting_id = str(uuid.uuid4())
    options_dict = json.loads(stt_options)

    # Save uploaded file
    settings.ensure_dirs()
    ext = os.path.splitext(file.filename or "audio.wav")[1]
    upload_path = os.path.join(settings.UPLOAD_DIR, f"{meeting_id}{ext}")
    with open(upload_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Create DB record with queued status
    meeting = Meeting(
        id=meeting_id,
        title=title,
        date=date,
        engine=engine,
        status=MeetingStatus.queued,
        progress=0,
        audio_file_path=upload_path,
        stt_options=options_dict,
        template_id=template_id,
    )
    db.add(meeting)
    await db.flush()

    # Add to STT processing queue
    from app.tasks.task_manager import TaskManager, STTJob

    manager = TaskManager.get_instance()
    await manager.enqueue(STTJob(
        meeting_id=meeting_id,
        engine_name=engine,
        audio_path=upload_path,
        stt_options=options_dict,
    ))

    return {"id": meeting_id, "status": "queued"}


@router.put("/{meeting_id}", response_model=MeetingResponse)
async def update_meeting(
    meeting_id: str,
    body: MeetingUpdate,
    db: AsyncSession = Depends(get_db),
):
    meeting = await db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if body.title is not None:
        meeting.title = body.title
    if body.notes is not None:
        meeting.notes = body.notes
    if body.transcription is not None:
        meeting.transcription = body.transcription
    if body.template_id is not None:
        meeting.template_id = body.template_id

    await db.flush()
    await db.refresh(meeting)
    return meeting


@router.patch("/{meeting_id}/speaker-names", response_model=MeetingResponse)
async def update_speaker_names(
    meeting_id: str,
    body: SpeakerNamesUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Set the speaker-label → display-name map (idempotent: replaces the whole map)."""
    meeting = await db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    meeting.speaker_names = body.speaker_names
    await db.flush()
    await db.refresh(meeting)
    return meeting


@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str, db: AsyncSession = Depends(get_db)):
    meeting = await db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Clean up audio file
    if meeting.audio_file_path and os.path.exists(meeting.audio_file_path):
        os.remove(meeting.audio_file_path)

    await db.delete(meeting)
    return {"status": "deleted"}
