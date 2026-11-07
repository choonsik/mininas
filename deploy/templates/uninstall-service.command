#!/bin/bash
cd "$(dirname "$0")"

echo "=================================================="
echo "🛑 MiniNAS 백그라운드 서비스를 중지 및 제거합니다..."
echo "=================================================="

PLIST="$HOME/Library/LaunchAgents/com.mininas.server.plist"

# 1. launchd 서비스 언로드 및 plist 삭제
if [ -f "$PLIST" ]; then
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "✅ 부팅 시 자동 실행 서비스(launchd)가 성공적으로 해제되었습니다."
else
    echo "ℹ️ 등록된 서비스 파일이 없습니다."
fi

# 2. 실행 중인 프로세스 종료
killall mininas 2>/dev/null || true
echo "✅ 실행 중이던 MiniNAS 프로세스가 모두 종료되었습니다."
echo ""
echo "※ 저장소의 실제 파일(사진, 동영상 등)은 삭제되지 않고 그대로 보존됩니다."
echo "=================================================="
echo "완료되었습니다. 창을 닫으셔도 됩니다."
sleep 2
