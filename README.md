# MiniNAS

구형 2011 Mac mini(macOS High Sierra 10.13+)를 모니터 없는 헤드리스 홈 NAS로 활용하기 위한 초경량 독립형(Standalone) 웹 애플리케이션입니다.

Docker나 외부 런타임 의존성 없이 단일 바이너리(Pure Go, CGO=0)로 구동되며, React 프론트엔드가 바이너리에 내장되어 배포와 운영이 단순합니다.

---

## 주요 기능

- **초경량 단일 바이너리**: Go 1.24 기반 순수 정적 컴파일 (약 7MB, 압축 시 2.9MB). 실행 시 메모리(RAM) 15~25MB 점유.
- **구형 macOS 10.13 호환**: 최신 macOS API 심볼 종속성을 배제하고 High Sierra 환경에서 안정적으로 백그라운드 가동.
- **멀티 저장소(Multi-Storage)**: 내장 SSD 및 다수의 외장 하드디스크(`/Volumes/...`)를 독립 마운트하여 관리 및 용량 모니터링.
- **넷플릭스 스타일 동영상 UI (Netflix View)**:
  - 동영상 폴더 자동 감지 및 원클릭 넷플릭스 OTT 시네마 모드 전환 지원.
  - 대표 비디오 대형 히어로 빌보드 배너 (프리뷰, 타이틀, 화질/포맷 뱃지, 원클릭 재생/상세정보/다운로드).
  - 16:9 와이드 비디오 카드 그리드: 첫 프레임 자동 캡처 프리뷰, 호버 확대 애니메이션(`scale-105`), 에피소드(EP) 번호 파싱, 퀵 액션 컨트롤.
  - 시리즈/하위 폴더 및 자막/관련 파일 분리 렌더링.
- **파일 관리 기본 기능 (File Operations)**:
  - **복사 & 이동 (Cut / Copy / Paste)**: 다중 선택 및 단일 항목 복사(`Cmd/Ctrl+C`), 잘라내기(`Cmd/Ctrl+X`), 붙여넣기(`Cmd/Ctrl+V`) 지원.
  - **정렬 (Sorting)**: 이름순, 파일 크기순, 수정 날짜순, 파일 형식순 정렬 및 오름차순/내림차순 토글 (폴더 우선 정렬).
  - **우클릭 컨텍스트 메뉴 (Context Menu)**: 파일/폴더 우클릭 시 열기, 다운로드, 복사, 잘라내기, 이름 변경, 상세 정보, 삭제 메뉴 제공. 빈 공간 우클릭 시 새 폴더, 업로드, 붙여넣기, 새로고침 제공.
  - **파일 상세 정보 모달 (File Properties)**: 파일명, 스토리지 위치, 용량(바이트 단위 상세), 수정 일시, 전체 경로 확인.
  - **단일 및 다중 안전 삭제**: 빠른 삭제 버튼과 안전 확인 다이얼로그.
- **스트리밍 파일 I/O**: 대용량 드래그 앤 드롭 업로드 및 다중 파일/폴더 실시간 ZIP 압축 스트리밍 다운로드.
- **미디어 스트리밍 & 자막 엔진**:
  - HTTP 206 Partial Content 기반 구간 탐색(Seek) 비디오 스트리밍.
  - `.srt`, `.smi`, `.vtt` 파일의 인코딩(UTF-8, EUC-KR, CP949)을 자동 판별하여 WebVTT로 온더플라이 변환.
  - ASS 자막 특수 태그(`{\an8}` 등)를 웹 표준 상단 큐(`line:8%`)로 자동 변환하고 화면 노출 태그 정제.
  - 외장 자막(`.ko.srt`)과 컨테이너 내장 자막 개별 선택 및 다국어 트랙 지원.
- **사이드카 미디어 변환기**:
  - 브라우저 미지원 오디오 코덱(EAC3 등)을 원본 비디오 무손실 복사(`-c:v copy`) + AAC 고속 변환.
  - 내장 자막의 원클릭/배치 추출 지원.
- **정적 웹사이트 & HTML 실시간 호스팅 (`/sites/...`)**:
  - Nginx/Apache 등 별도 웹서버 없이 저장소에 업로드된 `.html` 파일이나 웹 프로젝트 폴더를 즉시 웹사이트로 호스팅.
  - 상대 경로 에셋(CSS, JS, 이미지, 폰트) 완벽 지원 및 `index.html` 부재 시 모던 디렉토리 인덱싱(파일 목록) 렌더링.
  - 파일 탐색기에서 HTML 파일 선택 시 상단 `[웹페이지로 열기]` 원클릭 바로가기 지원.
- **아이폰 HEIC 사진 변환**: macOS 내장 `sips` 도구를 연동하여 브라우저용 실시간 JPEG 썸네일/뷰어 제공 및 디스크 캐싱.
- **네이티브 웹 UX**:
  - HTML5 History API 연동을 통해 브라우저 뒤로가기/앞으로가기 및 제스처 시 NAS 이탈 없이 상위 폴더 이동 및 모달 닫기 지원.
  - 긴 릴리즈 파일명의 가독성을 보존하는 스마트 중간 생략(`truncateMiddle`).

---

## 시스템 요구사항

- **운영체제**: macOS High Sierra (10.13) 이상 (x86_64 인텔 아키텍처)
- **네트워크**: 로컬 유/무선 네트워크 (Wi-Fi 또는 Ethernet)
- **의존성**: 없음 (바이너리 단독 구동. 미디어 변환 시 사이드카 `tools/ffmpeg` 선택적 사용)

---

## 빠른 시작 및 운영

배포 패키지(`mininas-v1.0.0-intel-mac.tar.gz`)를 맥 미니에 압축 해제하면 다음 스크립트로 제어할 수 있습니다:

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

Nginx나 Apache 같은 별도 웹 서버를 설치할 필요 없이, 정적 웹사이트나 HTML 보고서, 빌드된 웹 프로젝트를 저장소에 복사하면 즉시 배포 및 서비스됩니다:

- **접속 URL**: `http://<macmini-ip>:8080/sites/<저장소ID>/<경로>` (기본 저장소는 `/sites/<경로>`)
- **주요 기능**:
  - `index.html` 파일 및 상대 경로 리소스(CSS, JavaScript, 이미지, 폰트) 완벽 렌더링.
  - `index.html`이 없는 일반 폴더 접근 시 탐색기 스타일의 깔끔한 디렉토리 인덱싱(파일 브라우징) 화면 제공.
  - NAS 웹 탐색기에서 `.html` 파일을 클릭하면 상단 헤더에 `[🌐 웹페이지로 열기]` 버튼이 자동으로 나타나 새 탭에서 실제 완성된 웹페이지로 열람 가능.

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
# 전체 4단계 검증 하네스 실행 (프론트 빌드 -> 백엔드 유닛/보안 -> 10.13 심볼 검사 -> E2E 시나리오)
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
├── backend/                  # Go 백엔드 API & 스트리밍 서버
│   ├── main.go              # 라우팅, 멀티 스토리지, HEIC/정적 사이트 서빙
│   ├── subtitles.go         # 자막 인코딩 판별, WebVTT 변환, ASS 정제
│   └── media_converter.go   # 미디어 코덱 검사 및 고속 AAC 변환기
├── frontend/                 # React + TypeScript + Tailwind 프론트엔드
│   └── src/
│       ├── components/      # FileList, MediaViewer, Sidebar, UploadModal 등
│       └── utils/format.ts  # 스마트 중간 축약, 바이트 포맷터
├── harness/                  # OS 호환성 및 런타임 검증 하네스
├── deploy/                   # 배포 패키징 스크립트 및 런처 템플릿
├── Makefile
└── README.md
```

---

## 라이선스

MIT License.
