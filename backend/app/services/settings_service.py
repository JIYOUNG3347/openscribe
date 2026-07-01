"""Centralized settings service — single source of truth.

Priority: DB value → env var → default.
"""

import os
from dataclasses import dataclass

from sqlalchemy import select

from app.database import get_db_session
from app.models.setting import Setting


@dataclass(frozen=True)
class SettingDef:
    label: str
    group: str
    default: str = ""
    secret: bool = False
    hint: str = ""


# ── All configurable settings in one place ───────────────────────────
SETTINGS_REGISTRY: dict[str, SettingDef] = {
    # Hugging Face — Whisper 모델 다운로드 + 화자 분리 모두 사용
    "HUGGING_FACE_TOKEN": SettingDef(
        label="Hugging Face Token",
        group="Hugging Face",
        secret=True,
        hint="hf_... 형식. Whisper 모델 다운로드 및 화자 분리에 사용",
    ),
    # LLM — OpenAI
    "OPENAI_API_KEY": SettingDef(
        label="API Key",
        group="LLM (OpenAI)",
        secret=True,
        hint="sk-... 형식. GPT-4o 등 OpenAI 모델 사용 시 필요",
    ),
    # LLM — Ollama
    "OLLAMA_BASE_URL": SettingDef(
        label="서버 주소",
        group="LLM (Ollama)",
        default="http://localhost:11434",
        hint="기본값: http://localhost:11434",
    ),
    # LLM — Local (기본 LLM, OpenAI 호환 /v1 서버: vLLM 또는 Ollama)
    "LLM_BASE_URL": SettingDef(
        label="서버 주소 (/v1)",
        group="LLM (Local)",
        default="http://localhost:8001/v1",
        hint="OpenAI 호환 /v1 엔드포인트. vLLM=http://localhost:8001/v1, Ollama=http://localhost:11434/v1",
    ),
    "LLM_MODEL": SettingDef(
        label="모델명",
        group="LLM (Local)",
        default="gemma-3-4b-it",
        hint="served-model-name (vLLM) 또는 ollama 모델명",
    ),
    "LLM_API_KEY": SettingDef(
        label="API Key",
        group="LLM (Local)",
        default="EMPTY",
        secret=True,
        hint="로컬 모델 서버는 보통 불필요 (기본 EMPTY)",
    ),
    # STT — Whisper
    "WHISPER_MODEL_ID": SettingDef(
        label="Whisper 모델",
        group="STT (Whisper)",
        default="openai/whisper-large-v3",
        hint="large-v3, large-v3-turbo 등",
    ),
    # STT — CLOVA
    "CLOVA_SPEECH_INVOKE_URL": SettingDef(
        label="Invoke URL",
        group="STT (CLOVA)",
        hint="CLOVA Speech API Invoke URL",
    ),
    "CLOVA_SPEECH_SECRET": SettingDef(
        label="Secret Key",
        group="STT (CLOVA)",
        secret=True,
        hint="CLOVA Speech API Secret Key",
    ),
    # STT — Riva
    "RIVA_SERVER": SettingDef(
        label="서버 주소",
        group="STT (Riva)",
        default="localhost:50051",
        hint="NVIDIA Riva gRPC 서버 주소",
    ),
}


def _resolve_value(key: str, db_val: str | None, defn: SettingDef) -> str:
    """DB → env var → default."""
    if db_val:
        return db_val
    return os.environ.get(key, "") or defn.default


def mask_value(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return value[:4] + "..." + value[-4:]


async def get_all_settings() -> list[dict]:
    """Return all settings with metadata for the frontend."""
    db_values: dict[str, str] = {}
    async with get_db_session() as session:
        rows = (await session.execute(select(Setting))).scalars().all()
        for row in rows:
            if row.key in SETTINGS_REGISTRY and row.value:
                db_values[row.key] = row.value

    result = []
    for key, defn in SETTINGS_REGISTRY.items():
        value = _resolve_value(key, db_values.get(key), defn)
        result.append({
            "key": key,
            "label": defn.label,
            "group": defn.group,
            "secret": defn.secret,
            "hint": defn.hint,
            "masked_value": mask_value(value) if defn.secret else value,
            "has_value": bool(value),
        })
    return result


async def get_setting(key: str) -> str:
    """Get a single setting value. DB → env var → default."""
    async with get_db_session() as session:
        row = await session.get(Setting, key)
        db_val = row.value if row else None
    defn = SETTINGS_REGISTRY.get(key)
    if defn:
        return _resolve_value(key, db_val, defn)
    return db_val or os.environ.get(key, "")


async def update_settings(updates: dict[str, str]) -> list[str]:
    """Upsert settings in DB. Returns list of updated keys."""
    updated = []
    async with get_db_session() as session:
        for key, value in updates.items():
            if key not in SETTINGS_REGISTRY:
                continue
            row = await session.get(Setting, key)
            if row:
                row.value = value
            else:
                session.add(Setting(key=key, value=value))
            updated.append(key)
    return updated
