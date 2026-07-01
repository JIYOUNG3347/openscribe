import json
import logging
from typing import Optional

import httpx

from app.schemas.stt import STTOptions, STTResult, STTSegment
from app.services.stt_base import BaseSTTEngine, ProgressCallback

logger = logging.getLogger(__name__)


class ClovaSTTEngine(BaseSTTEngine):
    """Wraps clova_stt.py NAVER CLOVA Speech API logic."""

    def name(self) -> str:
        return "clova"

    async def transcribe(
        self,
        audio_path: str,
        options: STTOptions,
        on_progress: Optional[ProgressCallback] = None,
    ) -> STTResult:
        from app.services.settings_service import get_setting
        invoke_url = await get_setting("CLOVA_SPEECH_INVOKE_URL")
        secret = await get_setting("CLOVA_SPEECH_SECRET")
        if not invoke_url or not secret:
            raise ValueError("CLOVA Speech API 키가 설정되지 않았습니다. 설정 페이지에서 입력해주세요.")

        language = options.engine_options.get("language", "ko-KR")
        mode = options.engine_options.get("mode", "async")

        # Step 1: Upload and submit
        if on_progress:
            on_progress("preprocess", 10, "CLOVA에 업로드 중...")

        submit_data = await self._submit_upload(invoke_url, secret, audio_path, language, mode, options)
        token = submit_data.get("token")

        # Step 2: Get result
        if mode == "sync":
            result_data = submit_data
        else:
            if not token:
                raise RuntimeError(f"CLOVA response missing token: {submit_data}")
            if on_progress:
                on_progress("stt", 30, "CLOVA STT 처리 중...")
            result_data = await self._poll_result(invoke_url, secret, token, on_progress)

        # Step 3: Parse response
        if on_progress:
            on_progress("complete", 100, "완료")

        segments = self._parse_response(result_data, options)
        duration = segments[-1].end if segments else 0.0
        speaker_count = len(set(s.speaker for s in segments)) if segments else 0

        return STTResult(
            segments=segments,
            duration=duration,
            speaker_count=speaker_count,
            options={
                "timestampEnabled": options.timestamp_enabled,
                "diarizationEnabled": options.diarization_enabled,
            },
        )

    async def _submit_upload(
        self, invoke_url: str, secret: str, audio_path: str,
        language: str, completion: str, options: STTOptions,
    ) -> dict:
        url = invoke_url.rstrip("/") + "/recognizer/upload"
        headers = {
            "Accept": "application/json;UTF-8",
            "X-CLOVASPEECH-API-KEY": secret,
        }

        request_body: dict = {
            "language": language,
            "completion": completion,
            "wordAlignment": options.timestamp_enabled,
            "fullText": True,
        }

        if options.diarization_enabled:
            speaker_count = options.speaker_count
            request_body["diarization"] = {
                "enable": True,
                "speakerCountMin": -1 if speaker_count == "auto" else int(speaker_count),
                "speakerCountMax": -1 if speaker_count == "auto" else int(speaker_count),
            }

        async with httpx.AsyncClient(timeout=600) as client:
            with open(audio_path, "rb") as f:
                files = {
                    "media": f,
                    "params": (
                        None,
                        json.dumps(request_body, ensure_ascii=False).encode("utf-8"),
                        "application/json",
                    ),
                }
                resp = await client.post(url, headers=headers, files=files)

        resp.raise_for_status()
        return resp.json()

    async def _poll_result(
        self, invoke_url: str, secret: str, token: str,
        on_progress: Optional[ProgressCallback] = None,
        interval: float = 2.0, timeout: float = 3600,
    ) -> dict:
        import asyncio
        import time

        url = invoke_url.rstrip("/") + f"/recognizer/{token}"
        headers = {
            "Accept": "application/json;UTF-8",
            "X-CLOVASPEECH-API-KEY": secret,
        }

        start_time = time.time()
        async with httpx.AsyncClient(timeout=60) as client:
            while True:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()

                result = (data.get("result") or "").upper()
                progress = data.get("progress", 0)

                if on_progress and progress:
                    on_progress("stt", min(30 + int(progress * 0.6), 90), f"CLOVA 처리 중... {progress}%")

                if result == "COMPLETED":
                    return data
                if result == "FAILED":
                    raise RuntimeError(f"CLOVA STT failed: {data}")

                if time.time() - start_time > timeout:
                    raise TimeoutError("CLOVA polling timed out")

                await asyncio.sleep(interval)

    def _parse_response(self, data: dict, options: STTOptions) -> list[STTSegment]:
        segments: list[STTSegment] = []

        # Try to parse segments from CLOVA response
        clova_segments = data.get("segments", [])
        if clova_segments:
            for seg in clova_segments:
                speaker = "화자1"
                if options.diarization_enabled and seg.get("diarization"):
                    speaker = seg["diarization"].get("label", "화자1")

                start_ms = seg.get("start", 0)
                end_ms = seg.get("end", 0)
                text = seg.get("text", "").strip()
                if text:
                    segments.append(STTSegment(
                        speaker=speaker,
                        start=start_ms / 1000.0,
                        end=end_ms / 1000.0,
                        text=text,
                    ))
        elif data.get("text"):
            # Fallback: just the full text
            segments.append(STTSegment(
                speaker="화자1", start=0.0, end=0.0, text=data["text"].strip()
            ))

        return segments
