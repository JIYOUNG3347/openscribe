#!/bin/bash
# OpenScribe 개발 모드 실행 스크립트
# 프론트엔드(Vite) + 백엔드(FastAPI) 동시 실행

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# .env 파일 확인
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo "[!] .env 파일이 없습니다. .env.example을 복사합니다..."
  cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
  echo "[!] .env 파일에 API 키를 입력해주세요."
  exit 1
fi

# 백엔드 실행
echo "[1/2] 백엔드 서버 시작 (http://localhost:8000)..."
cd "$SCRIPT_DIR/backend"
export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# 프론트엔드 실행
echo "[2/2] 프론트엔드 서버 시작 (http://localhost:3000)..."
cd "$SCRIPT_DIR"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "==================================="
echo "  OpenScribe 개발 서버 실행 완료"
echo "  프론트엔드: http://localhost:3000"
echo "  백엔드 API: http://localhost:8000"
echo "  종료: Ctrl+C"
echo "==================================="
echo ""

# Ctrl+C 시 모든 프로세스 종료
cleanup() {
  echo ""
  echo "서버를 종료합니다..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

wait
