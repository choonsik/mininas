# MiniNAS

[![Latest Release](https://img.shields.io/github/v/release/choonsik/mininas?style=flat-square&color=0969da)](https://github.com/choonsik/mininas/releases/latest)
[![Platform](https://img.shields.io/badge/platform-macOS%2010.13%2B-24292f?style=flat-square)](https://github.com/choonsik/mininas)
[![Architecture](https://img.shields.io/badge/arch-Intel%20x86__64-informational?style=flat-square)](https://github.com/choonsik/mininas)
[![Go Version](https://img.shields.io/badge/Go-1.24-00ADD8?style=flat-square&logo=go&logoColor=white)](https://go.dev/)
[![Binary Size](https://img.shields.io/badge/binary-7.5MB-success?style=flat-square)](https://github.com/choonsik/mininas/releases)
[![Memory Footprint](https://img.shields.io/badge/RAM-15~25MB-brightgreen?style=flat-square)](https://github.com/choonsik/mininas)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

구형 2011 Mac mini(macOS High Sierra 10.13+)를 모니터 없는 헤드리스 홈 NAS로 운용하기 위한 초경량 독립형(Standalone) 웹 애플리케이션입니다.

Docker나 외부 런타임 없이 단일 바이너리(Pure Go, CGO=0)로 구동합니다. React 기반 단일 페이지 애플리케이션(SPA)이 바이너리에 내장되어 있어 파일 복사만으로 즉시 구동합니다.

---

## 주요 기능

### 1. 파일 탐색 및 관리
- **계층형 디렉토리 탐색**: 순수 디렉토리 트리 탐색, 그리드(Grid) 및 목록(List) 보기 지원.
- **다중 저장소 제어**: 로컬 디스크 및 외장 HDD 간 자유로운 파일 복사, 이동, 대용량 ZIP 압축 다운로드.
- **안전한 휴지통**: 삭제 항목을 `.trash` 보관소로 이동하며, 원클릭 원본 복구 및 영구 삭제 지원.
- **업로드 보호 가드**: 대용량 파일 다중 업로드 시 취소 기능 및 브라우저 닫힘 방지(`beforeunload`) 가드 탑재.

### 2. 통합 미디어 허브
- **시네마 (Cinema)**:
  - 영화 및 시리즈 드라마 자동 그룹화 라이브러리.
  - 무손실 원본 스트리밍(FastStart 최적화) 및 한국어 자막(SRT, SMI, VTT) 실시간 UTF-8 변환 지원.
- **포토 (Photos)**:
  - 전체 저장소 사진과 동영상을 날짜순 타임라인으로 통합 수집.
  - 원본 비율 보존 썸네일 그리드 및 전체화면 슬라이드쇼.
- **음악 (Music)**:
  - MP3/FLAC 내장 ID3v2 앨범 표지(Cover Art) 고속 추출 및 카드 표시.
  - 탭 이동 중에도 끊김 없는 전역 백그라운드 오디오 플레이어 탑재.

### 3. 정적 웹사이트 호스팅 (`/sites/...`)
- Nginx나 Apache 설치 없이 저장소 내 HTML 프로젝트와 포트폴리오를 즉시 웹 호스팅.
- 디렉토리 인덱싱 화면 및 탐색기 내 '웹페이지로 열기' 바로가기 제공.

### 4. 모바일 최적화 및 유연한 외형
- **모바일 맞춤 컨트롤**: 화면 가림을 해소한 하단 반투명 내비게이션 캡슐, 터치 지연 방지.
- **외형 설정 일원화**: 3종 테마 스타일(macOS / Console / Studio), 3종 컬러 톤(다크 / 나이트 / 라이트), 3단계 텍스트 크기를 사이드바에서 원클릭 전환.
- **시스템 모니터링**: 호스트명, CPU 실시간 부하 게이지, 메모리 사용률, 가동 시간을 사이드바 푸터에서 상시 확인.

---

## 시스템 제원 및 아키텍처

| 항목 | 내용 |
| :--- | :--- |
| **운영체제** | macOS High Sierra (10.13) 이상 (인텔 x86_64 아키텍처) |
| **바이너리 구조** | Pure Go 단일 정적 바이너리 (CGO=0, 약 7.5MB) |
| **메모리 점유율** | 유휴 시 약 15MB ~ 25MB RAM |
| **프론트엔드** | React 18, TypeScript, Tailwind CSS (바이너리 내장) |
| **외부 의존성** | 없음 (미디어 변환 시 ffmpeg 선택적 사용) |

---

## 빠른 시작

### 1. 패키지 다운로드 및 실행
최신 릴리즈 아카이브(`mininas-v0.7-intel-mac.tar.gz`)를 맥 미니의 원하는 경로에 압축 해제합니다:

```bash
tar -xzf mininas-v0.7-intel-mac.tar.gz
cd MiniNAS
./start-nas.command
```

### 2. 웹 브라우저 접속
동일한 로컬 네트워크(LAN/Wi-Fi)에 연결된 PC, 태블릿, 스마트폰에서 접속합니다:

```text
http://<macmini-ip>:8080
또는
http://macmini.local:8080
```

### 3. 제어 스크립트 목록
- `start-nas.command`: 백그라운드 서비스 등록 및 가동
- `stop-nas.command`: 서비스 중지
- `restart-nas.command`: 설정 사전 검증(Pre-flight check) 후 안전 재시작
- `check-config.command`: `config.json` 문법 및 디렉토리 경로 유효성 검사
- `convert-folder.command`: 선택 폴더 내 영상 일괄 웹 호환 변환

---

## 설정 (`config.json`)

포트 번호와 마운트할 저장소 경로를 지정합니다 (`$HOME` 환경 변수 지원):

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
      "id": "hdd",
      "name": "외장 하드",
      "path": "/Volumes/HDD"
    }
  ]
}
```

설정 변경 후 `./restart-nas.command`를 실행하면 즉시 적용됩니다.

---

## 빌드 및 배포

### 빌드 요구사항
- Go 1.24 이상
- Node.js 18 이상 및 npm

### 주요 Make 명령어
```bash
# 2011 인텔 맥용 배포 패키지(.tar.gz) 빌드
make package

# 4단계 검증 하네스 실행 (프론트 빌드 -> 백엔드 유닛/보안 -> 10.13 심볼 검사 -> E2E 시나리오)
make test

# 로컬 개발용 바이너리 빌드
make build-local

# 원격 맥 미니로 SSH 원클릭 배포
make deploy TARGET=user@192.168.1.100
```

---

## 관련 문서

- [시스템 기술 규격서 (SPEC.md)](SPEC.md)
- [문서 색인 (docs/README.md)](docs/README.md)
- [동영상 스트리밍 최적화 분석 보고서](docs/VIDEO_STREAMING_OPTIMIZATION.md)
- [스트리밍 성능 벤치마크 보고서](docs/BENCHMARK_STREAMING_OPTIMIZATION.md)
- [v0.7 릴리즈 노트](docs/RELEASE_NOTES_v0.7.md)
- [v0.6 릴리즈 노트](docs/RELEASE_NOTES_v0.6.md)
- [v0.5 릴리즈 노트](docs/RELEASE_NOTES_v0.5.md)
- [v0.4 릴리즈 노트](docs/RELEASE_NOTES_v0.4.md)

---

## 라이선스

MIT License
