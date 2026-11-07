#!/bin/bash
# ==============================================================================
# Mac mini 2011 무인 홈 서버 최적화 스크립트 (관리자 암호 필요)
# ==============================================================================
set -e

echo "=========================================================="
echo "🔧 Mac mini 24시간 무인 홈 서버 최적화 설정을 적용합니다."
echo "=========================================================="

echo "1. 전원 및 절전 관리(pmset) 최적화 적용 중..."
sudo pmset -a displaysleep 2     # 화면 2분 후 끔
sudo pmset -a disksleep 0        # 디스크 절전 끔 (빠른 응답)
sudo pmset -a sleep 0            # 시스템 절전 완전 해제 (24시간 가동)
sudo pmset -a autorestart 1      # 정전 후 전원 복구 시 자동 켜짐
sudo pmset -a womp 1             # Wake-on-LAN 지원

echo "2. 시스템 정체 시 자동 재부팅 활성화..."
sudo systemsetup -setrestartfreeze on 2>/dev/null || true

echo "3. 화면 보호기 비활성화..."
defaults -currentHost write com.apple.screensaver idleTime 0

echo "=========================================================="
echo "🎉 최적화가 완료되었습니다!"
echo "현재 전원 설정 상태:"
pmset -g
echo "=========================================================="
