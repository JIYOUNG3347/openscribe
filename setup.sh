#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# OpenScribe — 원클릭 셋업
#   bash setup.sh                          # GPU 자동 감지, 전체 스택 + 모델 다운로드
#   OLLAMA_MODEL=qwen2.5:7b bash setup.sh   # 회의록 LLM 모델 지정
#
# Riva(화자분리 STT)는 별도 NVIDIA Riva 배포가 필요합니다 → docs/INSTALL.md 참고.
# ──────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

OLLAMA_MODEL="${OLLAMA_MODEL:-gemma3:4b}"

c(){ printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
info(){ c "1;36" "▶ $1"; }
ok(){ c "1;32" "✓ $1"; }
warn(){ c "1;33" "! $1"; }
die(){ c "1;31" "✗ $1"; exit 1; }

# 1) 사전 요구사항
command -v docker >/dev/null 2>&1 || die "Docker 가 필요합니다. https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 가 필요합니다."
docker info >/dev/null 2>&1 || die "Docker 데몬에 접근할 수 없습니다(권한/실행 확인)."

# 2) GPU 감지 (nvidia container runtime)
FILES=(-f docker-compose.yml)
if docker info 2>/dev/null | grep -qiE 'Runtimes:.*nvidia' || \
   docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi >/dev/null 2>&1; then
  info "GPU 감지 — STT(Whisper)·LLM 을 GPU 로 구동"
else
  FILES+=(-f docker-compose.cpu.yml)
  warn "GPU 미감지 — CPU 모드로 구동(STT/LLM 느림). GPU 권장: docs/INSTALL.md"
fi

# 3) 빌드 + 기동
info "이미지 빌드 + 컨테이너 기동 (최초 빌드는 수 분 소요)..."
docker compose "${FILES[@]}" up -d --build

# 4) 백엔드 헬스 대기
info "백엔드 헬스체크..."
for i in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' openscribe-backend 2>/dev/null)" = "healthy" ] && break
  sleep 2
done

# 5) 회의록 LLM 모델 자동 다운로드
info "LLM 모델 다운로드: ${OLLAMA_MODEL} (최초 1회, 약 2~5GB)..."
for i in $(seq 1 20); do docker exec openscribe-ollama ollama list >/dev/null 2>&1 && break; sleep 2; done
docker exec openscribe-ollama ollama pull "${OLLAMA_MODEL}" && ok "LLM 준비: ${OLLAMA_MODEL}"

# 6) 요약
echo
ok "OpenScribe 준비 완료 →  http://localhost:3000"
echo "   • 회의록 LLM : ollama/${OLLAMA_MODEL} (설정 페이지에서 추가/변경)"
echo "   • STT        : Whisper. Riva 화자분리는 별도 배포(docs/INSTALL.md)"
echo "   • 화자분리    : Whisper=HF_TOKEN(pyannote) / Riva=NGC 배포"
echo "   • 시스템 상태 : 앱 설정 페이지의 '시스템 상태' 카드"
echo
echo "   중지: docker compose ${FILES[*]} down    |    로그: docker compose ${FILES[*]} logs -f"
