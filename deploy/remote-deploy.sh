#!/bin/bash
# ==============================================================================
# MiniNAS 원클릭 원격 자동 배포 스크립트 (SSH / SCP 기반)
# 사용법: ./deploy/remote-deploy.sh [사용자@맥미니-IP]
# 예시:   ./deploy/remote-deploy.sh user@192.168.1.100
# ==============================================================================
set -e

REMOTE_TARGET="$1"

if [ -z "$REMOTE_TARGET" ]; then
    echo "❌ 대상 맥 미니의 SSH 접속 주소를 입력해주세요."
    echo "사용법: $0 [사용자@맥미니-IP]"
    echo "예시:   $0 user@192.168.1.100"
    echo "예시:   $0 user@macmini.local"
    exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_NAME="mininas-v0.2-intel-mac"
ARCHIVE_FILE="$ROOT_DIR/release/${PACKAGE_NAME}.tar.gz"

echo "=========================================================="
echo "🚀 MiniNAS 원격 자동 배포 시작: $REMOTE_TARGET"
echo "=========================================================="

# 1. 패키지 빌드
echo "📦 1. 최신 버전 빌드 및 패키징..."
bash "$ROOT_DIR/deploy/package.sh"

# 2. 맥 미니로 파일 전송 (SCP)
echo "📡 2. 원격 맥 미니로 배포 파일 전송 중..."
scp "$ARCHIVE_FILE" "$REMOTE_TARGET:~/${PACKAGE_NAME}.tar.gz"

# 3. 원격 맥 미니에서 압축 해제 및 서비스 재시작 (SSH)
echo "⚡ 3. 원격 맥 미니에서 서비스 갱신 및 재시작..."
ssh "$REMOTE_TARGET" "
    set -e
    cd ~
    tar -xzf ${PACKAGE_NAME}.tar.gz
    cd ${PACKAGE_NAME}
    ./install.sh
    rm -f ~/${PACKAGE_NAME}.tar.gz
"

echo "=========================================================="
echo "🎉 원격 배포가 성공적으로 완료되었습니다!"
echo "=========================================================="
