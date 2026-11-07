package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/text/encoding/korean"
)

func TestConvertSRTToVTT(t *testing.T) {
	srt := `1
00:00:01,500 --> 00:00:04,200
안녕하세요, MiniNAS입니다.

2
00:00:05,100 --> 00:00:08,900
자막 테스트 중입니다.

31
00:01:23,450 --> 00:01:26,780
<font face="Trebuchet MS" size="45"><b>{\an8}하지만 무기를 사용 못 하게</b></font>`

	vtt := ConvertSRTToVTT(srt)
	if !strings.HasPrefix(vtt, "WEBVTT") {
		t.Fatalf("Expected WEBVTT header, got:\n%s", vtt)
	}

	if !strings.Contains(vtt, "00:00:01.500 --> 00:00:04.200") {
		t.Errorf("Expected converted timestamps with dots, got:\n%s", vtt)
	}

	if !strings.Contains(vtt, "안녕하세요, MiniNAS입니다.") {
		t.Errorf("Expected subtitle text, got:\n%s", vtt)
	}

	// Verify {\an8} is stripped and translated to line:8%
	if strings.Contains(vtt, `{\an8}`) || strings.Contains(vtt, `Trebuchet`) {
		t.Errorf("Expected {\\an8} and font tags to be removed, got:\n%s", vtt)
	}

	if !strings.Contains(vtt, "00:01:23.450 --> 00:01:26.780 line:8%") {
		t.Errorf("Expected top alignment line:8%% setting, got:\n%s", vtt)
	}

	if !strings.Contains(vtt, "<b>하지만 무기를 사용 못 하게</b>") {
		t.Errorf("Expected cleaned bold dialogue text, got:\n%s", vtt)
	}
}

func TestConvertSMIToVTT(t *testing.T) {
	smi := `<SAMI>
<HEAD>
<TITLE>Test Subtitle</TITLE>
<STYLE TYPE="text/css">
<!--
.KRCC { Name:Korean; lang:ko-KR; SAMIType:CC; }
-->
</STYLE>
</HEAD>
<BODY>
<SYNC Start=1000><P Class=KRCC>
첫 번째 자막 대사<br>두 번째 줄
<SYNC Start=4000><P Class=KRCC>&nbsp;
<SYNC Start=5500><P Class=KRCC>
두 번째 자막 대사
<SYNC Start=9000><P Class=KRCC>&nbsp;
</BODY>
</SAMI>`

	vtt := ConvertSMIToVTT(smi)
	if !strings.HasPrefix(vtt, "WEBVTT") {
		t.Fatalf("Expected WEBVTT header, got:\n%s", vtt)
	}

	if !strings.Contains(vtt, "00:00:01.000 --> 00:00:04.000") {
		t.Errorf("Expected first cue 1000 -> 4000, got:\n%s", vtt)
	}

	if !strings.Contains(vtt, "첫 번째 자막 대사\n두 번째 줄") {
		t.Errorf("Expected cue text with line break, got:\n%s", vtt)
	}

	if !strings.Contains(vtt, "00:00:05.500 --> 00:00:09.000") {
		t.Errorf("Expected second cue 5500 -> 9000, got:\n%s", vtt)
	}

	if !strings.Contains(vtt, "두 번째 자막 대사") {
		t.Errorf("Expected second cue text, got:\n%s", vtt)
	}
}

func TestDecodeToUTF8(t *testing.T) {
	// 1. UTF-8
	original := "안녕하세요 세계"
	if res := decodeToUTF8([]byte(original)); res != original {
		t.Errorf("UTF-8 decoding failed: expected %s, got %s", original, res)
	}

	// 2. UTF-8 with BOM
	withBOM := append([]byte{0xEF, 0xBB, 0xBF}, []byte(original)...)
	if res := decodeToUTF8(withBOM); res != original {
		t.Errorf("UTF-8 with BOM decoding failed: expected %s, got %s", original, res)
	}

	// 3. EUC-KR
	euckrBytes, err := korean.EUCKR.NewEncoder().Bytes([]byte("한글 자막 테스트"))
	if err != nil {
		t.Fatalf("Failed to encode EUC-KR: %v", err)
	}
	if res := decodeToUTF8(euckrBytes); res != "한글 자막 테스트" {
		t.Errorf("EUC-KR decoding failed: expected '한글 자막 테스트', got '%s'", res)
	}
}

func TestFindMatchingSubtitles(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "mininas_sub_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	activeStorages = []StorageEntry{
		{ID: "test", Name: "Test", Path: tmpDir},
	}

	// Create files
	_ = os.WriteFile(filepath.Join(tmpDir, "movie.mp4"), []byte("video"), 0644)
	_ = os.WriteFile(filepath.Join(tmpDir, "movie.ko.srt"), []byte("srt"), 0644)
	_ = os.WriteFile(filepath.Join(tmpDir, "movie.en.vtt"), []byte("vtt"), 0644)
	_ = os.WriteFile(filepath.Join(tmpDir, "movie.smi"), []byte("smi"), 0644)
	_ = os.WriteFile(filepath.Join(tmpDir, "other.txt"), []byte("txt"), 0644)

	tracks, err := findMatchingSubtitles("test", "movie.mp4")
	if err != nil {
		t.Fatalf("findMatchingSubtitles failed: %v", err)
	}

	if len(tracks) != 3 {
		t.Fatalf("Expected 3 subtitle tracks, got %d", len(tracks))
	}

	// Korean should be first
	if tracks[0].Language != "ko" {
		t.Errorf("Expected first track to be Korean, got %s", tracks[0].Language)
	}
}
