import logging

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from app.schemas.stt import NotesGenerateRequest, NotesGenerateResponse
from app.services.notes_service import NotesService
from app.services.settings_service import get_setting

logger = logging.getLogger(__name__)

router = APIRouter()

OPENAI_MODELS = [
    {"id": "gpt-4o", "name": "GPT-4o", "provider": "OpenAI"},
    {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "provider": "OpenAI"},
]


async def _ollama_base_url() -> str:
    return await get_setting("OLLAMA_BASE_URL") or "http://localhost:11434"


# 추론(thinking)형 모델 — 답 전에 긴 사고를 하여 토큰을 소진, 회의록 요약엔 부적합.
_REASONING_HINTS = ("qwen3", "deepseek-r1", "qwq", "magistral", "reasoning", "thinking", "cogito", "-r1")


def _is_reasoning_model(name: str) -> bool:
    n = name.lower()
    return any(h in n for h in _REASONING_HINTS)


@router.get("/models")
async def list_models():
    """Return available LLM models (Ollama dynamic + OpenAI fixed)."""
    models = []

    # Ollama 모델(우선) — 첫 항목이 프런트 기본 선택이 됨
    base_url = await _ollama_base_url()
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{base_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            for m in data.get("models", []):
                name = m.get("name", "")
                size = m.get("size", 0)
                models.append({
                    "id": f"ollama/{name}",
                    "name": name,
                    "provider": "Ollama",
                    "size": size,
                    # 추론(thinking)형 모델은 요약 전에 긴 사고를 하여 회의록엔 부적합
                    "reasoning": _is_reasoning_model(name),
                })
    except Exception as e:
        logger.warning("Ollama 모델 목록 조회 실패 (%s): %s", base_url, e)

    models += OPENAI_MODELS
    return {"models": models}


@router.get("/ollama/models")
async def list_ollama_models():
    """Return installed Ollama models with details."""
    base_url = await _ollama_base_url()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{base_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            models = []
            for m in data.get("models", []):
                models.append({
                    "name": m.get("name", ""),
                    "size": m.get("size", 0),
                    "modified_at": m.get("modified_at", ""),
                    "digest": m.get("digest", "")[:12],
                })
            return {"models": models, "connected": True, "base_url": base_url}
    except Exception as e:
        logger.warning("Ollama 연결 실패 (%s): %s", base_url, e)
        return {"models": [], "connected": False, "base_url": base_url, "error": str(e)}


class OllamaPullRequest(BaseModel):
    name: str


@router.post("/ollama/pull")
async def pull_ollama_model(req: OllamaPullRequest):
    """Pull (download) an Ollama model. This may take a while."""
    base_url = await _ollama_base_url()
    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            resp = await client.post(
                f"{base_url}/api/pull",
                json={"name": req.name, "stream": False},
            )
            if resp.status_code != 200:
                try:
                    detail = (resp.json() or {}).get("error", "") or resp.text[:200]
                except Exception:
                    detail = resp.text[:200]
                low = detail.lower()
                if "newer version" in low or resp.status_code == 412:
                    msg = (
                        f"'{req.name}'은(는) 더 최신 Ollama가 필요합니다. Ollama 컨테이너를 업데이트하세요: "
                        "`docker pull ollama/ollama:latest` 후 컨테이너 재기동."
                    )
                elif "not exist" in low or "not found" in low or "manifest" in low:
                    msg = (
                        f"'{req.name}' 모델을 찾을 수 없습니다. 모델명을 확인하세요. "
                        "(예: llama3.1, qwen2.5, gemma2, gemma3:4b, mistral · ollama.com/library 참고)"
                    )
                else:
                    msg = f"다운로드 실패: {detail or resp.status_code}"
                logger.warning("Ollama pull 실패 [%s]: %s", req.name, detail or resp.status_code)
                return {"status": "error", "name": req.name, "message": msg}
            return {"status": "success", "name": req.name}
    except httpx.TimeoutException:
        return {"status": "timeout", "name": req.name, "message": "다운로드가 진행 중입니다. 잠시 후 모델 목록을 새로고침 해주세요."}
    except Exception as e:
        logger.error("Ollama 모델 Pull 실패: %s", e)
        return {"status": "error", "name": req.name, "message": str(e)}


class OllamaDeleteRequest(BaseModel):
    name: str


@router.delete("/ollama/models")
async def delete_ollama_model(req: OllamaDeleteRequest):
    """Delete an Ollama model."""
    base_url = await _ollama_base_url()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.request(
                "DELETE",
                f"{base_url}/api/delete",
                json={"name": req.name},
            )
            resp.raise_for_status()
            return {"status": "success", "name": req.name}
    except Exception as e:
        logger.error("Ollama 모델 삭제 실패: %s", e)
        return {"status": "error", "name": req.name, "message": str(e)}


@router.post("/generate", response_model=NotesGenerateResponse)
async def generate_notes(req: NotesGenerateRequest):
    service = NotesService()
    notes = await service.generate_notes(
        segments=req.segments,
        template_sections=req.template_sections,
        model_id=req.model_id,
        meeting_title=req.meeting_title,
        meeting_date=req.meeting_date,
    )
    return NotesGenerateResponse(notes=notes, model_id=req.model_id)
