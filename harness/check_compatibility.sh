#!/bin/bash
# ==============================================================================
# MiniNAS 구형 macOS 10.13 호환성 심볼 검증 하네스
# ==============================================================================
set -e

TARGET_BIN="$1"
if [ -z "$TARGET_BIN" ]; then
    TARGET_BIN="backend/mininas-intel"
fi

if [ ! -f "$TARGET_BIN" ]; then
    echo "❌ 검증 대상 바이너리를 찾을 수 없습니다: $TARGET_BIN"
    exit 1
fi

echo "🔍 [Harness] macOS 호환성 및 심볼 정적 검사 중: $TARGET_BIN"

# 1. Mach-O x86_64 아키텍처 검사
ARCH=$(file "$TARGET_BIN")
if [[ "$ARCH" != *"x86_64"* ]]; then
    echo "❌ [FAIL] 바이너리가 인텔 x86_64 아키텍처가 아닙니다: $ARCH"
    exit 1
fi
echo "  ✅ 1. 아키텍처 검증 통과 (Mach-O x86_64)"

# 2. 구형 macOS 10.13 크래시 유발 심볼(_SecTrustCopyCertificateChain) 탐지
FORBIDDEN_SYMBOLS=("_SecTrustCopyCertificateChain")
for SYM in "${FORBIDDEN_SYMBOLS[@]}"; do
    if nm "$TARGET_BIN" 2>/dev/null | grep -q "$SYM"; then
        echo "❌ [FAIL] 구형 macOS에서 미지원되는 최신 심볼이 검출되었습니다: $SYM"
        exit 1
    fi
done
echo "  ✅ 2. macOS 10.13 호환성 검증 통과 (금지된 최신 심볼 0건)"

# 3. 파일 용량 점검 (단일 임베디드 바이너리 크기가 15MB 이하인지)
SIZE_MB=$(du -m "$TARGET_BIN" | cut -f1)
if [ "$SIZE_MB" -gt 15 ]; then
    echo "⚠️ [WARN] 바이너리 크기가 권장 기준(15MB)을 초과했습니다: ${SIZE_MB}MB"
else
    echo "  ✅ 3. 바이너리 용량 최적화 검증 통과 (${SIZE_MB}MB)"
fi

echo "🎉 모든 호환성 정적 검사를 완벽히 통과했습니다!"
