# MiniNAS 기술 문서 모음 (Documentation Index)

MiniNAS 프로젝트의 아키텍처, 검증 하네스, 성능 벤치마크, 버전별 릴리즈 노트를 모아둔 문서 보관소입니다.

---

## 핵심 규격서 및 가이드

- [SPEC.md (시스템 기술 규격서)](../SPEC.md)
  - 하드웨어 제약 조건(2011 Mac mini, macOS 10.13, RAM 30MB 이하).
  - 핵심 아키텍처 원칙 및 시스템 다이어그램.
  - 스토리지, 휴지통, 파일 탐색기, 4대 미디어 허브, 자막 변환 엔진 세부 기능 규격.
  - 전체 REST API 엔드포인트 목록 및 페이로드 명세.
  - 4단계 무결성 검증 하네스(Verification Harness) 규격.

- [GEMINI.md (프로젝트 커뮤니케이션 및 릴리즈 지침)](../GEMINI.md)
  - ASD-STE100 기반 기술 문서 및 커밋 메시지 작성 표준.
  - 버전 업데이트 시 동기화 필수 8대 파일 체크리스트.
  - 개인 식별 정보(PII) 배제, 서식 제약, 안전 배포 원칙.

- [README.md (프로젝트 소개 및 운영 가이드)](../README.md)
  - 프로젝트 개요 및 주요 기능 요약.
  - 빠른 시작, 백그라운드 데몬 구동 및 스크립트 안내.
  - 설정 파일(`config.json`) 가이드 및 빌드 명령어.

---

## 검증 하네스 및 성능 최적화 보고서

- [HARNESS_VERIFICATION_REPORT.md (무결성 검증 하네스 설계 및 점검 보고서)](./HARNESS_VERIFICATION_REPORT.md)
  - 프로젝트 지침(`GEMINI.md`) 및 기술 규격서(`SPEC.md`) 정합성 점검 결과.
  - 테스트 커버리지 보완 내역(음악 허브, 앨범 표지, 파일 조작, 휴지통 선택 삭제, CLI 사전 진단).
  - 4단계 자동화 검증 파이프라인(`make test`), 19개 유닛 테스트, 15개 런타임 E2E 시나리오 명세.

- [VIDEO_STREAMING_OPTIMIZATION.md (무손실 스트리밍 최적화 보고서)](./VIDEO_STREAMING_OPTIMIZATION.md)
  - 버퍼링의 역설: 느린 네트워크와 빠른 네트워크의 엔지니어링 전략 차이 분석.
  - 화질 무손실 최적화 솔루션 4단계(일시정지 프리페치, HUD 게이지, 스마트 재생 재개, FastStart).
  - 버퍼 내/외 Seek 메커니즘 및 안정성 분석.

- [BENCHMARK_STREAMING_OPTIMIZATION.md (스트리밍 최적화 벤치마크 보고서)](./BENCHMARK_STREAMING_OPTIMIZATION.md)
  - 기존 방식과 개선 방식의 정량적 지표 비교 (TTFF 4~6배 단축, Seek 지연 단축, 채터링 제거).
  - 네트워크 환경별 시나리오 벤치마크 (음영 지역, 모바일 LTE, 기가비트 LAN).
  - 브라우저 개발자 도구(DevTools)를 활용한 실전 검증 가이드.

---

## 버전별 릴리즈 노트 (Release Notes)

- [RELEASE_NOTES_v0.8.md (v0.8 릴리즈 노트)](./RELEASE_NOTES_v0.8.md)
  - 미디어 허브(시네마 / 포토 / 음악) 전용 폴더 격리 스캔 적용.
  - 포토 & 모먼트 앨범(폴더) 단위 카드 보기 및 촬영일 타임라인 보기 전환.
  - EXIF(JPEG/HEIC) 및 MP4/MOV(`mvhd`/QuickTime) 실제 촬영일 추출, 라이브 포토 짝꿍 날짜 상속.
  - EXIF 회전(`Orientation`) 보정 경량 썸네일 캐시(`/api/photos/thumb`) 및 고아 캐시 자동 정리.
  - 파일 탐색기, 포토 허브, 미디어 뷰어 상세 메타 정보(`i` 버튼, `/api/media/meta`) 표시.

- [RELEASE_NOTES_v0.7.md (v0.7 릴리즈 노트)](./RELEASE_NOTES_v0.7.md)
  - 모바일 UX 전면 개편 (하단 캡슐 내비게이션, 터치 반응 최적화, 스크롤 겹침 해소).
  - 음원 내장 ID3v2 앨범 표지(Cover Art) 고속 추출 및 앨범/플레이어 연동.
  - 외형 설정(테마 스타일/컬러 톤/폰트 크기) 좌측 사이드바 3분할 세그먼트 일원화.
  - 시스템 모니터링(CPU 부하/메모리/호스트/가동시간) 사이드바 푸터 통합 및 상단 헤더 순수화.
  - 체크박스 전체 선택/취소 토글 및 인디터미네이트 상태(`MinusSquare`) 개선.

- [RELEASE_NOTES_v0.6.md (v0.6 릴리즈 노트)](./RELEASE_NOTES_v0.6.md)
  - 음악 라이브러리 허브 및 전역 백그라운드 오디오 플레이어.
  - 시네마 시리즈 자동 그룹화 고도화 및 고대비 배지 시인성 개선.
  - 대용량/다수 파일 업로드 취소 및 브라우저 이탈 방지 가드(`beforeunload`).
  - 반응형 트랙 테이블 레이아웃 및 2자리 버전 표기 표준화.

- [RELEASE_NOTES_v0.5.md (v0.5 릴리즈 노트)](./RELEASE_NOTES_v0.5.md)
  - 무손실 동영상 스트리밍 최적화.
  - 프론트엔드 스마트 버퍼링 및 안티 채터링(Anti-Chattering) 4초 안전 버퍼.
  - 실시간 스트리밍 버퍼 HUD.
  - 백엔드 무손실 FastStart 헤더 이동(`media_converter.go`).

- [RELEASE_NOTES_v0.4.md (v0.4 릴리즈 노트)](./RELEASE_NOTES_v0.4.md)
  - 파일 탐색기와 3대 미디어 허브의 역할 분리.
  - 포토 & 모먼트: 무제한 수집, 용량 제한 철폐, 스마트 스킵 폴더 토글, 원본 종횡비 보존 썸네일.
  - 사이트 쇼케이스: 16:9 반응형 썸네일, 우클릭 핀 고정 지원.
  - 시네마 허브: 수량 제한 해제, 외장 HDD 인식.
  - SMB 네트워크 공유 원자적 배포(`mininas.new -> mv -f`) 파이프라인.
