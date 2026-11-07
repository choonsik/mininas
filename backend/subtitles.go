package main

import (
	"bytes"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding/korean"
)

type SubtitleTrack struct {
	Label    string `json:"label"`
	Language string `json:"language"`
	Format   string `json:"format"`
	Path     string `json:"path"`
	URL      string `json:"url"`
}

var (
	reSRTTimestampFlexible = regexp.MustCompile(`(\d{1,2}:\d{2}:\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2})[,.](\d{3})`)
	reSMISync              = regexp.MustCompile(`(?i)<SYNC\s+Start\s*=\s*['"]?(\d+)['"]?[^>]*>`)
	reHTMLTag              = regexp.MustCompile(`(?i)<[^>]+>`)
	reBR                   = regexp.MustCompile(`(?i)<br\s*/?>`)
	reFFmpegStream         = regexp.MustCompile(`(?m)Stream #0:(\d+)(?:\(([^)]+)\))?: Subtitle: (\w+)(?: \(([^)]+)\))?`)
	reASSTag               = regexp.MustCompile(`\{[^}]*\}`)
	reASSTopAlign          = regexp.MustCompile(`(?i)\{[^}]*\\an[789][^}]*\}`)
	reASSCenterAlign       = regexp.MustCompile(`(?i)\{[^}]*\\an[456][^}]*\}`)
	reFontTag              = regexp.MustCompile(`(?i)</?font[^>]*>`)
)

func cleanSubtitleText(raw string) string {
	t := strings.ReplaceAll(raw, `\N`, "\n")
	t = reASSTag.ReplaceAllString(t, "")
	t = reFontTag.ReplaceAllString(t, "")
	return strings.TrimSpace(t)
}

func findFFmpegPath() string {
	// 1. Check tools/ or same directory as mininas binary
	if len(os.Args) > 0 {
		execDir, err := filepath.Abs(filepath.Dir(os.Args[0]))
		if err == nil {
			for _, rel := range []string{"tools/ffmpeg", "tools/mininas-media", "ffmpeg", "mininas-media"} {
				localPath := filepath.Join(execDir, rel)
				if info, err := os.Stat(localPath); err == nil && !info.IsDir() {
					return localPath
				}
			}
		}
	}
	// 2. Check standard macOS locations
	for _, p := range []string{"/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg", "/usr/bin/ffmpeg"} {
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			return p
		}
	}
	// 3. System PATH lookup
	if p, err := exec.LookPath("ffmpeg"); err == nil {
		return p
	}
	return ""
}

func decodeToUTF8(data []byte) string {
	if utf8.Valid(data) {
		// Strip BOM if present
		if bytes.HasPrefix(data, []byte{0xEF, 0xBB, 0xBF}) {
			return string(data[3:])
		}
		return string(data)
	}

	// Try EUC-KR / CP949 decoding
	decoder := korean.EUCKR.NewDecoder()
	decoded, err := decoder.Bytes(data)
	if err == nil && utf8.Valid(decoded) {
		return string(decoded)
	}

	// Fallback: replace invalid utf8 sequences
	return strings.ToValidUTF8(string(data), "")
}

func ConvertSRTToVTT(srtContent string) string {
	normalized := strings.ReplaceAll(srtContent, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\r", "\n")

	lines := strings.Split(normalized, "\n")
	var result []string
	result = append(result, "WEBVTT", "")

	var currentSeq string
	var currentTime string
	var currentText []string
	var isTopAlign bool
	var isCenterAlign bool

	flushCue := func() {
		if currentTime == "" {
			currentSeq = ""
			currentText = nil
			isTopAlign = false
			isCenterAlign = false
			return
		}

		rawText := strings.Join(currentText, "\n")
		cleanedText := cleanSubtitleText(rawText)

		if cleanedText != "" {
			if currentSeq != "" {
				result = append(result, currentSeq)
			}
			timeLine := currentTime
			if isTopAlign {
				timeLine += " line:8%"
			} else if isCenterAlign {
				timeLine += " line:50%"
			}
			result = append(result, timeLine)
			result = append(result, cleanedText)
			result = append(result, "")
		}

		currentSeq = ""
		currentTime = ""
		currentText = nil
		isTopAlign = false
		isCenterAlign = false
	}

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Check if this line is a timestamp line (contains -->)
		if strings.Contains(line, "-->") && reSRTTimestampFlexible.MatchString(line) {
			// If we already had a cue pending, flush it
			if currentTime != "" {
				flushCue()
			}

			// Format timestamp to standard 00:00:00.000 format
			convertedTime := reSRTTimestampFlexible.ReplaceAllStringFunc(line, func(match string) string {
				submatch := reSRTTimestampFlexible.FindStringSubmatch(match)
				if len(submatch) == 5 {
					startHms := submatch[1]
					if len(startHms) == 7 {
						startHms = "0" + startHms
					}
					endHms := submatch[3]
					if len(endHms) == 7 {
						endHms = "0" + endHms
					}
					return fmt.Sprintf("%s.%s --> %s.%s", startHms, submatch[2], endHms, submatch[4])
				}
				return strings.ReplaceAll(match, ",", ".")
			})
			currentTime = strings.TrimSpace(convertedTime)
			continue
		}

		if currentTime == "" {
			// Before timestamp: could be sequence number (e.g. "1", "31")
			if trimmed != "" {
				currentSeq = trimmed
			}
		} else {
			// After timestamp: subtitle text
			if trimmed == "" {
				// Blank line indicates end of cue
				flushCue()
			} else {
				if reASSTopAlign.MatchString(line) {
					isTopAlign = true
				}
				if reASSCenterAlign.MatchString(line) {
					isCenterAlign = true
				}
				currentText = append(currentText, line)
			}
		}
	}

	// Flush trailing cue if any
	if currentTime != "" {
		flushCue()
	}

	return strings.Join(result, "\n")
}

type smiCue struct {
	startMs int64
	text    string
}

func msToVTT(ms int64) string {
	if ms < 0 {
		ms = 0
	}
	h := ms / 3600000
	m := (ms % 3600000) / 60000
	s := (ms % 60000) / 1000
	millis := ms % 1000
	return fmt.Sprintf("%02d:%02d:%02d.%03d", h, m, s, millis)
}

func cleanSMIText(raw string) string {
	t := reBR.ReplaceAllString(raw, "\n")
	t = reHTMLTag.ReplaceAllString(t, "")
	t = html.UnescapeString(t)
	t = strings.ReplaceAll(t, "&nbsp;", " ")
	t = strings.ReplaceAll(t, "\u00a0", " ") // non-breaking space
	lines := strings.Split(t, "\n")
	var cleaned []string
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if trimmed != "" {
			cleaned = append(cleaned, trimmed)
		}
	}
	return strings.Join(cleaned, "\n")
}

func ConvertSMIToVTT(smiContent string) string {
	normalized := strings.ReplaceAll(smiContent, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\r", "\n")

	indices := reSMISync.FindAllStringIndex(normalized, -1)
	if len(indices) == 0 {
		return "WEBVTT\n\n"
	}

	var rawCues []smiCue
	for i, idx := range indices {
		matchStr := normalized[idx[0]:idx[1]]
		syncSub := reSMISync.FindStringSubmatch(matchStr)
		if len(syncSub) < 2 {
			continue
		}
		ms, err := strconv.ParseInt(syncSub[1], 10, 64)
		if err != nil {
			continue
		}

		var body string
		if i+1 < len(indices) {
			body = normalized[idx[1]:indices[i+1][0]]
		} else {
			body = normalized[idx[1]:]
		}

		cleaned := cleanSMIText(body)
		rawCues = append(rawCues, smiCue{
			startMs: ms,
			text:    cleaned,
		})
	}

	var sb strings.Builder
	sb.WriteString("WEBVTT\n\n")

	for i := 0; i < len(rawCues); i++ {
		cur := rawCues[i]
		if strings.TrimSpace(cur.text) == "" {
			// Empty sync (marks end of previous subtitle or blank)
			continue
		}

		// Determine end time
		var endMs int64
		if i+1 < len(rawCues) {
			endMs = rawCues[i+1].startMs
		} else {
			endMs = cur.startMs + 4000
		}

		// If endMs is earlier or equal to startMs, give it at least 2 seconds
		if endMs <= cur.startMs {
			endMs = cur.startMs + 3000
		}

		// Cap maximum display time per cue to 7 seconds to avoid hanging subtitles
		if endMs-cur.startMs > 7000 {
			endMs = cur.startMs + 5000
		}

		sb.WriteString(fmt.Sprintf("%s --> %s\n", msToVTT(cur.startMs), msToVTT(endMs)))
		sb.WriteString(cur.text)
		sb.WriteString("\n\n")
	}

	return sb.String()
}

func detectSubtitleMeta(filename string, ext string) (lang string, label string) {
	nameLower := strings.ToLower(filename)
	formatUpper := strings.ToUpper(strings.TrimPrefix(ext, "."))

	switch {
	case strings.Contains(nameLower, ".ko.") || strings.Contains(nameLower, ".kor.") ||
		strings.Contains(nameLower, ".korean.") || strings.Contains(nameLower, "_ko") ||
		strings.Contains(nameLower, "한국어") || strings.Contains(nameLower, "한글"):
		return "ko", fmt.Sprintf("한국어 (%s)", formatUpper)

	case strings.Contains(nameLower, ".en.") || strings.Contains(nameLower, ".eng.") ||
		strings.Contains(nameLower, ".english.") || strings.Contains(nameLower, "_en") ||
		strings.Contains(nameLower, "영어"):
		return "en", fmt.Sprintf("English (%s)", formatUpper)

	case strings.Contains(nameLower, ".ja.") || strings.Contains(nameLower, ".jpn.") ||
		strings.Contains(nameLower, "_ja") || strings.Contains(nameLower, "일본어"):
		return "ja", fmt.Sprintf("日本語 (%s)", formatUpper)

	case strings.Contains(nameLower, ".zh.") || strings.Contains(nameLower, ".chi.") ||
		strings.Contains(nameLower, "_zh") || strings.Contains(nameLower, "중국어"):
		return "zh", fmt.Sprintf("中文 (%s)", formatUpper)

	default:
		return "ko", fmt.Sprintf("기본 자막 (%s)", formatUpper)
	}
}

func findMatchingSubtitles(storageId, videoRelPath string) ([]SubtitleTrack, error) {
	fullPath, err := resolveSafePath(storageId, videoRelPath)
	if err != nil {
		return nil, err
	}

	dir := filepath.Dir(fullPath)
	relDir := filepath.Dir(videoRelPath)
	if relDir == "." {
		relDir = ""
	}

	videoExt := filepath.Ext(fullPath)
	videoBase := strings.TrimSuffix(filepath.Base(fullPath), videoExt)
	cleanVideoBase := strings.TrimSuffix(videoBase, "_web")
	cleanVideoBaseLower := strings.ToLower(cleanVideoBase)

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	// Count video files in directory to allow fallback matching if single video
	videoCount := 0
	for _, e := range entries {
		if !e.IsDir() {
			ext := strings.ToLower(filepath.Ext(e.Name()))
			if ext == ".mp4" || ext == ".mkv" || ext == ".mov" || ext == ".webm" || ext == ".avi" || ext == ".m4v" {
				videoCount++
			}
		}
	}

	var tracks []SubtitleTrack
	validExts := map[string]bool{
		".srt": true,
		".vtt": true,
		".smi": true,
	}

	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(e.Name()))
		if !validExts[ext] {
			continue
		}

		subBase := strings.TrimSuffix(e.Name(), ext)
		subBaseLower := strings.ToLower(subBase)

		// Match condition:
		// 1) Subtitle name starts with video name (or base name without _web)
		// 2) Or if single video in directory, match any subtitle
		subBaseClean := strings.TrimSuffix(subBaseLower, "_web")
		matched := false
		if strings.HasPrefix(subBaseLower, cleanVideoBaseLower) || strings.HasPrefix(subBaseClean, cleanVideoBaseLower) {
			matched = true
		} else if videoCount == 1 {
			matched = true
		}

		if matched {
			lang, label := detectSubtitleMeta(e.Name(), ext)
			subRelPath := filepath.Join(relDir, e.Name())
			trackURL := fmt.Sprintf("/api/files/subtitle?storage=%s&path=%s",
				url.QueryEscape(storageId),
				url.QueryEscape(subRelPath))

			tracks = append(tracks, SubtitleTrack{
				Label:    label,
				Language: lang,
				Format:   strings.TrimPrefix(ext, "."),
				Path:     subRelPath,
				URL:      trackURL,
			})
		}
	}

	// 2. Discover embedded subtitles in MKV / MP4 containers via FFmpeg if available
	if embedded := findEmbeddedSubtitles(storageId, videoRelPath, fullPath); len(embedded) > 0 {
		tracks = append(tracks, embedded...)
	}

	// Sort tracks: Extracted Korean first, then Embedded Korean, then English, then Japanese, then others
	sort.Slice(tracks, func(i, j int) bool {
		score := func(t SubtitleTrack) int {
			if t.Language == "ko" {
				if strings.Contains(t.Label, "내장") {
					return 1
				}
				return 0 // Extracted external .ko.srt gets top priority!
			}
			if t.Language == "en" {
				return 2
			}
			if t.Language == "ja" {
				return 3
			}
			return 4
		}
		if score(tracks[i]) != score(tracks[j]) {
			return score(tracks[i]) < score(tracks[j])
		}
		return tracks[i].Label < tracks[j].Label
	})

	return tracks, nil
}

func findEmbeddedSubtitles(storageId, videoRelPath, fullPath string) []SubtitleTrack {
	ffmpeg := findFFmpegPath()
	if ffmpeg == "" {
		return nil
	}

	ext := strings.ToLower(filepath.Ext(fullPath))
	if ext != ".mkv" && ext != ".mp4" && ext != ".m4v" && ext != ".webm" && ext != ".mov" {
		return nil
	}

	cmd := exec.Command(ffmpeg, "-i", fullPath)
	out, _ := cmd.CombinedOutput()
	outStr := string(out)

	matches := reFFmpegStream.FindAllStringSubmatch(outStr, -1)
	if len(matches) == 0 {
		return nil
	}

	var tracks []SubtitleTrack
	supportedCodecs := map[string]bool{
		"subrip":   true,
		"ass":      true,
		"ssa":      true,
		"webvtt":   true,
		"mov_text": true,
		"text":     true,
	}

	for _, m := range matches {
		if len(m) < 4 {
			continue
		}
		streamNum := m[1]
		langRaw := strings.ToLower(m[2])
		codec := strings.ToLower(m[3])

		if !supportedCodecs[codec] {
			// Skip unsupported bitmap/graphic subtitles like hdmv_pgs_subtitle or dvd_subtitle
			continue
		}

		lang := langRaw
		if lang == "" {
			lang = "und"
		}
		langLabel := strings.ToUpper(lang)
		switch langRaw {
		case "kor", "ko", "korean":
			lang = "ko"
			langLabel = "한국어"
		case "eng", "en", "english":
			lang = "en"
			langLabel = "English"
		case "jpn", "ja", "japanese":
			lang = "ja"
			langLabel = "日本語"
		case "chi", "zho", "zh", "chinese":
			lang = "zh"
			langLabel = "中文"
		case "spa", "es", "spanish":
			lang = "es"
			langLabel = "Español"
		case "fre", "fra", "fr", "french":
			lang = "fr"
			langLabel = "Français"
		case "ger", "deu", "de", "german":
			lang = "de"
			langLabel = "Deutsch"
		case "ita", "it", "italian":
			lang = "it"
			langLabel = "Italiano"
		case "por", "pt", "portuguese":
			lang = "pt"
			langLabel = "Português"
		case "rus", "ru", "russian":
			lang = "ru"
			langLabel = "Русский"
		case "ara", "ar", "arabic":
			lang = "ar"
			langLabel = "العربية"
		default:
			if langRaw != "" {
				langLabel = strings.ToUpper(langRaw)
			} else {
				langLabel = fmt.Sprintf("트랙 %s", streamNum)
			}
		}

		label := fmt.Sprintf("내장 자막: %s (%s)", langLabel, strings.ToUpper(codec))
		trackURL := fmt.Sprintf("/api/files/subtitle?storage=%s&path=%s&stream=0:%s",
			url.QueryEscape(storageId),
			url.QueryEscape(videoRelPath),
			url.QueryEscape(streamNum))

		tracks = append(tracks, SubtitleTrack{
			Label:    label,
			Language: lang,
			Format:   codec,
			Path:     videoRelPath,
			URL:      trackURL,
		})
	}

	return tracks
}


func handleGetSubtitles(w http.ResponseWriter, r *http.Request) {
	storageId := r.URL.Query().Get("storage")
	videoPath := r.URL.Query().Get("path")
	if videoPath == "" {
		http.Error(w, `{"error":"path parameter required"}`, http.StatusBadRequest)
		return
	}

	tracks, err := findMatchingSubtitles(storageId, videoPath)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("[]"))
		return
	}
	if tracks == nil {
		tracks = []SubtitleTrack{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tracks)
}

func handleServeSubtitle(w http.ResponseWriter, r *http.Request) {
	storageId := r.URL.Query().Get("storage")
	relPath := r.URL.Query().Get("path")
	if relPath == "" {
		http.Error(w, "path parameter required", http.StatusBadRequest)
		return
	}

	fullPath, err := resolveSafePath(storageId, relPath)
	if err != nil {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	// 1. Check if this is an embedded subtitle extraction request (e.g. stream=0:2)
	stream := r.URL.Query().Get("stream")
	if stream != "" {
		ffmpeg := findFFmpegPath()
		if ffmpeg == "" {
			http.Error(w, "FFmpeg is required to extract embedded subtitles", http.StatusNotImplemented)
			return
		}

		info, err := os.Stat(fullPath)
		if err != nil {
			http.Error(w, "Video file not found", http.StatusNotFound)
			return
		}

		cacheDir := filepath.Join(os.Getenv("HOME"), ".mininas_cache", "subtitles")
		_ = os.MkdirAll(cacheDir, 0755)

		cleanStream := strings.ReplaceAll(stream, ":", "_")
		cacheKey := fmt.Sprintf("%x_%d_%s.vtt", md5.Sum([]byte(fullPath)), info.ModTime().Unix(), cleanStream)
		cachePath := filepath.Join(cacheDir, cacheKey)

		// Check if already cached
		if cInfo, err := os.Stat(cachePath); err == nil && cInfo.Size() > 0 {
			w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Cache-Control", "public, max-age=86400")
			http.ServeFile(w, r, cachePath)
			return
		}

		// Extract via ffmpeg
		cmd := exec.Command(ffmpeg, "-y", "-i", fullPath, "-map", stream, "-f", "webvtt", cachePath)
		if err := cmd.Run(); err != nil {
			http.Error(w, "Failed to extract embedded subtitle", http.StatusInternalServerError)
			return
		}

		// Sanitize extracted VTT cache (strip ASS override tags and font styling)
		if vttBytes, err := os.ReadFile(cachePath); err == nil {
			cleaned := cleanSubtitleText(string(vttBytes))
			if !strings.HasPrefix(strings.TrimSpace(cleaned), "WEBVTT") {
				cleaned = "WEBVTT\n\n" + cleaned
			}
			_ = os.WriteFile(cachePath, []byte(cleaned), 0644)
		}

		w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		http.ServeFile(w, r, cachePath)
		return
	}

	// 2. Regular external subtitle file (.vtt, .srt, .smi)
	rawBytes, err := os.ReadFile(fullPath)
	if err != nil {
		http.Error(w, "Subtitle file not found", http.StatusNotFound)
		return
	}

	utf8Text := decodeToUTF8(rawBytes)
	ext := strings.ToLower(filepath.Ext(fullPath))

	var vttOutput string
	switch ext {
	case ".vtt":
		cleaned := cleanSubtitleText(utf8Text)
		if !strings.HasPrefix(strings.TrimSpace(cleaned), "WEBVTT") {
			vttOutput = "WEBVTT\n\n" + cleaned
		} else {
			vttOutput = cleaned
		}
	case ".srt":
		vttOutput = ConvertSRTToVTT(utf8Text)
	case ".smi":
		vttOutput = ConvertSMIToVTT(utf8Text)
	default:
		http.Error(w, "Unsupported subtitle format", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Write([]byte(vttOutput))
}
