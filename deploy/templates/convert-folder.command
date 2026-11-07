#!/bin/bash
# ==============================================================================
# MiniNAS 독립 미디어 변환 도구 (Web Compatibility Converter)
# ==============================================================================
# - 비디오 영상: 100% 무손실 고속 복사 (-c:v copy)
# - 오디오 트랙: 브라우저 표준 AAC 고속 변환 (-c:a aac)
# - 내장 자막: MKV 내부 한국어 자막을 .ko.srt 로 자동 추출
# ==============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "=================================================================="
echo "⚡ MiniNAS 미디어 웹 호환 변환기 (AAC 변환 & 한국어 자막 추출)"
echo "=================================================================="

# 1. FFmpeg 위치 확인
FFMPEG_BIN=""
for p in "$DIR/tools/ffmpeg" "$DIR/ffmpeg" "/usr/local/bin/ffmpeg" "/opt/homebrew/bin/ffmpeg" "$(which ffmpeg 2>/dev/null)"; do
    if [ -n "$p" ] && [ -x "$p" ]; then
        FFMPEG_BIN="$p"
        break
    fi
done

if [ -z "$FFMPEG_BIN" ]; then
    echo "❌ FFmpeg 실행 파일을 찾을 수 없습니다."
    echo "💡 tools/ffmpeg 또는 /usr/local/bin/ffmpeg 에 FFmpeg 바이너리를 넣어주세요."
    echo ""
    read -p "엔터 키를 누르면 종료합니다..."
    exit 1
fi

echo "✅ FFmpeg 감지됨: $FFMPEG_BIN"
echo ""

# 2. 대상 폴더 입력 받기
DEFAULT_DIR="$HOME/Movies"
echo "변환할 동영상 폴더 경로를 입력하세요 (Finder에서 폴더를 드래그해도 됩니다):"
if [ -d "$DEFAULT_DIR" ]; then
    echo "기본값: $DEFAULT_DIR"
fi
read -p "폴더 경로 [엔터 누르면 기본값]: " TARGET_DIR

if [ -z "$TARGET_DIR" ]; then
    TARGET_DIR="$DEFAULT_DIR"
fi

# 작은따옴표/큰따옴표 및 공백 제거
TARGET_DIR=$(echo "$TARGET_DIR" | tr -d "'" | tr -d '"')

if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ 폴더가 존재하지 않습니다: $TARGET_DIR"
    read -p "엔터를 누르면 종료합니다..."
    exit 1
fi

echo ""
echo "📂 대상 폴더: $TARGET_DIR"
echo "선택 옵션:"
echo " 1) 원본 대체 (용량 절약, 비디오 화질 100% 동일 유지, 추천)"
echo " 2) _web.mp4 로 새 파일 생성 (원본 파일 보존)"
read -p "선택 (1 또는 2) [기본값: 1]: " MODE_CHOICE

REPLACE_ORIGINAL=true
if [ "$MODE_CHOICE" = "2" ]; then
    REPLACE_ORIGINAL=false
fi

echo ""
echo "🚀 변환을 시작합니다. 비디오 복사 방식이므로 파일당 몇 초 만에 완료됩니다..."
echo "------------------------------------------------------------------"

TOTAL_COUNT=0
SUCCESS_COUNT=0

# Loop through video files
find "$TARGET_DIR" -maxdepth 1 -type f \( -iname "*.mkv" -o -iname "*.mp4" \) | while read -r video_file; do
    FILENAME=$(basename "$video_file")
    EXT="${FILENAME##*.}"
    BASENAME="${FILENAME%.*}"
    
    # Skip temporary or already converted files
    if [[ "$BASENAME" == *"_web"* ]] || [[ "$BASENAME" == *"_tmp_"* ]]; then
        continue
    fi

    TOTAL_COUNT=$((TOTAL_COUNT + 1))
    echo "🎬 [$TOTAL_COUNT] 처리 중: $FILENAME"

    # 1. Extract Korean Subtitle if embedded
    SUB_OUT="$TARGET_DIR/${BASENAME}.ko.srt"
    if [ ! -f "$SUB_OUT" ]; then
        # Find korean subtitle stream
        STREAM_NUM=$("$FFMPEG_BIN" -i "$video_file" 2>&1 | grep -i "Subtitle" | grep -iE "kor|ko" | head -n 1 | sed -n 's/.*Stream #0:\([0-9]*\).*/\1/p')
        if [ -n "$STREAM_NUM" ]; then
            echo "   💬 한국어 자막(트랙 $STREAM_NUM) 추출 중..."
            "$FFMPEG_BIN" -y -i "$video_file" -map "0:$STREAM_NUM" "$SUB_OUT" >/dev/null 2>&1
            if [ -f "$SUB_OUT" ]; then
                echo "   ✅ 한국어 자막 추출 완료: ${BASENAME}.ko.srt"
            fi
        fi
    else
        echo "   ℹ️ 한국어 자막 파일이 이미 존재합니다."
    fi

    # 2. Convert Audio to AAC
    if [ "$REPLACE_ORIGINAL" = true ]; then
        TEMP_OUT="$TARGET_DIR/${BASENAME}_tmp_convert.mp4"
        FINAL_OUT="$TARGET_DIR/${BASENAME}.mp4"
        echo "   🔊 오디오 AAC 변환 중 (화질 100% 무손실 복사)..."
        "$FFMPEG_BIN" -y -i "$video_file" -c:v copy -c:a aac -b:a 192k "$TEMP_OUT" >/dev/null 2>&1
        if [ $? -eq 0 ] && [ -f "$TEMP_OUT" ]; then
            rm -f "$video_file"
            mv "$TEMP_OUT" "$FINAL_OUT"
            echo "   ✅ 변환 성공: $(basename "$FINAL_OUT")"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            echo "   ❌ 변환 실패"
            rm -f "$TEMP_OUT"
        fi
    else
        WEB_OUT="$TARGET_DIR/${BASENAME}_web.mp4"
        echo "   🔊 웹용 파일 생성 중 (${BASENAME}_web.mp4)..."
        "$FFMPEG_BIN" -y -i "$video_file" -c:v copy -c:a aac -b:a 192k "$WEB_OUT" >/dev/null 2>&1
        if [ $? -eq 0 ] && [ -f "$WEB_OUT" ]; then
            echo "   ✅ 생성 완료: $(basename "$WEB_OUT")"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            echo "   ❌ 생성 실패"
            rm -f "$WEB_OUT"
        fi
    fi
    echo "------------------------------------------------------------------"
done

echo ""
echo "🎉 모든 작업이 완료되었습니다! 웹 브라우저에서 소리와 자막을 확인해 보세요."
read -p "엔터를 누르면 창을 닫습니다..."
