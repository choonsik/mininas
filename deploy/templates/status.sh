#!/bin/bash
# ==============================================================================
# MiniNAS 상태 및 최근 로그 확인 스크립트
# ==============================================================================
LOGS_DIR="$HOME/Applications/MiniNAS/logs"

echo "=== MiniNAS 프로세스 상태 ==="
ps aux | grep "[m]ininas" || echo "⚠️ MiniNAS 프로세스가 실행 중이지 않습니다."

echo ""
echo "=== 최근 로그 (Standard Output) ==="
if [ -f "$LOGS_DIR/mininas.log" ]; then
    tail -n 15 "$LOGS_DIR/mininas.log"
else
    echo "로그 파일이 아직 없습니다."
fi

echo ""
echo "=== 최근 에러 로그 (Standard Error) ==="
if [ -f "$LOGS_DIR/mininas_err.log" ]; then
    tail -n 10 "$LOGS_DIR/mininas_err.log"
fi
