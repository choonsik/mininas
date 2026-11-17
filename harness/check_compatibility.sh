#!/bin/bash
# ==============================================================================
# MiniNAS macOS 10.13 Compatibility and Static Symbol Verification
# ==============================================================================
set -e

TARGET_BIN="$1"
if [ -z "$TARGET_BIN" ]; then
    TARGET_BIN="mininas-intel-mac"
fi

if [ ! -f "$TARGET_BIN" ]; then
    echo "[FAIL] Target binary not found: $TARGET_BIN"
    exit 1
fi

echo "[Harness] Inspecting macOS compatibility and symbol table: $TARGET_BIN"

# 1. Mach-O x86_64 architecture check
ARCH=$(file "$TARGET_BIN")
if [[ "$ARCH" != *"x86_64"* ]]; then
    echo "[FAIL] Binary is not Intel x86_64 architecture: $ARCH"
    exit 1
fi
echo "  [PASS] 1. Architecture verified (Mach-O x86_64)"

# 2. Undefined symbol check (nm -u) for macOS 12+ symbols that crash on macOS 10.13
FORBIDDEN_SYMBOLS=("_SecTrustCopyCertificateChain")
for SYM in "${FORBIDDEN_SYMBOLS[@]}"; do
    if nm -u "$TARGET_BIN" 2>/dev/null | grep -q "$SYM"; then
        echo "[FAIL] Unsupported macOS 12+ symbol detected: $SYM"
        exit 1
    fi
done
echo "  [PASS] 2. macOS 10.13 symbol compatibility verified (0 forbidden symbols)"

# 3. Single embedded binary size check (under 15MB threshold)
SIZE_MB=$(du -m "$TARGET_BIN" | cut -f1)
if [ "$SIZE_MB" -gt 15 ]; then
    echo "  [WARN] Binary size exceeds recommended 15MB limit: ${SIZE_MB}MB"
else
    echo "  [PASS] 3. Binary size budget verified (${SIZE_MB}MB <= 15MB)"
fi

echo "[Harness] Static compatibility verification completed."
