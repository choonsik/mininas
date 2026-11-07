#!/bin/bash
# ==============================================================================
# MiniNAS 맥 미니 설치 및 자동 시작 등록 스크립트
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$HOME/Applications/MiniNAS"
LOGS_DIR="$HOME/Applications/MiniNAS/logs"
PLIST_FILE="$HOME/Library/LaunchAgents/com.mininas.server.plist"

echo "=========================================================="
echo "🚀 MiniNAS (Mac mini 2011) 설치 및 서비스를 시작합니다."
echo "=========================================================="

# 1. 대상 디렉토리 준비
mkdir -p "$APP_DIR"
mkdir -p "$LOGS_DIR"
mkdir -p "$HOME/Library/LaunchAgents"

# 2. 실행 바이너리 및 설정 복사
echo "📦 1. 실행 파일 및 설정 복사 중..."
cp "$SCRIPT_DIR/mininas" "$APP_DIR/mininas"
chmod +x "$APP_DIR/mininas"

# config.json 동기화 (최신 설정을 Applications로 항상 갱신)
if [ -f "$SCRIPT_DIR/config.json" ]; then
    sed "s|\$HOME|$HOME|g" "$SCRIPT_DIR/config.json" > "$APP_DIR/config.json"
    echo "📄 최신 config.json 설정이 적용되었습니다: $APP_DIR/config.json"
elif [ ! -f "$APP_DIR/config.json" ]; then
    echo "{\"port\": 8080, \"storageRoot\": \"$HOME/MiniNAS_Storage\"}" > "$APP_DIR/config.json"
fi

# 3. launchd 서비스 등록 파일 생성
echo "⚙️ 2. 부팅 시 자동 실행 서비스(launchd) 등록 중..."
cat <<EOF > "$PLIST_FILE"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mininas.server</string>
    <key>WorkingDirectory</key>
    <string>$APP_DIR</string>
    <key>ProgramArguments</key>
    <array>
        <string>$APP_DIR/mininas</string>
        <string>-config</string>
        <string>$APP_DIR/config.json</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOGS_DIR/mininas.log</string>
    <key>StandardErrorPath</key>
    <string>$LOGS_DIR/mininas_err.log</string>
</dict>
</plist>
EOF

# 4. 서비스 로드 및 즉시 가동
launchctl unload "$PLIST_FILE" 2>/dev/null || true
launchctl load "$PLIST_FILE"

# IP 주소 감지
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

echo "=========================================================="
echo "🎉 MiniNAS 서비스가 백그라운드에서 정상 가동되었습니다!"
echo ""
echo "   🌐 웹 브라우저 접속 주소: http://${LOCAL_IP}:8080"
echo "   📂 설치 경로: $APP_DIR"
echo "   📋 로그 확인: tail -f $LOGS_DIR/mininas.log"
echo ""
echo "   ※ 맥 미니가 재부팅되어도 자동으로 켜집니다."
echo "=========================================================="
