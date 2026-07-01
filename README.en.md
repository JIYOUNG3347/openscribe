# OpenScribe

English · [한국어](README.md)

OpenScribe transcribes meeting audio and turns it into structured notes — summary, decisions, and
action items — with an LLM. You choose the STT engine (Whisper, NVIDIA Riva, or NAVER CLOVA) and the
summarization model (local Ollama or OpenAI).

<p align="center">
  <img src="docs/images/03-result.png" width="880" alt="OpenScribe — transcript and generated notes side by side">
</p>

## Features

- Choice of STT engine — Whisper (local), NVIDIA Riva, NAVER CLOVA
- Choice of summarization LLM — local Ollama (`gemma3:4b`, etc.) or OpenAI
- Speaker diarization with pyannote (optional)
- Transcript synced to audio — waveform player; click a timestamp to seek
- Template-based notes with checkbox action items
- Export to PDF / DOCX / Markdown

## Stack

- Backend — FastAPI + SQLite (async)
- Frontend — React + TypeScript + Vite + Tailwind CSS

## Setup

You'll need Docker and, ideally, an NVIDIA GPU.

One command:

```bash
bash setup.sh
```

It detects the GPU, brings up the whole stack, and pulls the default model (`gemma3:4b`). Then open
http://localhost:3000.

Or run it manually:

```bash
docker compose up -d --build
docker exec openscribe-ollama ollama pull gemma3:4b   # summarization model
```

Without a GPU:

```bash
docker compose -f docker-compose.yml -f docker-compose.cpu.yml up -d --build
```

See [docs/INSTALL.md](docs/INSTALL.md) for hardware requirements, detailed setup, and troubleshooting,
and [docs/SYSTEM.md](docs/SYSTEM.md) for how it's put together.

### A note on summarization models

General instruct models — `gemma3:4b`, `qwen2.5`, `llama3.1`, `mistral` — work well for meeting notes.
Reasoning ("thinking") models like `qwen3` or `deepseek-r1` spend their token budget thinking before
answering, so notes often come out empty or thin. They aren't recommended, and the UI warns you when
you pick one.

## Model & service licenses

Models and STT servers aren't bundled in this repo — they're downloaded or connected at runtime, and
you are responsible for complying with their licenses.

- Whisper — OpenAI, MIT
- NVIDIA Riva — NVIDIA commercial license, distributed via [NGC](https://catalog.ngc.nvidia.com/) (optional)
- pyannote — MIT code, gated models (needs a Hugging Face token)
- Gemma (`gemma3:4b`) — Google [Gemma Terms of Use](https://ai.google.dev/gemma/terms)
- Qwen2.5 / Llama / Mistral, etc. — their respective licenses
- CLOVA Speech — NAVER Cloud commercial API (optional)

## License

The code in this project is MIT licensed. See [LICENSE](LICENSE).
© 2026 Jiyoung Choi (최지영)
