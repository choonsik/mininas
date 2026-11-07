#!/bin/bash
# ==============================================================================
# MiniNAS 서비스 중지 및 제거 스크립트
# ==============================================================================
PLIST_FILE="$HOME/Library/LaunchAgents/com.mininas.server.plist"

echo "🛑 MiniNAS 백그라운드 서비스를 중지합니다..."
launchctl unload "$PLIST_FILE" 2>/dev/null || true
rm -f "$PLIST_FILE"

echo "✅ 서비스가 성공적으로 중지 및 자동 시작에서 제거되었습니다."
echo "※ 사용자 데이터(저장소 및 로그)는 삭제되지 않고 그대로 보존됩니다."
