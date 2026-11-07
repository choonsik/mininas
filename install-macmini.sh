#!/bin/bash
# 2011 Mac mini 자동 시작 서비스 등록 스크립트
# 맥 미니에서 이 스크립트를 실행하면 부팅 시 MiniNAS가 자동으로 백그라운드 실행됩니다.

set -e

APP_NAME="mininas-intel-mac"
TARGET_DIR="$HOME/Applications/MiniNAS"
STORAGE_DIR="$HOME/MiniNAS_Storage"
PLIST_PATH="$HOME/Library/LaunchAgents/com.mininas.server.plist"

echo "=== MiniNAS 맥 미니 무인 자동 실행 설치 ==="

# 1. 디렉토리 생성
mkdir -p "$TARGET_DIR"
mkdir -p "$STORAGE_DIR"
mkdir -p "$HOME/Library/LaunchAgents"

# 2. 실행 파일 복사
if [ -f "./$APP_NAME" ]; then
    cp "./$APP_NAME" "$TARGET_DIR/mininas"
    chmod +x "$TARGET_DIR/mininas"
elif [ -f "./mininas" ]; then
    cp "./mininas" "$TARGET_DIR/mininas"
    chmod +x "$TARGET_DIR/mininas"
else
    echo "❌ $APP_NAME 파일을 찾을 수 없습니다."
    exit 1
fi

# 3. launchd plist 파일 생성
cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mininas.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>$TARGET_DIR/mininas</string>
        <string>-port</string>
        <string>8080</string>
        <string>-dir</string>
        <string>$STORAGE_DIR</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$TARGET_DIR/mininas.log</string>
    <key>StandardErrorPath</key>
    <string>$TARGET_DIR/mininas_err.log</string>
</dict>
</plist>
EOF

# 4. 서비스 로드
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "🎉 설치가 완료되었습니다!"
echo "📍 스토리지 위치: $STORAGE_DIR"
echo "🌐 웹 접속 주소: http://$(ipconfig getifaddr en0 2>/dev/null || echo "맥미니-IP"):8080"
echo "이제 맥 미니가 재부팅되어도 자동으로 MiniNAS가 켜집니다."
