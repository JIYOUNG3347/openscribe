import socket

import httpx
from fastapi import APIRouter

from app.services.settings_service import get_setting

router = APIRouter()


def _tcp_ok(host: str, port: str, timeout: float = 2.0) -> bool:
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return True
    except Exception:
        return False


async def _check_ollama() -> dict:
    base = await get_setting("OLLAMA_BASE_URL") or "http://localhost:11434"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{base}/api/tags")
            resp.raise_for_status()
            models = [m.get("name", "") for m in resp.json().get("models", [])]
        return {"ok": True, "models": models, "base_url": base}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "models": [], "base_url": base, "error": str(e)[:100]}


@router.get("/status")
async def system_status() -> dict:
    """배포/온보딩용 — 엔진·모델·키 준비 상태를 한 번에 보고."""
    # GPU / Whisper(torch+transformers) 가용성
    gpu = False
    whisper_ok = False
    try:
        import torch  # type: ignore

        gpu = bool(torch.cuda.is_available())
        import transformers  # type: ignore  # noqa: F401

        whisper_ok = True
    except Exception:  # noqa: BLE001
        pass

    # Riva 서버 도달 여부
    riva_server = (await get_setting("RIVA_SERVER")) or "localhost:50051"
    host, _, port = riva_server.partition(":")
    riva_ok = _tcp_ok(host or "localhost", port or "50051")

    # 키/자격
    openai_key = bool(await get_setting("OPENAI_API_KEY"))
    clova_ok = bool(await get_setting("CLOVA_SPEECH_INVOKE_URL")) and bool(
        await get_setting("CLOVA_SPEECH_SECRET")
    )
    hf_token = bool(await get_setting("HUGGING_FACE_TOKEN"))

    ollama = await _check_ollama()

    return {
        "gpu": gpu,
        "llm": {
            "ollama": ollama,
            "openai": openai_key,
            "ready": ollama["ok"] or openai_key,
        },
        "stt": {
            "whisper": {"ok": whisper_ok, "gpu": gpu},
            "riva": {"ok": riva_ok, "server": riva_server},
            "clova": {"ok": clova_ok},
        },
        "keys": {"openai": openai_key, "clova": clova_ok, "huggingface": hf_token},
    }
