package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

type MediaCapabilities struct {
	Available bool   `json:"available"`
	Tool      string `json:"tool"`
	Path      string `json:"path"`
}

type MediaInspection struct {
	Path                  string          `json:"path"`
	Filename              string          `json:"filename"`
	VideoCodec            string          `json:"videoCodec"`
	AudioCodec            string          `json:"audioCodec"`
	HasWebCompatibleAudio bool            `json:"hasWebCompatibleAudio"`
	HasWebCompatibleVideo bool            `json:"hasWebCompatibleVideo"`
	HasExternalSubtitle   bool            `json:"hasExternalSubtitle"`
	EmbeddedSubtitles     []SubtitleTrack `json:"embeddedSubtitles"`
	HasKoreanSubtitle     bool            `json:"hasKoreanSubtitle"`
	NeedsConversion       bool            `json:"needsConversion"`
	Reason                string          `json:"reason"`
	Reasons               []string        `json:"reasons"`
}

type BatchConvertRequest struct {
	Storage          string `json:"storage"`
	Path             string `json:"path"` // file path or directory path
	ExtractSubtitles bool   `json:"extractSubtitles"`
	ConvertAudio     bool   `json:"convertAudio"`
	ReplaceOriginal  bool   `json:"replaceOriginal"`
}

type BatchConvertJob struct {
	ID             string    `json:"id"`
	Status         string    `json:"status"` // "running", "completed", "failed"
	TotalFiles     int       `json:"totalFiles"`
	ProcessedFiles int       `json:"processedFiles"`
	CurrentFile    string    `json:"currentFile"`
	Percent        int       `json:"percent"`
	CreatedAt      time.Time `json:"createdAt"`
	CompletedAt    time.Time `json:"completedAt,omitempty"`
	Errors         []string  `json:"errors,omitempty"`
}

var (
	jobsMutex sync.RWMutex
	jobsMap   = make(map[string]*BatchConvertJob)

	reAudioStream = regexp.MustCompile(`(?m)Stream #0:\d+(?:\([^)]+\))?: Audio: (\w+)`)
	reVideoStream = regexp.MustCompile(`(?m)Stream #0:\d+(?:\([^)]+\))?: Video: (\w+)`)
)

func getMediaToolPath() string {
	// 1. Check tools/ subdirectory relative to mininas executable
	if len(os.Args) > 0 {
		execDir, err := filepath.Abs(filepath.Dir(os.Args[0]))
		if err == nil {
			for _, tool := range []string{"tools/mininas-media", "tools/ffmpeg", "mininas-media", "ffmpeg"} {
				p := filepath.Join(execDir, tool)
				if info, err := os.Stat(p); err == nil && !info.IsDir() {
					return p
				}
			}
		}
	}
	// 2. Delegate to findFFmpegPath from subtitles.go
	return findFFmpegPath()
}

func inspectMediaFile(fullPath, relPath, storageId string) MediaInspection {
	inspection := MediaInspection{
		Path:                  relPath,
		Filename:              filepath.Base(fullPath),
		HasWebCompatibleAudio: true,
		HasWebCompatibleVideo: true,
	}

	tool := getMediaToolPath()
	if tool == "" {
		// Smart fallback by checking file name keywords
		var reasons []string
		fLower := strings.ToLower(filepath.Base(fullPath))
		isWebConverted := strings.HasSuffix(fLower, "_web.mp4")
		if !isWebConverted && (strings.Contains(fLower, "eac3") || strings.Contains(fLower, "ac3") || strings.Contains(fLower, "dts")) {
			inspection.HasWebCompatibleAudio = false
			inspection.NeedsConversion = true
			inspection.AudioCodec = "eac3"
			reasons = append(reasons, "오디오: EAC3 미지원 코덱 (무음)")
		}
		if !isWebConverted && (strings.HasSuffix(fLower, ".mkv") || strings.Contains(fLower, "multisub")) {
			inspection.NeedsConversion = true
			reasons = append(reasons, "자막: 외부 자막 없음 (MKV 내장 자막 추출 필요)")
		}
		inspection.Reasons = reasons
		inspection.Reason = strings.Join(reasons, " | ")
		return inspection
	}

	cmd := exec.Command(tool, "-i", fullPath)
	out, _ := cmd.CombinedOutput()
	outStr := string(out)

	// 1. Detect video codec
	vMatch := reVideoStream.FindStringSubmatch(outStr)
	if len(vMatch) > 1 {
		vCodec := strings.ToLower(vMatch[1])
		inspection.VideoCodec = vCodec
		// H.264 (avc1/h264) and VP8/VP9 are universally supported in web browsers
		if vCodec != "h264" && vCodec != "avc1" && vCodec != "vp8" && vCodec != "vp9" && vCodec != "av1" {
			inspection.HasWebCompatibleVideo = false
		}
	}

	// 2. Detect audio codec
	aMatch := reAudioStream.FindStringSubmatch(outStr)
	if len(aMatch) > 1 {
		aCodec := strings.ToLower(aMatch[1])
		inspection.AudioCodec = aCodec
		// AAC, MP3, Opus, Vorbis, FLAC are web compatible. EAC3, AC3, DTS, TrueHD are NOT.
		if aCodec == "eac3" || aCodec == "ac3" || aCodec == "dts" || aCodec == "truehd" || aCodec == "mlp" {
			inspection.HasWebCompatibleAudio = false
		}
	}

	// 3. Detect embedded subtitles
	embedded := findEmbeddedSubtitles(storageId, relPath, fullPath)
	inspection.EmbeddedSubtitles = embedded
	for _, sub := range embedded {
		if sub.Language == "ko" {
			inspection.HasKoreanSubtitle = true
			break
		}
	}

	// 4. Check external subtitles in directory
	dir := filepath.Dir(fullPath)
	vBase := strings.TrimSuffix(filepath.Base(fullPath), filepath.Ext(fullPath))
	vBaseClean := strings.TrimSuffix(vBase, "_web")
	for _, ext := range []string{".srt", ".vtt", ".smi"} {
		for _, lang := range []string{"", ".ko", ".kor", ".kr"} {
			for _, b := range []string{vBase, vBaseClean} {
				subPath := filepath.Join(dir, b+lang+ext)
				if _, err := os.Stat(subPath); err == nil {
					inspection.HasExternalSubtitle = true
					break
				}
			}
			if inspection.HasExternalSubtitle {
				break
			}
		}
		if inspection.HasExternalSubtitle {
			break
		}
	}

	// 5. Determine if conversion is needed
	var reasons []string
	if !inspection.HasWebCompatibleAudio {
		reasons = append(reasons, fmt.Sprintf("오디오(%s): 웹 브라우저 미지원 코덱 (무음)", strings.ToUpper(inspection.AudioCodec)))
	}
	if !inspection.HasExternalSubtitle {
		if inspection.HasKoreanSubtitle {
			reasons = append(reasons, "자막: MKV 내장 한국어 자막 추출 필요 (외부 자막 없음)")
		} else if len(inspection.EmbeddedSubtitles) > 0 {
			reasons = append(reasons, "자막: MKV 내장 자막 추출 필요 (외부 자막 없음)")
		} else if strings.HasSuffix(strings.ToLower(fullPath), ".mkv") {
			reasons = append(reasons, "자막: 외부 자막 파일(.ko.srt) 없음")
		}
	}

	if len(reasons) > 0 {
		inspection.NeedsConversion = true
		inspection.Reasons = reasons
		inspection.Reason = strings.Join(reasons, " | ")
	}

	return inspection
}

func handleGetMediaCapabilities(w http.ResponseWriter, r *http.Request) {
	toolPath := getMediaToolPath()
	cap := MediaCapabilities{
		Available: toolPath != "",
		Tool:      filepath.Base(toolPath),
		Path:      toolPath,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cap)
}

func handleInspectMedia(w http.ResponseWriter, r *http.Request) {
	storageId := r.URL.Query().Get("storage")
	relPath := r.URL.Query().Get("path")
	if relPath == "" {
		http.Error(w, `{"error":"path parameter required"}`, http.StatusBadRequest)
		return
	}

	fullPath, err := resolveSafePath(storageId, relPath)
	if err != nil {
		http.Error(w, `{"error":"access denied"}`, http.StatusForbidden)
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	if !info.IsDir() {
		inspection := inspectMediaFile(fullPath, relPath, storageId)
		json.NewEncoder(w).Encode(inspection)
		return
	}

	// Inspect all video files in directory
	entries, err := os.ReadDir(fullPath)
	if err != nil {
		http.Error(w, `{"error":"failed to read directory"}`, http.StatusInternalServerError)
		return
	}

	var results []MediaInspection
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(e.Name()))
		if ext == ".mkv" || ext == ".mp4" || ext == ".mov" || ext == ".avi" || ext == ".m4v" {
			itemRel := filepath.Join(relPath, e.Name())
			itemFull := filepath.Join(fullPath, e.Name())
			results = append(results, inspectMediaFile(itemFull, itemRel, storageId))
		}
	}

	json.NewEncoder(w).Encode(results)
}

func generateJobID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func handleBatchConvert(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	tool := getMediaToolPath()
	if tool == "" {
		http.Error(w, `{"error":"미디어 변환 도구(FFmpeg)가 설치되어 있지 않습니다."}`, http.StatusServiceUnavailable)
		return
	}

	var req BatchConvertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request format"}`, http.StatusBadRequest)
		return
	}

	targetPath, err := resolveSafePath(req.Storage, req.Path)
	if err != nil {
		http.Error(w, `{"error":"Invalid target path"}`, http.StatusForbidden)
		return
	}

	info, err := os.Stat(targetPath)
	if err != nil {
		http.Error(w, `{"error":"Target not found"}`, http.StatusNotFound)
		return
	}

	var filesToConvert []string
	if info.IsDir() {
		entries, _ := os.ReadDir(targetPath)
		for _, e := range entries {
			if !e.IsDir() {
				ext := strings.ToLower(filepath.Ext(e.Name()))
				if ext == ".mkv" || ext == ".mp4" || ext == ".mov" || ext == ".avi" || ext == ".m4v" {
					// Avoid re-converting already converted files
					if !strings.HasSuffix(strings.TrimSuffix(e.Name(), ext), "_web") {
						filesToConvert = append(filesToConvert, filepath.Join(targetPath, e.Name()))
					}
				}
			}
		}
	} else {
		filesToConvert = append(filesToConvert, targetPath)
	}

	if len(filesToConvert) == 0 {
		http.Error(w, `{"error":"변환할 대상 동영상 파일이 없습니다."}`, http.StatusBadRequest)
		return
	}

	jobID := generateJobID()
	job := &BatchConvertJob{
		ID:             jobID,
		Status:         "running",
		TotalFiles:     len(filesToConvert),
		ProcessedFiles: 0,
		CurrentFile:    filepath.Base(filesToConvert[0]),
		Percent:        0,
		CreatedAt:      time.Now(),
	}

	jobsMutex.Lock()
	jobsMap[jobID] = job
	jobsMutex.Unlock()

	// Launch conversion in background goroutine
	go runBatchConversion(job, tool, filesToConvert, req)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

func runBatchConversion(job *BatchConvertJob, tool string, files []string, req BatchConvertRequest) {
	for i, file := range files {
		jobsMutex.Lock()
		job.CurrentFile = filepath.Base(file)
		job.Percent = int((float64(i) / float64(len(files))) * 100)
		jobsMutex.Unlock()

		dir := filepath.Dir(file)
		ext := filepath.Ext(file)
		baseName := strings.TrimSuffix(filepath.Base(file), ext)

		// 1. Extract Korean (or first) embedded subtitle to .ko.srt if requested
		if req.ExtractSubtitles {
			outStr, _ := exec.Command(tool, "-i", file).CombinedOutput()
			matches := reFFmpegStream.FindAllStringSubmatch(string(outStr), -1)

			var targetStream string
			for _, m := range matches {
				if len(m) >= 4 {
					streamNum := m[1]
					langRaw := strings.ToLower(m[2])
					if strings.Contains(langRaw, "ko") || strings.Contains(langRaw, "kor") {
						targetStream = streamNum
						break
					}
					if targetStream == "" {
						targetStream = streamNum
					}
				}
			}

			if targetStream != "" {
				subOutPath := filepath.Join(dir, baseName+".ko.srt")
				// Only extract if not already exists
				if _, err := os.Stat(subOutPath); os.IsNotExist(err) {
					subCmd := exec.Command(tool, "-y", "-i", file, "-map", "0:"+targetStream, subOutPath)
					_ = subCmd.Run()
				}
			}
		}

		// 2. Convert Audio to AAC if requested
		if req.ConvertAudio {
			var outVideoPath string
			var tempPath string

			if req.ReplaceOriginal {
				tempPath = filepath.Join(dir, baseName+"_tmp_convert.mp4")
				outVideoPath = filepath.Join(dir, baseName+".mp4")
			} else {
				outVideoPath = filepath.Join(dir, baseName+"_web.mp4")
				tempPath = outVideoPath
			}

			// Ultra-fast stream copy for video, encode only audio to AAC
			cmd := exec.Command(tool, "-y", "-i", file, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", tempPath)
			err := cmd.Run()
			if err != nil {
				log.Printf("Conversion error for %s: %v", file, err)
				jobsMutex.Lock()
				job.Errors = append(job.Errors, fmt.Sprintf("%s: %v", filepath.Base(file), err))
				jobsMutex.Unlock()
				_ = os.Remove(tempPath)
			} else {
				if req.ReplaceOriginal {
					// Replace original file
					_ = os.Remove(file)
					_ = os.Rename(tempPath, outVideoPath)
				}
			}
		}

		jobsMutex.Lock()
		job.ProcessedFiles++
		job.Percent = int((float64(job.ProcessedFiles) / float64(len(files))) * 100)
		jobsMutex.Unlock()
	}

	jobsMutex.Lock()
	job.Status = "completed"
	job.Percent = 100
	job.CompletedAt = time.Now()
	jobsMutex.Unlock()
}

func handleGetBatchConvertStatus(w http.ResponseWriter, r *http.Request) {
	jobID := r.URL.Query().Get("jobId")
	if jobID == "" {
		http.Error(w, `{"error":"jobId required"}`, http.StatusBadRequest)
		return
	}

	jobsMutex.RLock()
	job, exists := jobsMap[jobID]
	jobsMutex.RUnlock()

	if !exists {
		http.Error(w, `{"error":"job not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}
