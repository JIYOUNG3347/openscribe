import asyncio
import logging
import os
from typing import Optional

from app.schemas.stt import STTOptions, STTResult, STTSegment
from app.services.stt_base import BaseSTTEngine, ProgressCallback

logger = logging.getLogger(__name__)


class WhisperSTTEngine(BaseSTTEngine):
    """Wraps eev3.py Whisper + pyannote logic."""

    # Module-level cache: avoid re-loading heavy models on every call
    _model_cache: dict[str, tuple] = {}  # model_id -> (pipe, device)
    _diarization_cache: object | None = None

    def name(self) -> str:
        return "whisper"

    async def transcribe(
        self,
        audio_path: str,
        options: STTOptions,
        on_progress: Optional[ProgressCallback] = None,
    ) -> STTResult:
        loop = asyncio.get_event_loop()

        # Fetch HF token once — used for model downloads and diarization
        from app.services.settings_service import get_setting
        hf_token = await get_setting("HUGGING_FACE_TOKEN")
        if hf_token:
            os.environ["HF_TOKEN"] = hf_token

        # Step 1: Audio preprocessing
        if on_progress:
            on_progress("preprocess", 5, "오디오 전처리 중...")
        processed_path = await loop.run_in_executor(None, self._preprocess_audio, audio_path)

        # Step 2: Whisper STT — load model (may download on first run)
        model_id = self._resolve_model_id(options)
        return_timestamps = options.timestamp_enabled

        is_cached = model_id in self._model_cache
        if on_progress:
            if is_cached:
                on_progress("stt", 15, "STT 모델 준비 중...")
            else:
                on_progress("stt", 10, "STT 모델 다운로드/로딩 중 (최초 1회)...")

        await loop.run_in_executor(
            None, self._get_whisper_pipeline, model_id, return_timestamps
        )

        if on_progress:
            on_progress("stt", 20, "STT 변환 중...")

        df_stt = await loop.run_in_executor(
            None, self._run_whisper, processed_path, model_id, return_timestamps
        )

        if on_progress:
            on_progress("stt", 50, "STT 변환 완료")

        # Step 3: Speaker diarization (optional)
        segments: list[STTSegment] = []
        speaker_count = 1

        # 화자 분리는 best-effort: 토큰 없거나(게이팅) 로드/실행 실패 시 에러 대신 STT-only.
        diar_done = False
        if options.diarization_enabled and not hf_token:
            logger.warning("Diarization requested but HUGGING_FACE_TOKEN is not set → STT only.")
        elif options.diarization_enabled and hf_token:
            try:
                if on_progress:
                    on_progress("diarization", 55, "화자 분리 중...")
                df_diarization = await loop.run_in_executor(
                    None, self._run_diarization, processed_path, hf_token
                )
                if on_progress:
                    on_progress("diarization", 85, "STT + 화자 분리 병합 중...")
                df_merged = self._merge(df_stt, df_diarization)
                segments = self._df_to_segments(df_merged, has_speakers=True)
                speaker_count = df_diarization["speaker_id"].nunique()
                diar_done = True
            except Exception as e:
                logger.warning(
                    "Diarization failed (%s) → STT only(화자 미분리). pyannote 게이팅: HF에서 "
                    "pyannote/speaker-diarization-3.1 & segmentation-3.0 동의 + 유효 토큰 필요.", e
                )
        if not diar_done:
            segments = self._df_to_segments(df_stt, has_speakers=False)

        if on_progress:
            on_progress("complete", 100, "완료")

        duration = segments[-1].end if segments else 0.0
        return STTResult(
            segments=segments,
            duration=duration,
            speaker_count=speaker_count,
            options={
                "timestampEnabled": options.timestamp_enabled,
                "diarizationEnabled": options.diarization_enabled,
            },
        )

    # --- Private methods (adapted from eev3.py) ---

    def _resolve_model_id(self, options: STTOptions) -> str:
        model = options.engine_options.get("model", "large-v3")
        if not model.startswith("openai/"):
            model = f"openai/whisper-{model}"
        return model

    def _preprocess_audio(self, audio_path: str) -> str:
        """Convert audio to WAV for compatibility (from eev3.preprocess_audio)."""
        import torchaudio

        try:
            waveform, sample_rate = torchaudio.load(audio_path)
            output_dir = os.path.dirname(audio_path)
            base = os.path.splitext(os.path.basename(audio_path))[0]
            wav_path = os.path.join(output_dir, f"{base}_processed.wav")
            torchaudio.save(wav_path, waveform, sample_rate)
            return wav_path
        except Exception as e:
            logger.warning("Audio preprocessing failed, using original: %s", e)
            return audio_path

    @classmethod
    def _get_whisper_pipeline(cls, model_id: str, return_timestamps: bool):
        """Get or create a cached Whisper pipeline."""
        import torch
        from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

        if model_id in cls._model_cache:
            cached_pipe, device = cls._model_cache[model_id]
            logger.info("Using cached Whisper model: %s", model_id)
            return cached_pipe

        logger.info("Loading Whisper model: %s (first time, may take a while)...", model_id)
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        compute_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

        model = AutoModelForSpeechSeq2Seq.from_pretrained(
            model_id, torch_dtype=compute_dtype, low_cpu_mem_usage=True, use_safetensors=True
        )
        model.to(device)
        processor = AutoProcessor.from_pretrained(model_id)

        pipe = pipeline(
            "automatic-speech-recognition",
            model=model,
            tokenizer=processor.tokenizer,
            feature_extractor=processor.feature_extractor,
            torch_dtype=compute_dtype,
            device=device,
            return_timestamps=return_timestamps,
            chunk_length_s=15,
            stride_length_s=2,
        )

        cls._model_cache[model_id] = (pipe, device)
        logger.info("Whisper model cached: %s on %s", model_id, device)
        return pipe

    def _run_whisper(self, audio_path: str, model_id: str, return_timestamps: bool):
        """Run Whisper STT (from eev3.whisper_stt)."""
        import pandas as pd

        pipe = self._get_whisper_pipeline(model_id, return_timestamps)
        result = pipe(audio_path)

        if return_timestamps:
            rows = [
                [chunk["timestamp"][0], chunk["timestamp"][1], chunk["text"].strip()]
                for chunk in result["chunks"]
            ]
            df = pd.DataFrame(rows, columns=["start", "end", "text"])
        else:
            df = pd.DataFrame([{"start": 0.0, "end": 0.0, "text": result["text"].strip()}])

        return df

    @classmethod
    def _get_diarization_pipeline(cls, token: str):
        """Get or create a cached diarization pipeline."""
        import torch

        if cls._diarization_cache is not None:
            logger.info("Using cached diarization pipeline")
            return cls._diarization_cache

        # Compat patch: pyannote 3.x passes 'use_auth_token' to hf_hub_download,
        # but huggingface_hub >= 1.0 removed that parameter.
        import huggingface_hub
        _orig_download = huggingface_hub.hf_hub_download
        def _compat_download(*args, **kwargs):
            if 'use_auth_token' in kwargs:
                kwargs['token'] = kwargs.pop('use_auth_token')
            return _orig_download(*args, **kwargs)
        huggingface_hub.hf_hub_download = _compat_download

        # Note: torch.load weights_only patch is applied at module level in main.py

        from pyannote.audio import Pipeline

        logger.info("Loading diarization pipeline (first time)...")
        diarization_pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1", use_auth_token=token
        )
        if diarization_pipeline is None:
            # pyannote 는 게이팅/권한 실패 시 예외 대신 None 을 반환함
            raise RuntimeError(
                "pyannote/speaker-diarization-3.1 로드 실패 — HF에서 해당 모델과 "
                "pyannote/segmentation-3.0 라이선스에 동의하고 유효한 토큰을 설정하세요."
            )
        if torch.cuda.is_available():
            diarization_pipeline.to(torch.device("cuda"))

        cls._diarization_cache = diarization_pipeline
        logger.info("Diarization pipeline cached")
        return diarization_pipeline

    def _run_diarization(self, audio_path: str, token: str = ""):
        """Run pyannote speaker diarization (from eev3.speaker_diarization)."""
        import pandas as pd

        if not token:
            raise ValueError("HUGGING_FACE_TOKEN is required for speaker diarization")

        diarization_pipeline = self._get_diarization_pipeline(token)
        diarization_result = diarization_pipeline(audio_path)

        # Parse diarization result into DataFrame
        rows = []
        for turn, _, speaker in diarization_result.itertracks(yield_label=True):
            rows.append({"start": turn.start, "end": turn.end, "speaker_id": speaker})

        df = pd.DataFrame(rows)
        if df.empty:
            return df

        # Group consecutive segments by same speaker
        df["group"] = (df["speaker_id"] != df["speaker_id"].shift()).cumsum()
        df_grouped = (
            df.groupby("group")
            .agg(start=("start", "min"), end=("end", "max"), speaker_id=("speaker_id", "first"))
            .reset_index(drop=True)
        )
        return df_grouped

    def _merge(self, df_stt, df_diarization):
        """Merge STT text with speaker segments (from eev3.merge_stt_and_diarization)."""
        df_diarization = df_diarization.copy()
        df_diarization["text"] = ""

        for _, row_stt in df_stt.iterrows():
            best_idx = None
            best_overlap = 0
            for i, row_d in df_diarization.iterrows():
                overlap = max(
                    0, min(row_stt["end"], row_d["end"]) - max(row_stt["start"], row_d["start"])
                )
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_idx = i
            if best_idx is not None and best_overlap > 0:
                df_diarization.at[best_idx, "text"] += row_stt["text"] + " "

        df_diarization["text"] = df_diarization["text"].str.strip()
        return df_diarization

    def _df_to_segments(self, df, has_speakers: bool) -> list[STTSegment]:
        segments = []
        for _, row in df.iterrows():
            text = row.get("text", "")
            if not text:
                continue
            segments.append(
                STTSegment(
                    speaker=row.get("speaker_id", "화자1") if has_speakers else "화자1",
                    start=float(row.get("start", 0)),
                    end=float(row.get("end", 0)),
                    text=text,
                )
            )
        return segments
