import logging
from typing import Any

from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)


class NotesService:
    """Generates meeting notes from transcription using templates + LLM."""

    def __init__(self):
        self.llm = LLMService()

    async def generate_notes(
        self,
        segments: list[dict],
        template_sections: list[dict],
        model_id: str,
        meeting_title: str,
        meeting_date: str,
    ) -> str:
        transcript_text = self._format_transcript(segments)

        parts: list[str] = []
        parts.append(f"# {meeting_title}")
        parts.append(f"**일시**: {meeting_date}\n")

        speakers = sorted(set(s.get("speaker", "화자1") for s in segments))
        if speakers:
            parts.append(f"**참석자**: {', '.join(speakers)}\n")

        for section in template_sections:
            section_type = section.get("type", "raw_transcript")
            label = section.get("label", "")
            hlevel = section.get("heading_level", 2)
            hprefix = "#" * max(1, min(4, hlevel))
            color = section.get("color")

            color_marker = f"<!-- section-color:{color} -->\n" if color else ""

            if section_type == "raw_transcript":
                parts.append(f"\n{color_marker}{hprefix} {label}\n")
                parts.append(transcript_text)
            elif section_type == "llm_generate":
                prompt = section.get("prompt", "")
                # 전사(컨텍스트) 먼저, 지시를 맨 끝에 둬야 모델이 '이어서 답'을 생성한다.
                # (지시를 앞에 두고 전사를 끝에 두면 약한 모델은 전사를 그대로 echo 함)
                system_prompt = (
                    "당신은 회의록 작성 전문가입니다. 주어진 회의 발화록만 근거로 "
                    "지시를 정확히 수행해 한국어로 간결하게 작성합니다."
                )
                user_content = (
                    f"# 회의 발화록\n{transcript_text}\n\n"
                    f"# 지시\n{prompt}\n\n"
                    "규칙: 위 발화록 내용만 근거로 위 지시를 수행하세요. "
                    "발화록 문장을 그대로 옮겨 적지 말고 요약·정리하세요. "
                    "마크다운으로 작성하되 섹션 제목(헤딩)은 넣지 마세요."
                )
                try:
                    result = await self.llm.generate(model_id, system_prompt, user_content)
                    parts.append(f"\n{color_marker}{hprefix} {label}\n")
                    parts.append(result.strip())
                except Exception as e:
                    logger.error("LLM generation failed for section '%s': %s", label, e)
                    parts.append(f"\n{color_marker}{hprefix} {label}\n")
                    parts.append(f"*생성 실패: {e}*")

        return "\n".join(parts)

    def _format_transcript(self, segments: list[dict]) -> str:
        lines = []
        for seg in segments:
            start = seg.get("start", 0)
            end = seg.get("end", 0)
            speaker = seg.get("speaker", "")
            text = seg.get("text", "")
            timestamp = f"[{self._fmt(start)}-{self._fmt(end)}]"
            lines.append(f"{timestamp} {speaker}: {text}")
        return "\n".join(lines)

    @staticmethod
    def _fmt(seconds: float) -> str:
        m, s = divmod(int(seconds), 60)
        return f"{m:02d}:{s:02d}"
