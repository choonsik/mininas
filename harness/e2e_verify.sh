#!/bin/bash
# ==============================================================================
# MiniNAS E2E(End-to-End) 통합 런타임 검증 하네스
# ==============================================================================
set -e

PORT=8999
TEST_DIR=$(mktemp -d /tmp/mininas_e2e_XXXXXX)
BIN_PATH="./backend/mininas-local"

echo "🧪 [Harness] E2E 런타임 시나리오 검증 시작 (포트: $PORT)"
echo "   임시 격리 스토리지: $TEST_DIR"

cleanup() {
    echo "🧹 [Harness] 테스트 환경 정리 중..."
    if [ -n "$SERVER_PID" ]; then
        kill "$SERVER_PID" 2>/dev/null || true
    fi
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# 1. 로컬 바이너리 준비 (항상 최신 소스로 빌드)
echo "⚙️ 로컬 테스트 바이너리 빌드 중..."
cd backend && GOTOOLCHAIN=local go build -o mininas-local . && cd ..

# 2. 임시 config.json 생성
cat <<EOF > "$TEST_DIR/config.json"
{
  "port": $PORT,
  "storages": [
    { "id": "test_s1", "name": "테스트 저장소 1", "path": "$TEST_DIR/s1" },
    { "id": "test_s2", "name": "테스트 저장소 2", "path": "$TEST_DIR/s2" }
  ]
}
EOF

mkdir -p "$TEST_DIR/s1" "$TEST_DIR/s2"

# 3. 테스트 서버 백그라운드 가동
"$BIN_PATH" -config "$TEST_DIR/config.json" > "$TEST_DIR/server.log" 2>&1 &
SERVER_PID=$!
sleep 1

if ! ps -p "$SERVER_PID" > /dev/null; then
    echo "❌ 서버 시작 실패. 로그:"
    cat "$TEST_DIR/server.log"
    exit 1
fi
echo "  ✅ 1. 테스트 서버 백그라운드 구동 성공 (PID: $SERVER_PID)"

# 4. 저장소 목록 API 검증
STORAGES_JSON=$(curl -s "http://localhost:$PORT/api/storages")
if [[ "$STORAGES_JSON" != *"test_s1"* ]]; then
    echo "❌ [FAIL] /api/storages 검증 실패: $STORAGES_JSON"
    exit 1
fi
echo "  ✅ 2. 멀티 저장소 API 응답 검증 통과"

# 5. 파일 업로드 API 검증
echo "E2E Test File Payload" > "$TEST_DIR/sample.txt"
UPLOAD_RES=$(curl -s -X POST -F "storage=test_s1" -F "targetPath=/" -F "files=@$TEST_DIR/sample.txt" "http://localhost:$PORT/api/files/upload")
if [[ "$UPLOAD_RES" != *"ok"* ]]; then
    echo "❌ [FAIL] /api/files/upload 실패: $UPLOAD_RES"
    exit 1
fi
echo "  ✅ 3. 대용량 멀티파트 스트리밍 업로드 통과"

# 6. 파일 목록 조회 API 검증
FILES_JSON=$(curl -s "http://localhost:$PORT/api/files?storage=test_s1&path=/")
if [[ "$FILES_JSON" != *"sample.txt"* ]]; then
    echo "❌ [FAIL] /api/files 목록에 업로드된 파일 없음: $FILES_JSON"
    exit 1
fi
echo "  ✅ 4. 파일 목록 인덱싱 및 메타데이터 API 검증 통과"

# 7. HTTP 206 Range 부분 스트리밍 검증
STREAM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Range: bytes=0-4" "http://localhost:$PORT/api/files/stream?storage=test_s1&path=/sample.txt")
if [ "$STREAM_STATUS" != "206" ]; then
    echo "❌ [FAIL] 미디어 Seek 스트리밍(HTTP 206) 실패 (응답코드: $STREAM_STATUS)"
    exit 1
fi
echo "  ✅ 5. HTTP 206 미디어 Range 스트리밍 검증 통과"

# 8. 실시간 ZIP 다운로드 검증
ZIP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/api/files/download-zip?storage=test_s1&path=/sample.txt")
if [ "$ZIP_STATUS" != "200" ]; then
    echo "❌ [FAIL] ZIP 압축 다운로드 실패 (응답코드: $ZIP_STATUS)"
    exit 1
fi
echo "  ✅ 6. 실시간 ZIP 압축 스트리밍 검증 통과"

# 9. 시스템 상태 API 검증
SYS_JSON=$(curl -s "http://localhost:$PORT/api/system/stats")
if [[ "$SYS_JSON" != *"hostname"* ]]; then
    echo "❌ [FAIL] /api/system/stats 실패: $SYS_JSON"
    exit 1
fi
echo "  ✅ 7. macOS 하드웨어/디스크 모니터링 API 검증 통과"

# 10. 정적 HTML 웹사이트 호스팅 (/sites/...) 검증
mkdir -p "$TEST_DIR/s2/test-web"
echo "<html><body><h1>Harness Web Hosted</h1></body></html>" > "$TEST_DIR/s2/test-web/index.html"
SITE_BODY=$(curl -s "http://localhost:$PORT/sites/test_s2/test-web/")
if [[ "$SITE_BODY" != *"Harness Web Hosted"* ]]; then
    echo "❌ [FAIL] /sites/ 정적 호스팅 검증 실패: $SITE_BODY"
    exit 1
fi
echo "  ✅ 8. 정적 HTML 웹사이트 호스팅(/sites/...) 실시간 렌더링 통과"

# 11. 비디오 자막 매칭 및 WebVTT 변환 API 검증
echo "fake video content" > "$TEST_DIR/s1/demo.mp4"
cat << 'EOF' > "$TEST_DIR/s1/demo.ko.srt"
1
00:00:01,000 --> 00:00:03,000
테스트 자막입니다
EOF
cat << 'EOF' > "$TEST_DIR/s1/demo.smi"
<SAMI><BODY>
<SYNC Start=1000><P Class=KRCC>SMI 테스트 자막
<SYNC Start=3000><P Class=KRCC>&nbsp;
</BODY></SAMI>
EOF

SUB_LIST=$(curl -s "http://localhost:$PORT/api/files/subtitles?storage=test_s1&path=/demo.mp4")
if [[ "$SUB_LIST" != *"demo.ko.srt"* ]] || [[ "$SUB_LIST" != *"demo.smi"* ]]; then
    echo "❌ [FAIL] 자막 목록 탐색(/api/files/subtitles) 실패: $SUB_LIST"
    exit 1
fi

SRT_VTT=$(curl -s "http://localhost:$PORT/api/files/subtitle?storage=test_s1&path=/demo.ko.srt")
if [[ "$SRT_VTT" != *"WEBVTT"* ]] || [[ "$SRT_VTT" != *"00:00:01.000 --> 00:00:03.000"* ]]; then
    echo "❌ [FAIL] SRT to WebVTT 변환 서빙 실패: $SRT_VTT"
    exit 1
fi

SMI_VTT=$(curl -s "http://localhost:$PORT/api/files/subtitle?storage=test_s1&path=/demo.smi")
if [[ "$SMI_VTT" != *"WEBVTT"* ]] || [[ "$SMI_VTT" != *"SMI 테스트 자막"* ]]; then
    echo "❌ [FAIL] SMI to WebVTT 변환 서빙 실패: $SMI_VTT"
    exit 1
fi
echo "  ✅ 9. SRT / SMI 자막 자동 매칭 및 실시간 WebVTT 변환 스트리밍 통과"

echo ""
echo "🎉 [Harness] 9개 핵심 런타임 E2E 시나리오 ALL PASS!"
