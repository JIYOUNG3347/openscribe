import logging

from app.services.settings_service import get_setting

logger = logging.getLogger(__name__)

PROVIDER_MAP = {
    "gpt-4o": ("openai", "gpt-4o"),
    "gpt-4o-mini": ("openai", "gpt-4o-mini"),
}


class LLMService:
    """Unified LLM interface supporting OpenAI and Ollama."""

    async def generate(self, model_id: str, system_prompt: str, user_content: str) -> str:
        # Ollama (OpenAI-compatible /v1, prefixed with "ollama/")
        if model_id.startswith("ollama/"):
            ollama_model = model_id[len("ollama/"):]
            return await self._call_ollama(ollama_model, system_prompt, user_content)

        # OpenAI cloud models
        if model_id in PROVIDER_MAP:
            provider, actual_model = PROVIDER_MAP[model_id]
            if provider == "openai":
                return await self._call_openai(actual_model, system_prompt, user_content)

        # Default: any OpenAI-compatible local server at LLM_BASE_URL (vLLM / Ollama / etc.)
        return await self._call_local(model_id, system_prompt, user_content)

    async def _call_openai(self, model: str, system_prompt: str, user_content: str) -> str:
        from openai import AsyncOpenAI

        api_key = await get_setting("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OpenAI API Key가 설정되지 않았습니다. 설정 페이지에서 입력해주세요.")
        client = AsyncOpenAI(api_key=api_key)
        response = await client.chat.completions.create(
            model=model,
            temperature=0.0,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
        )
        return self._ensure_content(response.choices[0].message.content or "")

    async def _call_local(self, model: str, system_prompt: str, user_content: str) -> str:
        """Any OpenAI-compatible local server (vLLM, Ollama /v1). No cloud key needed.

        Gemma-based models reject a separate 'system' role (vLLM → 400 "System role
        not supported"), so the system prompt is merged into the user message.
        """
        from openai import AsyncOpenAI

        base_url = await get_setting("LLM_BASE_URL") or "http://localhost:8001/v1"
        api_key = await get_setting("LLM_API_KEY") or "EMPTY"  # local servers ignore it
        merged = f"{system_prompt}\n\n{user_content}" if system_prompt else user_content
        client = AsyncOpenAI(base_url=base_url, api_key=api_key)
        # 일부 작은 instruct 모델(예: Gemma 파생)은 chat 에서 정지 토큰(eos/<end_of_turn>)을
        # 제대로 못 내고 max_tokens 까지 폭주할 수 있음. greedy 로 예측가능하게 만든 뒤
        # max_tokens 를 줄이고, 누출/반복을 후처리(_strip_runaway)로 잘라낸다.
        response = await client.chat.completions.create(
            model=model,
            temperature=0.0,
            max_tokens=512,  # 섹션당 충분. 폭주 시 garbage 분량 자체를 제한
            stop=["\nmodel", "\n# ", "\n규칙:"],
            extra_body={"stop_token_ids": [106]},  # 혹시 진짜 <end_of_turn> 을 내면 그때도 정지
            messages=[{"role": "user", "content": merged}],
        )
        return self._ensure_content(self._strip_runaway(response.choices[0].message.content or ""))

    @staticmethod
    def _ensure_content(text: str) -> str:
        """빈 응답(주로 추론형 모델이 사고에 토큰을 소진) 시 명확한 안내로 실패."""
        if not text.strip():
            raise ValueError(
                "모델이 빈 응답을 반환했습니다. 추론(thinking)형 모델은 요약 전에 사고에 토큰을 소진해 "
                "회의록 생성에 부적합할 수 있습니다 — gemma3:4b·qwen2.5 등 일반 모델을 사용하세요."
            )
        return text

    @staticmethod
    def _strip_runaway(text: str) -> str:
        """로컬 모델이 정지 토큰을 못 내고 폭주할 때의 누출/반복을 후처리로 제거(안전망)."""
        import re

        markers = (
            "\nmodel", "\n# ", "\n회의 발화록", "# 회의 발화록", "\n규칙:", "\n# 지시",
            "\n참고자료", "\n출처:", "\n저작권", "\n<", "<start_of_turn>", "<end_of_turn>",
            "```", "</", "<br", "<div", "<script", "요약하면 다음과 같습니다:",
        )
        cut = len(text)
        for mk in markers:
            i = text.find(mk)
            if i != -1:
                cut = min(cut, i)
        text = text[:cut]

        # 규칙(프롬프트) 에코로 흔히 나오는 메타 문구 → 해당 줄만 제거.
        rule_echo = (
            "섹션 제목은", "발화록 내용만", "마크다운 형식", "한국어로 작성되었",
            "요약과 정리가 포함", "목록으로 정리했", "마크다운으로 작성",
        )
        # 정규화(숫자→N) 후 같은 패턴 라인이 재등장하면 그 지점에서 절단.
        # → 정확 반복("- 마크다운 형식…")과 증가 패턴("화자1, 화자2 …")을 모두 차단.
        norm = lambda s: re.sub(r"\d+", "N", s.strip())
        seen: dict[str, int] = {}
        out: list[str] = []
        for line in text.split("\n"):
            s = line.strip()
            if len(s) > 4 and any(p in s for p in rule_echo):
                continue
            if len(s) > 4:
                k = norm(s)
                seen[k] = seen.get(k, 0) + 1
                if seen[k] >= 2:
                    break
            out.append(line)
        return "\n".join(out).strip()

    async def _call_ollama(self, model: str, system_prompt: str, user_content: str) -> str:
        from openai import AsyncOpenAI

        base_url = await get_setting("OLLAMA_BASE_URL") or "http://localhost:11434"
        # Ollama exposes an OpenAI-compatible API at /v1
        client = AsyncOpenAI(base_url=f"{base_url}/v1", api_key="ollama")
        response = await client.chat.completions.create(
            model=model,
            temperature=0.0,
            max_tokens=1024,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
        )
        return self._ensure_content(response.choices[0].message.content or "")
