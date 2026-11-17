#!/bin/bash
# ==============================================================================
# MiniNAS End-to-End (E2E) Runtime Verification Harness
# ==============================================================================
set -e

PORT=8999
TEST_DIR=$(mktemp -d /tmp/mininas_e2e_XXXXXX)
BIN_PATH="./backend/mininas-e2e-test"

echo "[Harness] Starting E2E runtime verification (port: $PORT)"
echo "  Isolated storage root: $TEST_DIR"

cleanup() {
    echo "[Harness] Cleaning up test processes and temporary files..."
    if [ -n "$SERVER_PID" ]; then
        kill "$SERVER_PID" 2>/dev/null || true
    fi
    rm -f "$BIN_PATH"
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Build local binary from current source
echo "[Harness] Compiling local test binary..."
GO_BIN="/opt/homebrew/opt/go@1.24/bin/go"
if [ ! -f "$GO_BIN" ]; then
    GO_BIN="go"
fi
mkdir -p ./backend/dist
if [ ! -f ./backend/dist/index.html ]; then
    echo "<!doctype html><html><body>MiniNAS</body></html>" > ./backend/dist/index.html
fi
cd backend && GOTOOLCHAIN=local "$GO_BIN" build -o mininas-e2e-test . && cd ..

# Create isolated config.json
cat <<EOF > "$TEST_DIR/config.json"
{
  "port": $PORT,
  "storages": [
    { "id": "test_s1", "name": "Test Storage 1", "path": "$TEST_DIR/s1" },
    { "id": "test_s2", "name": "Test Storage 2", "path": "$TEST_DIR/s2" }
  ]
}
EOF

mkdir -p "$TEST_DIR/s1" "$TEST_DIR/s2"

# 1. Pre-flight configuration validator (-check flag)
if ! "$BIN_PATH" -config "$TEST_DIR/config.json" -check > /dev/null 2>&1; then
    echo "[FAIL] 1. Pre-flight configuration validator (-check) failed"
    exit 1
fi
echo "  [PASS] 1. Pre-flight configuration validator (-check) verified"

# 2. Background daemon startup
"$BIN_PATH" -config "$TEST_DIR/config.json" > "$TEST_DIR/server.log" 2>&1 &
SERVER_PID=$!
sleep 1

if ! ps -p "$SERVER_PID" > /dev/null; then
    echo "[FAIL] 2. Server failed to start. Log output:"
    cat "$TEST_DIR/server.log"
    exit 1
fi
echo "  [PASS] 2. Background server daemon startup verified (PID: $SERVER_PID)"

# 3. Multi-storage list API (/api/storages)
STORAGES_JSON=$(curl -s "http://localhost:$PORT/api/storages")
if [[ "$STORAGES_JSON" != *"test_s1"* ]] || [[ "$STORAGES_JSON" != *"test_s2"* ]]; then
    echo "[FAIL] 3. /api/storages verification failed: $STORAGES_JSON"
    exit 1
fi
echo "  [PASS] 3. Multi-storage list and disk stats API (/api/storages) verified"

# 4. Multipart streaming file upload (/api/files/upload)
echo "E2E Test File Payload" > "$TEST_DIR/sample.txt"
UPLOAD_RES=$(curl -s -X POST -F "storage=test_s1" -F "targetPath=/" -F "files=@$TEST_DIR/sample.txt" "http://localhost:$PORT/api/files/upload")
if [[ "$UPLOAD_RES" != *"ok"* ]]; then
    echo "[FAIL] 4. /api/files/upload failed: $UPLOAD_RES"
    exit 1
fi
echo "  [PASS] 4. Multipart streaming file upload (/api/files/upload) verified"

# 5. Directory listing and metadata API (/api/files)
FILES_JSON=$(curl -s "http://localhost:$PORT/api/files?storage=test_s1&path=/")
if [[ "$FILES_JSON" != *"sample.txt"* ]]; then
    echo "[FAIL] 5. /api/files missing uploaded file: $FILES_JSON"
    exit 1
fi
echo "  [PASS] 5. Directory listing and file metadata API (/api/files) verified"

# 6. Directory creation, rename, and single file download (/api/files/mkdir, /rename, /download)
MKDIR_RES=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"storage":"test_s1","parentPath":"/","name":"work_dir"}' \
  "http://localhost:$PORT/api/files/mkdir")
if [[ "$MKDIR_RES" != *"ok"* ]] || [ ! -d "$TEST_DIR/s1/work_dir" ]; then
    echo "[FAIL] 6a. /api/files/mkdir failed: $MKDIR_RES"
    exit 1
fi

COPY_RES=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"sourceStorage":"test_s1","targetStorage":"test_s1","sourcePaths":["/sample.txt"],"targetDir":"/work_dir"}' \
  "http://localhost:$PORT/api/files/copy")
if [[ "$COPY_RES" != *"ok"* ]]; then
    echo "[FAIL] 6b. /api/files/copy failed: $COPY_RES"
    exit 1
fi

RENAME_RES=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"storage":"test_s1","path":"/work_dir/sample.txt","newName":"renamed.txt"}' \
  "http://localhost:$PORT/api/files/rename")
if [[ "$RENAME_RES" != *"ok"* ]] || [ ! -f "$TEST_DIR/s1/work_dir/renamed.txt" ]; then
    echo "[FAIL] 6c. /api/files/rename failed: $RENAME_RES"
    exit 1
fi

DL_BODY=$(curl -s "http://localhost:$PORT/api/files/download?storage=test_s1&path=/work_dir/renamed.txt")
if [[ "$DL_BODY" != "E2E Test File Payload" ]]; then
    echo "[FAIL] 6d. /api/files/download content mismatch: $DL_BODY"
    exit 1
fi
echo "  [PASS] 6. File operations (mkdir, copy, rename, download) verified"

# 7. Cross-storage move (/api/files/move)
MOVE_RES=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"sourceStorage":"test_s1","targetStorage":"test_s2","sourcePaths":["/work_dir/renamed.txt"],"targetDir":"/"}' \
  "http://localhost:$PORT/api/files/move")
if [[ "$MOVE_RES" != *"ok"* ]] || [ ! -f "$TEST_DIR/s2/renamed.txt" ] || [ -f "$TEST_DIR/s1/work_dir/renamed.txt" ]; then
    echo "[FAIL] 7. Cross-storage /api/files/move failed: $MOVE_RES"
    exit 1
fi
echo "  [PASS] 7. Cross-storage file move (/api/files/move) verified"

# 8. HTTP 206 byte-range media streaming (/api/files/stream)
STREAM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Range: bytes=0-4" "http://localhost:$PORT/api/files/stream?storage=test_s1&path=/sample.txt")
if [ "$STREAM_STATUS" != "206" ]; then
    echo "[FAIL] 8. HTTP 206 range streaming failed (status: $STREAM_STATUS)"
    exit 1
fi
echo "  [PASS] 8. HTTP 206 byte-range media streaming (/api/files/stream) verified"

# 9. Real-time ZIP streaming download (/api/files/download-zip)
ZIP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/api/files/download-zip?storage=test_s1&path=/sample.txt")
if [ "$ZIP_STATUS" != "200" ]; then
    echo "[FAIL] 9. ZIP streaming download failed (status: $ZIP_STATUS)"
    exit 1
fi
echo "  [PASS] 9. On-the-fly ZIP archive streaming (/api/files/download-zip) verified"

# 10. System hardware and disk stats API (/api/system/stats)
SYS_JSON=$(curl -s "http://localhost:$PORT/api/system/stats")
if [[ "$SYS_JSON" != *"hostname"* ]] || [[ "$SYS_JSON" != *"memory"* ]]; then
    echo "[FAIL] 10. /api/system/stats failed: $SYS_JSON"
    exit 1
fi
echo "  [PASS] 10. System hardware and disk telemetry (/api/system/stats) verified"

# 11. Static website hosting (/sites/...) and Sites Hub (/api/sites)
mkdir -p "$TEST_DIR/s2/sites/demo-site"
echo "<html><head><title>Harness Demo Site</title></head><body><h1>Harness Web Hosted</h1></body></html>" > "$TEST_DIR/s2/sites/demo-site/index.html"
SITE_BODY=$(curl -s "http://localhost:$PORT/sites/test_s2/sites/demo-site/")
SITES_LIST=$(curl -s "http://localhost:$PORT/api/sites")
if [[ "$SITE_BODY" != *"Harness Web Hosted"* ]] || [[ "$SITES_LIST" != *"Harness Demo Site"* ]]; then
    echo "[FAIL] 11. Static site hosting or /api/sites failed"
    exit 1
fi
echo "  [PASS] 11. Static website hosting (/sites/...) and Sites Hub (/api/sites) verified"

# 12. Subtitle auto-matching and live SRT/SMI to WebVTT conversion
dd if=/dev/zero of="$TEST_DIR/s1/demo.mp4" bs=1024 count=1500 2>/dev/null
cat << 'EOF' > "$TEST_DIR/s1/demo.ko.srt"
1
00:00:01,000 --> 00:00:03,000
Subtitle test line
EOF
cat << 'EOF' > "$TEST_DIR/s1/demo.smi"
<SAMI><BODY>
<SYNC Start=1000><P Class=KRCC>SMI subtitle test
<SYNC Start=3000><P Class=KRCC>&nbsp;
</BODY></SAMI>
EOF

SUB_LIST=$(curl -s "http://localhost:$PORT/api/files/subtitles?storage=test_s1&path=/demo.mp4")
SRT_VTT=$(curl -s "http://localhost:$PORT/api/files/subtitle?storage=test_s1&path=/demo.ko.srt")
SMI_VTT=$(curl -s "http://localhost:$PORT/api/files/subtitle?storage=test_s1&path=/demo.smi")
if [[ "$SUB_LIST" != *"demo.ko.srt"* ]] || [[ "$SRT_VTT" != *"WEBVTT"* ]] || [[ "$SMI_VTT" != *"SMI subtitle test"* ]]; then
    echo "[FAIL] 12. Subtitle discovery or WebVTT conversion failed"
    exit 1
fi
echo "  [PASS] 12. Subtitle auto-matching and live WebVTT streaming verified"

# 13. Cinema Hub and Photos Hub cross-storage aggregation (/api/cinema, /api/photos)
echo "fake photo content" > "$TEST_DIR/s1/snapshot.jpg"
CINEMA_RESP=$(curl -s "http://localhost:$PORT/api/cinema")
PHOTOS_RESP=$(curl -s "http://localhost:$PORT/api/photos?skip_special=true")
if [[ "$CINEMA_RESP" != *"demo.mp4"* ]] || [[ "$CINEMA_RESP" != *"hasSubtitle"* ]] || [[ "$PHOTOS_RESP" != *"snapshot.jpg"* ]]; then
    echo "[FAIL] 13. Cinema or Photos Hub API failed"
    exit 1
fi
echo "  [PASS] 13. Cinema Hub (/api/cinema) and Photos Hub (/api/photos) verified"

# 14. Music Hub audio library and album cover extraction (/api/music, /api/music/cover)
mkdir -p "$TEST_DIR/s1/Music/BlueNote"
echo "fake mp3 audio payload" > "$TEST_DIR/s1/Music/BlueNote/Bill Evans - Waltz.mp3"
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00\x60\x00\x60\x00\x00' > "$TEST_DIR/s1/Music/BlueNote/cover.jpg"

MUSIC_RESP=$(curl -s "http://localhost:$PORT/api/music")
COVER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/api/music/cover?storage=test_s1&path=%2FMusic%2FBlueNote%2FBill%20Evans%20-%20Waltz.mp3")
if [[ "$MUSIC_RESP" != *"Bill Evans"* ]] || [[ "$MUSIC_RESP" != *"BlueNote"* ]] || [ "$COVER_STATUS" != "200" ]; then
    echo "[FAIL] 14. Music Hub (/api/music) or cover art (/api/music/cover) failed (status: $COVER_STATUS)"
    exit 1
fi
echo "  [PASS] 14. Music Hub (/api/music) and album cover art (/api/music/cover) verified"

# 15. Trash lifecycle: soft delete, list, restore, selective delete, and empty (/api/trash/*)
echo "Trash restore payload" > "$TEST_DIR/s1/trash_restore.txt"
echo "Trash delete payload" > "$TEST_DIR/s1/trash_delete.txt"
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"storage":"test_s1","paths":["/trash_restore.txt","/trash_delete.txt"]}' \
  "http://localhost:$PORT/api/files/delete" > /dev/null

TRASH_LIST=$(curl -s "http://localhost:$PORT/api/trash?storage=test_s1")
if [[ "$TRASH_LIST" != *"trash_restore.txt"* ]] || [[ "$TRASH_LIST" != *"trash_delete.txt"* ]]; then
    echo "[FAIL] 15a. /api/trash list failed: $TRASH_LIST"
    exit 1
fi

RESTORE_ID=$(echo "$TRASH_LIST" | grep -o '"id":"[^"]*","storageId":"test_s1","originalPath":"/trash_restore.txt"' | cut -d'"' -f4)
DELETE_ID=$(echo "$TRASH_LIST" | grep -o '"id":"[^"]*","storageId":"test_s1","originalPath":"/trash_delete.txt"' | cut -d'"' -f4)

RESTORE_RESP=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"storage\":\"test_s1\",\"ids\":[\"$RESTORE_ID\"]}" \
  "http://localhost:$PORT/api/trash/restore")
if [[ "$RESTORE_RESP" != *"ok"* ]] || [ ! -f "$TEST_DIR/s1/trash_restore.txt" ]; then
    echo "[FAIL] 15b. /api/trash/restore failed: $RESTORE_RESP"
    exit 1
fi

DEL_TRASH_RESP=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"storage\":\"test_s1\",\"ids\":[\"$DELETE_ID\"]}" \
  "http://localhost:$PORT/api/trash/delete")
if [[ "$DEL_TRASH_RESP" != *"ok"* ]]; then
    echo "[FAIL] 15c. /api/trash/delete failed: $DEL_TRASH_RESP"
    exit 1
fi

EMPTY_RESP=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"storage":"test_s1"}' \
  "http://localhost:$PORT/api/trash/empty")
if [[ "$EMPTY_RESP" != *"ok"* ]]; then
    echo "[FAIL] 15d. /api/trash/empty failed: $EMPTY_RESP"
    exit 1
fi
echo "  [PASS] 15. Trash lifecycle (soft delete, list, restore, selective delete, empty) verified"

echo ""
echo "[Harness] All 15 E2E runtime verification scenarios passed."
