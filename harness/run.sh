#!/bin/bash
# ==============================================================================
# MiniNAS Verification Harness (Stage 1 - Stage 4)
# ==============================================================================
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=========================================================="
echo "[HARNESS] MiniNAS Verification Harness Started"
echo "=========================================================="
echo "Timestamp: $(date)"
echo ""

# Stage 1: Frontend Typecheck & Build
echo "[STAGE 1/4] Frontend Build and TypeScript Static Check"
cd "$ROOT_DIR/frontend"
npm run build
echo "  [PASS] Frontend compilation and asset bundling succeeded"
echo ""

# Stage 2: Backend Unit & Integration Tests
echo "[STAGE 2/4] Backend Unit and Security Integration Tests"
cd "$ROOT_DIR/backend"
GO_BIN="/opt/homebrew/opt/go@1.24/bin/go"
if [ ! -f "$GO_BIN" ]; then
    GO_BIN="go"
fi
"$GO_BIN" test -v ./...
echo "  [PASS] Backend unit and path traversal security tests succeeded"
echo ""

# Stage 3: Cross-Compile & Legacy macOS Symbol Check
echo "[STAGE 3/4] macOS 10.13 Legacy Compatibility and Symbol Check"
cd "$ROOT_DIR"
make build-intel > /dev/null
bash "$ROOT_DIR/harness/check_compatibility.sh" "$ROOT_DIR/mininas-intel-mac"
rm -f "$ROOT_DIR/mininas-intel-mac"
echo ""

# Stage 4: Live Runtime E2E Scenario Verification
echo "[STAGE 4/4] Live Runtime E2E Scenario Verification"
cd "$ROOT_DIR"
bash "$ROOT_DIR/harness/e2e_verify.sh"
echo ""

echo "=========================================================="
echo "[HARNESS REPORT] All 4 verification stages passed (ALL GREEN)"
echo "  - Stage 1: React + TypeScript build verified"
echo "  - Stage 2: Go 1.24 unit and security tests verified"
echo "  - Stage 3: macOS 10.13+ Intel x86_64 binary symbols verified"
echo "  - Stage 4: 16 live E2E runtime scenarios verified"
echo "=========================================================="
