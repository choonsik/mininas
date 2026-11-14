#!/bin/bash
# ==============================================================================
# MiniNAS 배포 패키지 자동 생성 스크립트
# ==============================================================================
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
PACKAGE_NAME="mininas-v1.0.0-intel-mac"
BUNDLE_DIR="$RELEASE_DIR/$PACKAGE_NAME"
ARCHIVE_FILE="$RELEASE_DIR/${PACKAGE_NAME}.tar.gz"

echo "=========================================================="
echo "📦 MiniNAS 인텔 맥 미니 배포 패키징을 시작합니다."
echo "=========================================================="

# 1. 프론트엔드 빌드
echo "🎨 [1/4] 프론트엔드 빌드 중..."
cd "$ROOT_DIR/frontend"
npm run build

# 2. 백엔드 인텔 x86_64 바이너리 크로스 컴파일 (구형 macOS 10.13+ 호환을 위해 go1.24 사용)
echo "⚙️ [2/4] 백엔드 단일 바이너리(darwin/amd64) 컴파일 중..."
cd "$ROOT_DIR/backend"
GO_BIN="/opt/homebrew/opt/go@1.24/bin/go"
if [ ! -f "$GO_BIN" ]; then
    GO_BIN="go"
fi
CGO_ENABLED=0 MACOSX_DEPLOYMENT_TARGET=10.13 GOOS=darwin GOARCH=amd64 GOTOOLCHAIN=local "$GO_BIN" build -ldflags="-s -w" -o "$ROOT_DIR/backend/mininas-intel" .
cp -f "$ROOT_DIR/backend/mininas-intel" "$ROOT_DIR/mininas-intel-mac"

# 3. 배포 디렉토리 구성
echo "📂 [3/4] 배포 번들 디렉토리 패키징 중..."
rm -rf "$BUNDLE_DIR" "$ARCHIVE_FILE"
mkdir -p "$BUNDLE_DIR"

# 바이너리 및 스크립트 복사
cp "$ROOT_DIR/backend/mininas-intel" "$BUNDLE_DIR/mininas"
cp "$ROOT_DIR/deploy/config.default.json" "$BUNDLE_DIR/config.json"
cp "$ROOT_DIR/deploy/templates/install.sh" "$BUNDLE_DIR/install.sh"
cp "$ROOT_DIR/deploy/templates/uninstall.sh" "$BUNDLE_DIR/uninstall.sh"
cp "$ROOT_DIR/deploy/templates/status.sh" "$BUNDLE_DIR/status.sh"
cp "$ROOT_DIR/deploy/templates/optimize-macmini.sh" "$BUNDLE_DIR/optimize-macmini.sh"
cp "$ROOT_DIR/deploy/templates/start-nas.command" "$BUNDLE_DIR/start-nas.command"
cp "$ROOT_DIR/deploy/templates/stop-nas.command" "$BUNDLE_DIR/stop-nas.command"
cp "$ROOT_DIR/deploy/templates/restart-nas.command" "$BUNDLE_DIR/restart-nas.command"
cp "$ROOT_DIR/deploy/templates/check-config.command" "$BUNDLE_DIR/check-config.command"
cp "$ROOT_DIR/deploy/templates/convert-folder.command" "$BUNDLE_DIR/convert-folder.command"

chmod +x "$BUNDLE_DIR/mininas" "$BUNDLE_DIR"/*.sh "$BUNDLE_DIR"/*.command

# 4. tar.gz 압축
echo "🗜️ [4/4] 배포 아카이브(.tar.gz) 생성 중..."
cd "$RELEASE_DIR"
tar -czf "${PACKAGE_NAME}.tar.gz" "$PACKAGE_NAME"

echo "=========================================================="
echo "✅ 배포 패키지 생성이 완료되었습니다!"
echo "📍 아카이브 파일: $ARCHIVE_FILE"
ls -lh "$ARCHIVE_FILE"
echo ""
echo "💡 맥 미니로 복사할 파일: ${PACKAGE_NAME}.tar.gz"
echo "=========================================================="
