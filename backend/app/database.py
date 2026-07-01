import json
import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from contextlib import asynccontextmanager

from app.config import settings

logger = logging.getLogger(__name__)

# ensure_ascii=False so Korean in JSON columns is stored literally (searchable via LIKE).
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    json_serializer=lambda obj: json.dumps(obj, ensure_ascii=False),
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def create_tables() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def run_migrations() -> None:
    """Lightweight idempotent auto-migration for SQLite (no Alembic).

    create_all() never ALTERs existing tables, so when a model gains a column
    (e.g. meetings.speaker_names) an existing DB keeps the old schema. Here we
    diff each model table against the live columns and ADD only the missing
    ones (additive, nullable). Never drops or alters types → data is preserved.

    Idempotent: existing columns are skipped, so re-running is a no-op.
    Must run AFTER create_tables() (so the tables exist).

    # Alembic 경로(대안): 규모가 커지면 `alembic init` 후 리비전으로 관리.
    #   이 데모 셋업엔 아래 경량 처리가 더 가벼움.
    """
    # 모델을 import 해야 Base.metadata 에 테이블/컬럼이 등록됨
    import app.models.meeting  # noqa: F401
    import app.models.template  # noqa: F401
    import app.models.setting  # noqa: F401

    async with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            res = await conn.exec_driver_sql(f'PRAGMA table_info("{table.name}")')
            existing = {row[1] for row in res.fetchall()}
            if not existing:
                continue  # 테이블 자체가 없으면 create_all 담당 → 건너뜀
            for col in table.columns:
                if col.name in existing:
                    continue
                try:
                    coltype = col.type.compile(dialect=engine.dialect)
                except Exception:
                    coltype = "TEXT"  # 매핑 불가 시 TEXT 폴백
                # 추가만(ADD). NOT NULL 제약은 빼서 기존 행에 NULL 허용(비파괴적).
                await conn.exec_driver_sql(
                    f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {coltype}'
                )
                logger.info("migration: added %s.%s (%s)", table.name, col.name, coltype)


@asynccontextmanager
async def get_db_session():
    session = async_session()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def get_db() -> AsyncSession:
    """FastAPI dependency for DB sessions."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
