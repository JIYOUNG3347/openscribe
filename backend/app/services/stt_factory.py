from app.services.stt_base import BaseSTTEngine


def get_stt_engine(engine_name: str) -> BaseSTTEngine:
    if engine_name == "whisper":
        from app.services.stt_whisper import WhisperSTTEngine

        return WhisperSTTEngine()
    elif engine_name == "clova":
        from app.services.stt_clova import ClovaSTTEngine

        return ClovaSTTEngine()
    elif engine_name == "riva":
        from app.services.stt_riva import RivaSTTEngine

        return RivaSTTEngine()
    else:
        raise ValueError(f"Unknown STT engine: {engine_name}")
