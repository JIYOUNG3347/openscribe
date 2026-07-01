import asyncio
import logging
from typing import Optional

from app.schemas.stt import STTOptions, STTResult, STTSegment
from app.services.stt_base import BaseSTTEngine, ProgressCallback

logger = logging.getLogger(__name__)


class RivaSTTEngine(BaseSTTEngine):
    """Wraps NVIDIA Riva gRPC-based STT."""

    def name(self) -> str:
        return "riva"

    async def transcribe(
        self,
        audio_path: str,
        options: STTOptions,
        on_progress: Optional[ProgressCallback] = None,
    ) -> STTResult:
        # 폼 기본값(localhost)은 컨테이너 안에서 백엔드 자신을 가리킴 → 환경변수 RIVA_SERVER 로 대체.
        # (도커: RIVA_SERVER=riva-speech:50051. 사용자가 명시 입력한 비-localhost 주소는 그대로 사용.)
        import os

        server = (options.engine_options.get("server") or "").strip()
        if not server or server.startswith(("localhost", "127.0.0.1")):
            server = os.environ.get("RIVA_SERVER", server or "localhost:50051")
        loop = asyncio.get_event_loop()

        if on_progress:
            on_progress("preprocess", 10, "Riva 서버 연결 중...")

        if on_progress:
            on_progress("stt", 30, "Riva STT 처리 중...")

        result = await loop.run_in_executor(
            None, self._offline_transcribe, audio_path, server, options
        )

        if on_progress:
            on_progress("complete", 100, "완료")

        return result

    def _offline_transcribe(self, audio_path: str, server: str, options: STTOptions) -> STTResult:
        try:
            import riva.client
        except ImportError as e:
            raise RuntimeError(
                "Riva STT는 nvidia-riva-client 설치와 별도의 NVIDIA Riva 서버(gRPC, 기본 50051)가 "
                "필요합니다. 로컬 데모에서는 'Whisper' 엔진을 사용하세요(또는 CLOVA: NAVER 키 필요)."
            ) from e

        auth = riva.client.Auth(None, False, server, None)
        asr_service = riva.client.ASRService(auth)

        language = options.engine_options.get("language_code", "ko-KR")

        config = riva.client.RecognitionConfig(
            language_code=language,
            max_alternatives=1,
            profanity_filter=False,
            enable_automatic_punctuation=True,
            enable_word_time_offsets=options.timestamp_enabled,
            verbatim_transcripts=False,
        )

        if options.diarization_enabled:
            max_speakers = options.speaker_count if isinstance(options.speaker_count, int) else 10
            riva.client.add_speaker_diarization_to_config(config, True, max_speakers)

        # Riva 는 16kHz mono WAV(헤더 포함)를 기대 → 입력(mp3 등)을 변환해 전송
        wav_path = self._to_wav16k(audio_path)
        with open(wav_path, "rb") as fh:
            data = fh.read()

        try:
            response = asr_service.offline_recognize(data, config)
            return self._parse_response(response, options)
        except Exception as e:
            msg = str(e)
            # 이 Riva 서버에 화자분리(diarizer) 모델이 배포돼 있지 않으면 INVALID_ARGUMENT
            # → 화자분리 빼고 STT-only 로 재시도(전사는 항상 완료되게).
            if options.diarization_enabled and "diariz" in msg.lower():
                logger.warning(
                    "Riva 서버에 화자분리(diarizer) 모델이 없어 STT-only 로 재시도합니다."
                )
                config_no_diar = riva.client.RecognitionConfig(
                    language_code=language,
                    max_alternatives=1,
                    profanity_filter=False,
                    enable_automatic_punctuation=True,
                    enable_word_time_offsets=options.timestamp_enabled,
                    verbatim_transcripts=False,
                )
                response = asr_service.offline_recognize(data, config_no_diar)
                opts_no_diar = options.model_copy(update={"diarization_enabled": False})
                return self._parse_response(response, opts_no_diar)
            raise

    @staticmethod
    def _to_wav16k(audio_path: str) -> str:
        """입력 오디오를 16kHz mono 16-bit PCM WAV 로 변환(Riva 입력 형식).

        ffmpeg(pcm_s16le)로 헤더 포함 표준 WAV 생성 → Riva 가 인코딩 자동 감지.
        실패 시 원본 경로 반환.
        """
        import subprocess

        out = audio_path + ".riva16k.wav"
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", audio_path, "-ar", "16000", "-ac", "1",
                 "-acodec", "pcm_s16le", "-f", "wav", out],
                check=True, capture_output=True,
            )
            return out
        except Exception:
            return audio_path

    def _parse_response(self, response, options: STTOptions) -> STTResult:
        segments: list[STTSegment] = []
        full_text_parts: list[str] = []

        for result in response.results:
            if not result.alternatives:
                continue
            alt = result.alternatives[0]
            text = alt.transcript.strip()
            if not text:
                continue

            start = 0.0
            end = 0.0
            speaker = "화자1"

            if alt.words:
                # Riva word time offsets 는 밀리초 단위 → 초로 변환
                start = alt.words[0].start_time / 1000.0
                end = alt.words[-1].end_time / 1000.0
                if options.diarization_enabled and hasattr(alt.words[0], "speaker_tag"):
                    speaker = f"화자{alt.words[0].speaker_tag}"

            segments.append(STTSegment(speaker=speaker, start=start, end=end, text=text))
            full_text_parts.append(text)

        duration = segments[-1].end if segments else 0.0
        speaker_count = len(set(s.speaker for s in segments)) if segments else 1

        return STTResult(
            segments=segments,
            duration=duration,
            speaker_count=speaker_count,
            options={
                "timestampEnabled": options.timestamp_enabled,
                "diarizationEnabled": options.diarization_enabled,
            },
        )
