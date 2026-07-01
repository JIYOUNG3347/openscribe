# OpenScribe backend — STT(Whisper GPU) + LLM 클라이언트 + 내보내기(PDF/DOCX).
FROM python:3.12-slim

WORKDIR /app

# 오디오 디코딩(ffmpeg/libsndfile) + WeasyPrint(PDF) 시스템 라이브러리 + 빌드 의존
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg libsndfile1 git \
      libpango-1.0-0 libpangoft2-1.0-0 libpangocairo-1.0-0 \
      libgdk-pixbuf-2.0-0 libffi-dev libharfbuzz0b shared-mime-info \
      fonts-dejavu-core fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# CUDA torch 스택(기본 PyPI = cu wheel). Whisper STT 를 GPU 로(컨테이너 GPU 접근 시).
RUN pip install --no-cache-dir torch==2.6.0 torchaudio==2.6.0 torchvision==0.21.0

# 앱 + 의존성: STT(whisper) + LLM(openai 호환) + 내보내기(weasyprint/docx)
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir -e ".[whisper,llm,export]"

# Riva 클라이언트(선택 — 별도 NVIDIA Riva 서버 사용 시)
RUN pip install --no-cache-dir "nvidia-riva-client==2.19.0"

RUN mkdir -p data/uploads data/processed seed

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
