#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────
# UI 확인 전용 백엔드 엔트리포인트 (멱등 — 재기동해도 중복/리셋 없음)
#   1) 테이블 생성
#   2) 시드 mp3 복사 (없을 때만)
#   3) seed-demo 회의 INSERT (없을 때만)
#   4) uvicorn 실행
# ──────────────────────────────────────────────────────────────────────────
set -eu

# 디버그: 실제로 어떤 DB 파일을 쓰는지 출력 (create_tables/seed/uvicorn 모두 이 URL 공유)
echo "[entrypoint] DB URL = $(python -c 'from app.config import settings; print(settings.DATABASE_URL)')"

echo "[entrypoint] (1/4) creating tables + auto-migrating (seed 전에 컬럼 보충)..."
# 모델 import 로 metadata 등록 → create_tables → run_migrations(누락 컬럼 ADD).
# create_tables/run_migrations 를 한 이벤트 루프에서 실행(엔진 cross-loop 회피).
python - <<'PY'
import asyncio
import app.models.meeting, app.models.template, app.models.setting  # noqa: F401  metadata 등록
from app.database import create_tables, run_migrations

async def main():
    await create_tables()    # 신규 DB: 전체 컬럼 생성
    await run_migrations()   # 기존 DB: 누락 컬럼(speaker_names 등) ADD (멱등)

asyncio.run(main())
PY
ls -la /app/data/*.db 2>/dev/null || true

# 2) 시드 오디오 복사 — 경로는 변수(SEED_AUDIO_PATH), 파일 없으면 경고만.
SEED_AUDIO_PATH="${SEED_AUDIO_PATH:-/app/seed/seed-demo.mp3}"
DEST="/app/data/uploads/seed-demo.mp3"
echo "[entrypoint] (2/4) seed audio..."
if [ ! -f "$DEST" ]; then
  if [ -f "$SEED_AUDIO_PATH" ]; then
    cp "$SEED_AUDIO_PATH" "$DEST"
    echo "[entrypoint]     copied $SEED_AUDIO_PATH -> $DEST"
  else
    echo "[entrypoint]     WARN: seed audio not found at $SEED_AUDIO_PATH"
    echo "[entrypoint]     → UI/회의는 정상 로드, 플레이어 재생만 404."
  fi
else
  echo "[entrypoint]     already present: $DEST"
fi

# 3) 데모 completed 회의 시드 (실제 ORM 모델 사용 → 컬럼/타입 100% 일치, 멱등)
echo "[entrypoint] (3/4) seeding demo meeting..."
python - <<'PYEOF'
import asyncio
# 멱등 안전망: 모델 import 후 동일 엔진/URL 로 테이블 보장 (step 1 과 같은 settings.DATABASE_URL)
import app.models.template  # noqa: F401  (full schema 등록)
import app.models.setting   # noqa: F401
from app.database import get_db_session, create_tables
from app.models.meeting import Meeting, MeetingStatus

SEGMENTS = [
    {"speaker": "SPEAKER_00", "start": 0.0,  "end": 4.5,  "text": "안녕하세요, 오늘 디자인 시스템 리뷰 회의를 시작하겠습니다."},
    {"speaker": "SPEAKER_01", "start": 4.5,  "end": 9.0,  "text": "네, 먼저 ResultPage 전사 클릭 UX 변경부터 확인하면 좋겠습니다."},
    {"speaker": "SPEAKER_00", "start": 9.0,  "end": 14.0, "text": "이제 본문 텍스트는 자유롭게 드래그해서 선택하고 복사할 수 있어요."},
    {"speaker": "SPEAKER_02", "start": 14.0, "end": 19.0, "text": "타임스탬프 버튼을 눌렀을 때만 그 지점부터 재생되도록 좁혔습니다."},
    {"speaker": "SPEAKER_01", "start": 19.0, "end": 24.0, "text": "키보드로 포커스해서 Enter나 Space를 눌러도 동일하게 동작합니다."},
    {"speaker": "SPEAKER_00", "start": 24.0, "end": 29.0, "text": "현재 재생 중인 줄은 왼쪽 인디고 바와 옅은 배경으로 강조됩니다."},
    {"speaker": "SPEAKER_02", "start": 29.0, "end": 34.0, "text": "자동 스크롤은 전사 패널 내부에서만 일어나 페이지가 튀지 않아요."},
    {"speaker": "SPEAKER_01", "start": 34.0, "end": 39.0, "text": "두 번째 변경은 패널 높이를 flex 기반으로 바꾼 부분입니다."},
    {"speaker": "SPEAKER_00", "start": 39.0, "end": 43.0, "text": "calc(100vh-210px) 같은 매직넘버를 전부 제거했습니다."},
    {"speaker": "SPEAKER_02", "start": 43.0, "end": 47.0, "text": "데스크톱은 2-pane, 좁은 화면은 전사/회의록 탭으로 전환됩니다."},
    {"speaker": "SPEAKER_01", "start": 47.0, "end": 50.5, "text": "하단 플레이어 바는 콘텐츠를 가리지 않고 밀어 올립니다."},
    {"speaker": "SPEAKER_00", "start": 50.5, "end": 53.5, "text": "스크롤도 각 패널 안에서만 독립적으로 동작합니다."},
    {"speaker": "SPEAKER_02", "start": 53.5, "end": 57.0, "text": "좋습니다, 그럼 로컬에서 직접 확인해 보겠습니다."},
]

TRANSCRIPTION = {
    "segments": SEGMENTS,
    "options": {"timestampEnabled": True, "diarizationEnabled": True},
}

NOTES = """# [데모] 디자인 시스템 리뷰 회의

## 핵심 요약
- ResultPage 전사 클릭 UX 개선(타임스탬프만 seek, 본문 자유 선택)
- 패널 높이를 flex 기반으로 전환(매직넘버 제거, 100dvh)

## 결정 사항
- 데스크톱은 2-pane, 좁은 화면은 전사/회의록 탭 구조를 채택한다.
- 하단 플레이어 바는 flex 푸터로 두어 콘텐츠를 밀어 올린다.

## Action Items
- [ ] 모바일 탭 전환 QA [@이몽룡 ~07/15]
- [ ] 다크 모드에서 활성 줄 대비 확인 [@홍길동 ~06/20]
- [x] tsc/build 게이트 통과 확인 [@김철수 ~06/10]
"""


async def main():
    await create_tables()  # 멱등 — 앱이 보는 그 DB(같은 URL)에 테이블 보장
    async with get_db_session() as session:
        if await session.get(Meeting, "seed-demo"):
            print("[seed] seed-demo already exists — skip")
            return
        session.add(
            Meeting(
                id="seed-demo",
                title="[데모] 디자인 시스템 리뷰 회의",
                date="2026-06-23",
                engine="whisper",
                duration=57.0,
                speaker_count=3,
                status=MeetingStatus.completed,
                progress=100,
                audio_file_path="./data/uploads/seed-demo.mp3",
                stt_options={"timestamp_enabled": True, "diarization_enabled": True},
                transcription=TRANSCRIPTION,
                notes=NOTES,
            )
        )
        print("[seed] inserted seed-demo (completed, 3 speakers, 57s)")


asyncio.run(main())
PYEOF

echo "[entrypoint] (4/4) starting uvicorn on :8000"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
