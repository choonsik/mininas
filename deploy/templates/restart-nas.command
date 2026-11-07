#!/bin/bash
cd "$(dirname "$0")"

echo "=================================================="
echo "🔄 MiniNAS 설정 검사 및 재시작"
echo "=================================================="

# 1. config.json 사전 문법 & 경로 유효성 검사 (Pre-flight check)
echo "🔍 1. config.json 유효성 사전 검사 중..."
if [ -f "./mininas" ]; then
    if ! ./mininas -config config.json -check; then
        echo ""
        echo "❌ [재시작 중단] config.json 설정에 오류가 발견되었습니다!"
        echo "기존에 정상 동작 중인 NAS 서비스를 보호하기 위해 재시작을 취소합니다."
        echo "오류 내용을 확인하시고 config.json을 수정한 후 다시 실행해주세요."
        echo "=================================================="
        echo "창을 닫으려면 아무 키나 누르세요..."
        read -n 1
        exit 1
    fi
fi
echo ""
echo "⚙️ 2. 서비스를 안전하게 재시작합니다..."

# 종료 후 재시작
./uninstall.sh >/dev/null 2>&1 || true
sleep 1
./install.sh

echo "=================================================="
echo "🎉 MiniNAS가 성공적으로 재시작되었습니다!"
echo "=================================================="
sleep 2
