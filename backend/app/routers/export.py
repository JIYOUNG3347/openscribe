from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.meeting import Meeting
from app.services.export_service import ExportService

router = APIRouter()


@router.post("/{meeting_id}")
async def export_meeting(
    meeting_id: str,
    format: str = "md",
    db: AsyncSession = Depends(get_db),
):
    meeting = await db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if not meeting.notes:
        raise HTTPException(status_code=400, detail="No notes to export")

    service = ExportService()
    file_bytes, content_type = await service.export(meeting.notes, meeting.title, format)

    # Content-Disposition 헤더는 latin-1 만 허용 → 한글 파일명은 RFC 5987(filename*)로.
    filename = f"{meeting.title}_회의록.{format}"
    ascii_fallback = f"meeting_notes.{format}"  # 구형 클라이언트용 ASCII 폴백
    disposition = (
        f"attachment; filename=\"{ascii_fallback}\"; "
        f"filename*=UTF-8''{quote(filename)}"
    )

    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={"Content-Disposition": disposition},
    )
