#!/bin/bash
# ==============================================================================
# MiniNAS 종합 검증 하네스 (Test & Verification Harness)
# ==============================================================================
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=========================================================="
echo "🛡️  MiniNAS 통합 검증 하네스 (Test Harness) 가동"
echo "=========================================================="
echo "실행 시각: $(date)"
echo ""

# Stage 1: Frontend Typecheck & Build
echo "📦 [Stage 1/4] 프론트엔드 빌드 및 TypeScript 정적 타입 검사"
cd "$ROOT_DIR/frontend"
npm run build
echo "  ✅ 프론트엔드 컴파일 & 에셋 번들링 통과"
echo ""

# Stage 2: Backend Unit & Integration Tests
echo "⚙️ [Stage 2/4] 백엔드 유닛 & 보안 통합 테스트"
cd "$ROOT_DIR/backend"
GO_BIN="/opt/homebrew/opt/go@1.24/bin/go"
if [ ! -f "$GO_BIN" ]; then
    GO_BIN="go"
fi
"$GO_BIN" test -v ./...
echo "  ✅ 백엔드 핵심 기능 & 경로 탈출 보안 테스트 통과"
echo ""

# Stage 3: Cross-Compile & Legacy macOS Symbol Check
echo "🔍 [Stage 3/4] 2011 맥 미니(macOS 10.13) 호환 바이너리 검증"
cd "$ROOT_DIR"
make build-intel > /dev/null
bash "$ROOT_DIR/harness/check_compatibility.sh" "$ROOT_DIR/mininas-intel-mac"
echo ""

# Stage 4: Live Runtime E2E Scenario Verification
echo "🧪 [Stage 4/4] 로컬 라이브 E2E 런타임 시나리오 검증"
cd "$ROOT_DIR"
bash "$ROOT_DIR/harness/e2e_verify.sh"
echo ""

echo "=========================================================="
echo "🎯 [HARNESS REPORT] 모든 검증 단계 100% 통과 (ALL GREEN)"
echo "   - 프론트엔드: React + TypeScript 정상"
echo "   - 백엔드 API: Go 1.24 정상"
echo "   - OS 호환성: macOS 10.13+ 인텔 x86_64 바이너리 무결성 확인"
echo "   - 실전 E2E: 업로드/스트리밍/ZIP/모니터링 시나리오 정상"
echo "=========================================================="
