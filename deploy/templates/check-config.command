#!/bin/bash
cd "$(dirname "$0")"

echo "=================================================="
echo "🔍 MiniNAS config.json 정밀 진단 검사기"
echo "=================================================="

if [ -f "./mininas" ]; then
    ./mininas -config config.json -check
else
    echo "❌ mininas 실행 파일을 찾을 수 없습니다."
fi

echo "=================================================="
echo "확인 완료. 창을 닫으려면 아무 키나 누르세요..."
read -n 1
