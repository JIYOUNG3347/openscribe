# OpenScribe 설치 매뉴얼

AI 회의록 도구 **OpenScribe**의 설치·초기 셋업 안내입니다. 음성을 업로드하면 여러 STT 엔진으로 전사하고, 로컬/클라우드 LLM으로 회의록(요약·결정사항·액션아이템)을 자동 생성합니다.

<p align="center"><img src="images/01-landing.png" width="720" alt="OpenScribe 시작 화면"></p>

---

## 1. 사전 요구사항

| 항목 | 내용 |
|---|---|
| **OS** | Linux (Ubuntu 22.04+ 권장) / macOS / WSL2 |
| **Docker** | Docker Engine 24+ 와 Docker Compose v2 |
| **GPU (선택·권장)** | NVIDIA GPU + [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) |

> GPU 없이도 **UI 미리보기**는 가능하지만, STT(Whisper/Riva)와 빠른 LLM에는 GPU가 필요합니다.

### 최소 하드웨어 요구사항

| 사용 범위 | GPU | VRAM | RAM | 디스크 |
|---|---|---|---|---|
| UI 미리보기 | 불필요 | — | 4GB+ | ~2GB |
| + 회의록 LLM (Ollama `gemma3:4b`) | 권장 | 4GB+ | 8GB+ | ~6GB |
| + Whisper STT | **필요** | 4–6GB | 8GB+ | ~10GB |
| + Riva 화자분리 | **필요** | +7GB | 16GB+ | ~40GB |
| **전체 동시** | 필요 | **~16GB** | 16GB+ | ~50GB |

단일 20GB GPU(RTX 4000 Ada 등)에서 전체 동시 구동을 검증했습니다.

---

## 2. 빠른 설치 (원클릭) ⭐

저장소를 받은 뒤, 한 줄이면 됩니다. 모델 다운로드까지 자동 처리합니다.

```bash
git clone <YOUR_REPO_URL> openscribe && cd openscribe
bash setup.sh
```

`setup.sh`가 자동으로 수행합니다:
1. Docker·Compose·GPU 사전 점검
2. 컨테이너 이미지 빌드 + 기동 (GPU 감지 시 UI+LLM+STT 전체)
3. 회의록 LLM 모델(`gemma3:4b`, 약 3GB) 다운로드
4. 백엔드 헬스체크 후 접속 URL 안내

```bash
# 변형
bash setup.sh ui-only                  # GPU 없이 UI만
OLLAMA_MODEL=qwen2.5:7b bash setup.sh   # 다른 LLM 모델로
```

설치가 끝나면 브라우저에서 **http://localhost:3000** 접속.

---

## 3. 수동 설치

원클릭 대신 직접 제어하려면:

```bash
# 전체 스택 (GPU) — 프런트 + 백엔드(STT) + Ollama
docker compose up -d --build
docker exec openscribe-ollama ollama pull gemma3:4b   # 회의록 LLM 모델

# GPU 없는 환경 (CPU — STT/LLM 느림)
docker compose -f docker-compose.yml -f docker-compose.cpu.yml up -d --build
```

### 회의록 LLM 모델 선택

요약에는 **일반 instruct 모델**을 사용하세요:

| 권장 (일반) | 비권장 (추론/thinking) |
|---|---|
| `gemma3:4b`(기본) · `qwen2.5:7b` · `llama3.1` · `mistral` · `phi3` | `qwen3` · `qwen3.5` · `deepseek-r1` · `qwq` |

추론형 모델은 답을 내기 전에 긴 "사고"를 하여 토큰 예산을 소진 → 회의록이 비거나 부실합니다.
드롭다운에 `· 추론형(요약 비권장)` 경고가 표시되고, 빈 응답 시 안내 메시지가 나옵니다.
[ollama.com/library](https://ollama.com/library)의 이름을 그대로 입력해 pull 합니다(예: `qwen2.5:7b`).

---

## 4. STT 엔진별 셋업

| 엔진 | 준비물 | 비고 |
|---|---|---|
| **Whisper** | 기본 포함(GPU) | 로컬 전사. 가장 간단. |
| **Whisper 화자분리** | `HF_TOKEN` (pyannote 게이팅 동의) | 없으면 전사만 수행. |
| **Riva** | 별도 NVIDIA Riva 서버 | 빠른 한국어 ASR. |
| **Riva 화자분리** | Riva 서버에 diarizer 모델 배포 | 아래 참고. |
| **CLOVA** | NAVER Cloud API 키 | 설정 페이지에서 입력. |

### Whisper 화자분리 (pyannote)

[Hugging Face](https://huggingface.co/pyannote/speaker-diarization-3.1)에서 `pyannote/speaker-diarization-3.1`, `pyannote/segmentation-3.0` 라이선스에 동의하고 토큰을 발급한 뒤:

```bash
export HF_TOKEN=hf_xxx
docker compose up -d --build      # HF_TOKEN 이 백엔드로 전달됨
```

### Riva 화자분리 배포 (선택)

NVIDIA Riva Quickstart로 한국어 ASR + diarizer를 배포합니다. **NGC API 키**가 필요합니다(ngc.nvidia.com).

```bash
cd riva_quickstart_2.19.0
# config.sh 에서 화자분리 활성화
#   deploy_offline_diarizer=true
bash riva_init.sh      # NGC 키 입력 → 모델 다운로드 + 엔진 빌드 (수십 분)
bash riva_start.sh     # 서버 기동 (이미 떠 있으면: docker restart riva-speech)
# 앱 네트워크에 연결
docker network connect openscribe_openscribe-net riva-speech
```

업로드 시 엔진 = **Riva**, 화자분리 체크 → 화자 1/2/3… 로 분리됩니다.

---

## 5. 설치 확인

브라우저 접속 후 **설정 페이지**에서 "시스템 상태" 카드로 준비 상태를 한눈에 확인합니다.

<p align="center"><img src="images/04-settings.png" width="760" alt="설정 — 시스템 상태"></p>

- 🟢 **회의록 LLM** — Ollama/OpenAI 준비됨
- 🟢 **GPU / Whisper STT / Riva STT** — 사용 가능/연결됨
- ⚪ **HF 토큰 / OpenAI 키** — 선택(설정 시 화자분리/클라우드 LLM 사용)

설정 페이지의 **Ollama 모델 관리**에서 모델을 추가(pull)·삭제할 수 있습니다.

---

## 6. 사용하기

1. **대시보드** → 우상단 **새 회의록** → 오디오 업로드, 엔진·옵션 선택
2. 처리(전사 → 화자분리 → 회의록 생성)가 끝나면 결과 화면으로 이동
3. 회의록을 확인·수정하고 **Markdown / PDF / DOCX**로 내보내기

<p align="center"><img src="images/02-dashboard.png" width="760" alt="대시보드"></p>

---

## 7. 문제 해결

| 증상 | 해결 |
|---|---|
| `port is already allocated` | 기존 컨테이너 종료: `docker compose down` 후 재기동 |
| 회의록 생성 `Connection error` | LLM 미기동 — `docker exec openscribe-ollama ollama pull gemma3:4b` |
| 회의록이 비거나 부실 | **추론형 모델**(qwen3/qwen3.5/deepseek-r1) 사용 중 — `gemma3:4b`·`qwen2.5` 로 변경 |
| 모델 pull 시 "더 최신 Ollama 필요" | `docker pull ollama/ollama:latest` 후 `docker compose up -d ollama` |
| Riva `Unavailable diarizer model` | diarizer 미배포 — 4절 Riva 화자분리 배포(없으면 전사만 수행) |
| Riva 새 모델 미반영 | `docker restart riva-speech` (riva_start가 "already running" 스킵 시) |
| 화자분리 안 됨(Whisper) | `HF_TOKEN` 설정 + pyannote 라이선스 동의 |

---

## 8. 중지 / 제거

```bash
docker compose down       # 중지 (데이터 보존)
docker compose down -v    # 완전 삭제 (볼륨 포함 — 회의 데이터·모델 캐시까지)
```

---

자세한 시스템 구조는 **[SYSTEM.md](SYSTEM.md)** 를 참고하세요.
