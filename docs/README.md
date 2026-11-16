# MiniNAS 기술 문서 모음 (Documentation Index)

MiniNAS 프로젝트의 아키텍처, 성능 벤치마크, 최적화 연구, 버전별 릴리즈 노트를 모아둔 문서 보관소입니다.

---

## 핵심 규격서 및 가이드

- **[SPEC.md (시스템 기술 규격서)](file:///Users/choonsik/Documents/antigravity/nas/SPEC.md)**
  - 하드웨어 제약 조건(2011 Mac mini, macOS 10.13, RAM 30MB 이하).
  - 핵심 아키텍처 원칙 및 시스템 다이어그램.
  - 스토리지, 휴지통, 파일 탐색기, 미디어 허브, 자막 변환 엔진 세부 기능 규격.
  - 전체 REST API 엔드포인트 목록 및 페이로드 명세.
  - 4단계 무결성 검증 하네스(Verification Harness) 규격.

- **[README.md (프로젝트 소개 및 운영 가이드)](file:///Users/choonsik/Documents/antigravity/nas/README.md)**
  - 프로젝트 개요 및 주요 기능 요약.
  - 빠른 시작, 백그라운드 데몬 구동 및 스크립트 안내.
  - 설정 파일(`config.json`) 가이드.
  - 빌드 및 배포 명령어.

---

## 성능 최적화 및 벤치마크 보고서

- **[VIDEO_STREAMING_OPTIMIZATION.md (무손실 스트리밍 최적화 보고서)](file:///Users/choonsik/Documents/antigravity/nas/docs/VIDEO_STREAMING_OPTIMIZATION.md)**
  - 버퍼링의 역설: 느린 네트워크와 빠른 네트워크의 엔지니어링 전략 차이 분석.
  - 화질 무손실 최적화 솔루션 4단계(일시정지 프리페치, HUD 게이지, 스마트 재생 재개, FastStart).
  - 버퍼 내/외 Seek 메커니즘 및 안정성 분석.

- **[BENCHMARK_STREAMING_OPTIMIZATION.md (스트리밍 최적화 벤치마크 보고서)](file:///Users/choonsik/Documents/antigravity/nas/docs/BENCHMARK_STREAMING_OPTIMIZATION.md)**
  - 기존 방식과 개선 방식의 정량적 지표 비교 (TTFF 4~6배 단축, Seek 지연 단축, 채터링 제거).
  - 네트워크 환경별 시나리오 벤치마크 (음영 지역, 모바일 LTE, 기가비트 LAN).
  - 브라우저 개발자 도구(DevTools)를 활용한 실전 검증 가이드.

---

## 버전별 릴리즈 노트 (Release Notes)

- **[RELEASE_NOTES_v0.5.md (v0.5.0 릴리즈 노트)](file:///Users/choonsik/Documents/antigravity/nas/docs/RELEASE_NOTES_v0.5.md)**
  - 무손실 동영상 스트리밍 최적화.
  - 프론트엔드 스마트 버퍼링 및 안티 채터링(Anti-Chattering) 4초 안전 버퍼.
  - 실시간 스트리밍 버퍼 HUD.
  - 백엔드 무손실 FastStart 헤더 이동(`media_converter.go`).

- **[RELEASE_NOTES_v0.4.md (v0.4.0 릴리즈 노트)](file:///Users/choonsik/Documents/antigravity/nas/docs/RELEASE_NOTES_v0.4.md)**
  - 파일 탐색기와 3대 미디어 허브의 역할 분리.
  - 포토 & 모먼트: 무제한 수집, 용량 제한 철폐, 스마트 스킵 폴더 토글, 원본 종횡비 보존 썸네일.
  - 사이트 쇼케이스: 16:9 반응형 썸네일, 우클릭 핀 고정 지원.
  - 시네마 허브: 수량 제한 해제, 외장 HDD 인식.
  - SMB 네트워크 공유 원자적 배포(`mininas.new -> mv -f`) 파이프라인.
