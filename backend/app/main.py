import logging
from contextlib import asynccontextmanager

# ---------------------------------------------------------------------------
# PyTorch 2.6+ compat: default weights_only=True breaks pyannote/speechbrain.
# lightning_fabric passes weights_only=None to torch.load(), which then calls
# _default_to_weights_only() → True.  Override that internal function.
# ---------------------------------------------------------------------------
try:
    import torch
    import torch.serialization

    torch.serialization._default_to_weights_only = lambda *_a, **_kw: False
except (ImportError, Exception):
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings as app_settings
from app.database import Base, create_tables, get_db_session, run_migrations
from app.models.template import Template
from app.routers import export, llm, meetings, settings as settings_router, stt, system, templates

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEFAULT_TEMPLATES = [
    {
        "id": "default-basic",
        "name": "기본 회의록",
        "is_default": True,
        "sections": [
            {"key": "summary", "label": "핵심 요약", "type": "llm_generate", "prompt": "회의 내용을 3줄 이내로 요약해주세요", "color": "#00754A"},
            {"key": "decisions", "label": "결정 사항", "type": "llm_generate", "prompt": "회의에서 결정된 사항을 목록으로 정리해주세요", "color": "#2C7D72"},
            {"key": "actions", "label": "Action Items", "type": "llm_generate", "prompt": "참석자별 할 일을 마크다운 체크리스트(- [ ] ...)로 정리해주세요. 담당자와 기한이 분명하면 각 항목 끝에 '[@담당자 ~MM/DD]' 형식을 덧붙이세요. 예) - [ ] 보고서 작성 [@홍길동 ~07/15]", "color": "#C2710C"},
            {"key": "transcript", "label": "전체 발화록", "type": "raw_transcript", "prompt": None, "color": "#6B6256"},
        ],
    },
    {
        "id": "default-simple",
        "name": "간단 요약",
        "is_default": True,
        "sections": [
            {"key": "oneline", "label": "한줄 요약", "type": "llm_generate", "prompt": "회의 내용을 한 문장으로 요약해주세요", "color": "#00754A"},
            {"key": "keywords", "label": "주요 키워드", "type": "llm_generate", "prompt": "핵심 키워드 5개를 뽑아주세요", "color": "#C2710C"},
        ],
    },
]


async def seed_default_templates() -> None:
    """Insert default templates if they don't exist."""
    async with get_db_session() as session:
        for tmpl_data in DEFAULT_TEMPLATES:
            existing = await session.get(Template, tmpl_data["id"])
            if not existing:
                template = Template(**tmpl_data)
                session.add(template)
                logger.info("Seeded template: %s", tmpl_data["name"])


async def cleanup_orphaned_meetings() -> None:
    """Mark any 'processing' meetings as 'failed' on startup.

    After a server restart, in-memory TaskManager is lost, so these
    meetings will never complete. Mark them failed so the user can see
    what happened and retry.
    """
    from sqlalchemy import select

    from app.models.meeting import Meeting, MeetingStatus

    async with get_db_session() as session:
        result = await session.execute(
            select(Meeting).where(
                Meeting.status.in_([MeetingStatus.processing, MeetingStatus.queued])
            )
        )
        orphaned = result.scalars().all()
        for meeting in orphaned:
            meeting.status = MeetingStatus.failed
            meeting.error_message = "서버가 재시작되어 처리가 중단되었습니다. 다시 시도해주세요."
        if orphaned:
            logger.warning(
                "Marked %d orphaned processing/queued meeting(s) as failed",
                len(orphaned),
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    app_settings.ensure_dirs()
    await create_tables()
    await run_migrations()
    await seed_default_templates()
    await cleanup_orphaned_meetings()

    # Start STT job queue worker
    from app.tasks.task_manager import TaskManager
    manager = TaskManager.get_instance()
    await manager.start_worker()

    logger.info("OpenScribe backend started")
    yield
    logger.info("OpenScribe backend shutting down")


app = FastAPI(
    title="OpenScribe API",
    version="0.1.0",
    description="AI-powered meeting transcription and notes generation",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meetings.router, prefix="/api/meetings", tags=["meetings"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(stt.router, prefix="/api/stt", tags=["stt"])
app.include_router(llm.router, prefix="/api/llm", tags=["llm"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
app.include_router(system.router, prefix="/api/system", tags=["system"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["settings"])


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
