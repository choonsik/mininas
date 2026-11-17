# MiniNAS (v0.7)

구형 2011 Mac mini(macOS High Sierra 10.13+)를 모니터 없는 헤드리스 홈 NAS로 활용하기 위한 초경량 독립형(Standalone) 웹 애플리케이션입니다.

Docker나 외부 런타임 의존성 없이 단일 바이너리(Pure Go, CGO=0)로 구동합니다. React 프론트엔드가 바이너리에 내장되어 배포와 운영이 단순합니다.

---

## 핵심 기능 (v0.5)

### 1. 무손실 동영상 스트리밍 & 스마트 버퍼링 (NEW in v0.5)
- **화질 손실 0% (100% 원본 유지)**: 고화질(1080p, 4K) 영상을 압축하거나 해상도를 강제로 낮추지 않고 완벽한 원본 화질 그대로 감상합니다.
- **안티 채터링(Anti-Chattering) 안전 버퍼 회복**: 네트워크 일시 지연 시 0.5초마다 멈추는 반복 현상을 차단합니다. 최소 4초 안전 버퍼 충전 후 매끄럽게 자동 재생을 재개합니다.
- **실시간 스트리밍 버퍼 HUD**:
  - 플레이어 하단에 실시간 확보된 버퍼 초수(예: `34.2s 확보됨`) 및 상태 배지(쾌적, 안전, 부족)를 표시합니다.
  - 네트워크 지연 시 현재 버퍼 수집 상태를 시각화합니다.
- **무손실 FastStart 웹 최적화**:
  - 비디오와 오디오 재인코딩 없이 헤더(`moov atom`)를 파일 맨 앞으로 이동합니다.
  - 첫 재생 지연을 4~6배 단축(0.3초대)하고 임의 탐색(Seek)에 즉각 반응합니다.

### 2. 미디어 & 공유 허브 (Media Hubs)
- **포토 & 모먼트 (Photos)**:
  - 전체 저장소의 모든 사진과 동영상을 날짜순(연월별 타임라인)으로 통합 수집하여 갤러리로 표시합니다.
  - **무제한 수집 & 용량 제한 철폐**: 1만 장 이상의 대용량 사진과 스마트폰 4K 동영상도 누락 없이 탐색합니다.
  - **스마트 스킵 폴더 토글**: 영화/드라마(`movies`, `dramas`) 및 웹 에셋(`sites`) 폴더를 원클릭으로 포함 또는 제외합니다.
  - **원본 종횡비 보존 썸네일**: 왜곡이나 크롭 없는 정갈한 썸네일과 라이트박스 슬라이드쇼를 제공합니다.
- **시네마 허브 (Cinema)**:
  - OTT(넷플릭스 스타일) 영화 및 드라마 시리즈 전용 라이브러리를 제공합니다.
  - 자막 자동 매칭(SRT, SMI, VTT) 및 UTF-8 실시간 변환, HTTP 206 부분 스트리밍을 지원합니다.
- **웹 사이트 쇼케이스 (Sites)**:
  - HTML 웹 프로젝트와 포트폴리오를 별도 웹서버 없이 원클릭으로 라이브 호스팅합니다.
  - 반응형 16:9 와이드 카드 썸네일 프리뷰와 실시간 디렉토리 인덱싱을 제공합니다.

### 3. 정돈된 파일 탐색기 (File Explorer)
- **순수한 폴더 탐색 경험**: 미디어 필터를 제거하고 디렉토리 계층 구조 탐색 본연의 기능에 집중합니다.
- **격자 ↔ 목록 원클릭 전환**:
  - `[격자 보기]`: 미디어는 원본 비율 썸네일, 문서는 파일 아이콘으로 구성한 통합 그리드를 제공합니다.
  - `[목록 보기]`: 미니 썸네일과 메타데이터를 포함한 테이블 뷰를 제공합니다.
- **멀티 저장소 & 크로스 스토리지 이동**: [폴더로 이동...] 모달에서 외장 HDD 등 다른 저장소 간에도 자유롭게 이동 및 복사합니다.
- **복사, 잘라내기, 붙여넣기**: 다중 선택 클립보드와 단축키(`Cmd/Ctrl+C, X, V`), `ESC` 취소를 지원합니다.
- **휴지통(Trash) 시스템**: 삭제한 파일과 폴더를 `.trash` 안전 보관소로 이동합니다. 원클릭 원본 복구 및 영구 삭제를 지원합니다.

### 4. 초경량 & 고신뢰성 시스템
- **순수 Go 단일 바이너리**: Go 1.24 기반 CGO=0 정적 컴파일(약 7.2MB). 실행 시 RAM 15~25MB 초경량 점유.
- **macOS 10.13 호환성 100%**: 최신 API 종속성을 배제하여 2011 Mac mini High Sierra에서 무중단 백그라운드로 구동합니다.
- **SMB 안전 배포**: SMB 네트워크 공유 환경에서 실행 파일 잠금(Lock)을 우회하는 원자적 교체(`mv -f`) 배포 파이프라인을 지원합니다.
- **4단계 검증 하네스(Test Harness)**: 프론트 빌드 -> 백엔드 유닛/보안 -> 10.13 심볼 정적 검사 -> 12개 실전 E2E 시나리오 검증 통과.

---

## 시스템 요구사항

- **운영체제**: macOS High Sierra (10.13) 이상 (x86_64 인텔 아키텍처)
- **네트워크**: 로컬 유/무선 네트워크 (Wi-Fi 또는 Ethernet)
- **의존성**: 없음 (바이너리 단독 구동. 미디어 변환 시 사이드카 `tools/ffmpeg` 선택적 사용)

---

## 빠른 시작 및 운영

배포 패키지(`mininas-v0.5-intel-mac.tar.gz`)를 맥 미니에 압축 해제하면 다음 스크립트로 제어할 수 있습니다:

```
MiniNAS/
├── start-nas.command         # 백그라운드 서비스 등록 및 가동
├── stop-nas.command          # 서비스 중지
├── restart-nas.command       # 설정 사전 검증(Pre-flight check) 후 안전 재시작
├── check-config.command      # config.json 문법 및 디렉토리 유효성 검사
├── convert-folder.command    # 폴더 내 영상 일괄 AAC 변환 및 자막 추출
└── config.json               # 포트 및 스토리지 설정 파일
```

### 접속 방법

같은 공유기(LAN/Wi-Fi)에 연결된 PC, 태블릿, 스마트폰의 웹 브라우저에서 접속합니다:

```
http://<macmini-ip>:8080
또는
http://macmini.local:8080
```

### 정적 웹사이트 & HTML 호스팅 활용 (`/sites/...`)

Nginx나 Apache 같은 별도 웹 서버를 설치할 필요 없이, 정적 웹사이트나 HTML 보고서를 저장소에 복사하면 즉시 배포 및 서비스됩니다:

- **접속 URL**: `http://<macmini-ip>:8080/sites/<저장소ID>/<경로>` (기본 저장소는 `/sites/<경로>`)
- **주요 기능**:
  - `index.html` 파일 및 상대 경로 리소스(CSS, JavaScript, 이미지, 폰트) 완벽 렌더링.
  - `index.html`이 없는 일반 폴더 접근 시 탐색기 스타일의 깔끔한 디렉토리 인덱싱 화면 제공.
  - NAS 웹 탐색기에서 `.html` 파일을 클릭하면 상단 헤더에 `[웹페이지로 열기]` 버튼이 나타나 새 탭에서 완성된 웹페이지로 열람 가능.

---

## 설정 (`config.json`)

저장소 경로와 서비스 포트를 지정합니다:

```json
{
  "port": 8080,
  "storages": [
    {
      "id": "main",
      "name": "기본 저장소",
      "path": "$HOME/MiniNAS_Storage"
    },
    {
      "id": "downloads",
      "name": "다운로드",
      "path": "$HOME/Downloads"
    },
    {
      "id": "movies",
      "name": "외장 하드 (영화)",
      "path": "/Volumes/HDD/Movies"
    }
  ]
}
```

- `$HOME` 환경 변수 표기를 지원합니다.
- 설정을 수정한 후 `restart-nas.command`를 실행하면 즉시 적용됩니다.

---

## 빌드 및 검증

### 빌드 요구사항
- Node.js 18+ 및 npm
- Go 1.24+

### 명령어

```bash
# 전체 4단계 검증 하네스 실행 (프론트 빌드 -> 백엔드 유닛/보안 -> 10.13 심볼 검사 -> 12개 E2E 시나리오)
make test

# macOS 10.13 인텔 맥용 배포 아카이브(.tar.gz) 생성
make package

# 로컬 개발용 바이너리 빌드
make build-local

# 원격 맥 미니로 SSH 원클릭 배포
make deploy TARGET=user@192.168.1.100
```

---

## 프로젝트 구조

```
nas/
├── backend/                       # Go 백엔드 API & 스트리밍 서버
│   ├── main.go                   # 라우팅, 멀티 스토리지, HEIC/정적 사이트 서빙, 포토/시네마
│   ├── trash.go                  # 휴지통 (.trash) 관리, 복원, 영구 삭제
│   ├── subtitles.go              # 자막 인코딩 판별, WebVTT 변환, ASS 정제
│   └── media_converter.go        # 코덱 진단, AAC 변환, 무손실 FastStart 헤더 최적화
├── frontend/                      # React + TypeScript + Tailwind 프론트엔드
│   └── src/
│       ├── components/           # FileList, MediaViewer, Sidebar, MoveModal, TrashModal 등
│       └── utils/format.ts       # 스마트 중간 축약, 바이트 포맷터
├── harness/                       # OS 호환성 및 12개 E2E 런타임 검증 하네스
├── deploy/                        # 배포 패키징 스크립트 및 launchd 템플릿
├── docs/                          # 상세 기술 사양서, 벤치마크 및 릴리즈 노트
├── SPEC.md                        # 시스템 기술 규격서
├── Makefile
└── README.md
```

---

## 상세 기술 문서 (Documentation)

- [시스템 기술 규격서 (SPEC.md)](file:///Users/choonsik/Documents/antigravity/nas/SPEC.md): 아키텍처 원칙, 전체 REST API 규격, 제약 조건
- [문서 가이드 & 인덱스 (docs/README.md)](file:///Users/choonsik/Documents/antigravity/nas/docs/README.md): 전체 문서 목록 및 아카이브
- [동영상 무손실 스트리밍 최적화 보고서](file:///Users/choonsik/Documents/antigravity/nas/docs/VIDEO_STREAMING_OPTIMIZATION.md): 버퍼링 메커니즘, 안티 채터링 및 FastStart 분석
- [스트리밍 최적화 벤치마크 보고서](file:///Users/choonsik/Documents/antigravity/nas/docs/BENCHMARK_STREAMING_OPTIMIZATION.md): 정량적 성능 지표 비교 및 DevTools 실전 검증 가이드
- [v0.7 릴리즈 노트](file:///Users/choonsik/Documents/antigravity/nas/docs/RELEASE_NOTES_v0.7.md): 모바일 UX 전면 개편, 음원 앨범 표지 지원, 사이드바 외형/시스템 제어 일원화
- [v0.6 릴리즈 노트](file:///Users/choonsik/Documents/antigravity/nas/docs/RELEASE_NOTES_v0.6.md): 음악 허브 및 전역 백그라운드 오디오 플레이어, 시리즈 그룹화 고도화
- [v0.5 릴리즈 노트](file:///Users/choonsik/Documents/antigravity/nas/docs/RELEASE_NOTES_v0.5.md): v0.5 신규 기능 및 변경점
- [v0.4 릴리즈 노트](file:///Users/choonsik/Documents/antigravity/nas/docs/RELEASE_NOTES_v0.4.md): 역할 분리, 포토/시네마 허브 혁신

---

## 라이선스

MIT License.
