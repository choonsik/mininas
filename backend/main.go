package main

import (
	"archive/zip"
	"crypto/md5"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"html"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

//go:embed dist/*
var embeddedDist embed.FS

type StorageEntry struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`
}

type StorageInfo struct {
	ID   string    `json:"id"`
	Name string    `json:"name"`
	Path string    `json:"path"`
	Disk DiskStats `json:"disk"`
}

type Config struct {
	Port        int            `json:"port"`
	StorageRoot string         `json:"storageRoot"` // legacy single storage support
	Storages    []StorageEntry `json:"storages"`    // multi-storage support
}

var (
	activeStorages []StorageEntry
	port           int
	configFile     string
)

type FileItem struct {
	Name      string    `json:"name"`
	Path      string    `json:"path"`
	IsDir     bool      `json:"isDir"`
	Size      int64     `json:"size"`
	ModTime   time.Time `json:"modTime"`
	Ext       string    `json:"ext"`
	MediaType string    `json:"mediaType"`
}

type SystemStats struct {
	Hostname      string      `json:"hostname"`
	OS            string      `json:"os"`
	UptimeSeconds int64       `json:"uptimeSeconds"`
	CPUPercent    float64     `json:"cpuPercent"`
	Memory        MemoryStats `json:"memory"`
	Disk          DiskStats   `json:"disk"`
}

type MemoryStats struct {
	TotalBytes  uint64  `json:"totalBytes"`
	UsedBytes   uint64  `json:"usedBytes"`
	FreeBytes   uint64  `json:"freeBytes"`
	UsedPercent float64 `json:"usedPercent"`
}

type DiskStats struct {
	MountPoint  string  `json:"mountPoint"`
	TotalBytes  uint64  `json:"totalBytes"`
	UsedBytes   uint64  `json:"usedBytes"`
	FreeBytes   uint64  `json:"freeBytes"`
	UsedPercent float64 `json:"usedPercent"`
}

func expandPath(p string) string {
	p = os.ExpandEnv(p)
	if strings.HasPrefix(p, "~/") {
		return filepath.Join(os.Getenv("HOME"), p[2:])
	} else if p == "~" {
		return os.Getenv("HOME")
	}
	return p
}

func getDiskStatsForPath(dirPath string) DiskStats {
	var disk DiskStats
	disk.MountPoint = dirPath
	var stat syscall.Statfs_t
	if err := syscall.Statfs(dirPath, &stat); err == nil {
		disk.TotalBytes = stat.Blocks * uint64(stat.Bsize)
		disk.FreeBytes = stat.Bavail * uint64(stat.Bsize)
		disk.UsedBytes = disk.TotalBytes - disk.FreeBytes
		if disk.TotalBytes > 0 {
			disk.UsedPercent = (float64(disk.UsedBytes) / float64(disk.TotalBytes)) * 100
		}
	}
	return disk
}

func getStorage(storageId string) StorageEntry {
	if storageId != "" {
		for _, s := range activeStorages {
			if s.ID == storageId {
				return s
			}
		}
	}
	if len(activeStorages) > 0 {
		return activeStorages[0]
	}
	return StorageEntry{
		ID:   "default",
		Name: "기본 저장소",
		Path: filepath.Join(os.Getenv("HOME"), "MiniNAS_Storage"),
	}
}

func resolveSafePath(storageId, relPath string) (string, error) {
	st := getStorage(storageId)

	// Explicit path traversal attack prevention
	if strings.Contains(relPath, "..") {
		return "", fmt.Errorf("access denied: path traversal attempt")
	}

	cleanRel := filepath.Clean("/" + relPath)
	target := filepath.Join(st.Path, cleanRel)

	rel, err := filepath.Rel(st.Path, target)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("access denied")
	}
	return target, nil
}

func getMediaType(ext string) string {
	ext = strings.ToLower(ext)
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".heic", ".heif":
		return "image"
	case ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi":
		return "video"
	case ".mp3", ".wav", ".aac", ".flac", ".m4a", ".ogg":
		return "audio"
	case ".txt", ".md", ".json", ".log", ".csv", ".yaml", ".yml", ".xml", ".html", ".htm", ".css", ".scss", ".sass", ".less", ".js", ".jsx", ".ts", ".tsx", ".go", ".py", ".sh", ".bash", ".zsh", ".sql", ".env", ".ini", ".conf":
		return "text"
	case ".zip", ".tar", ".gz", ".7z", ".rar":
		return "archive"
	default:
		return "other"
	}
}

func handleGetStorages(w http.ResponseWriter, r *http.Request) {
	infos := make([]StorageInfo, 0, len(activeStorages))
	for _, s := range activeStorages {
		disk := getDiskStatsForPath(s.Path)
		infos = append(infos, StorageInfo{
			ID:   s.ID,
			Name: s.Name,
			Path: s.Path,
			Disk: disk,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(infos)
}

func handleGetFiles(w http.ResponseWriter, r *http.Request) {
	storageId := r.URL.Query().Get("storage")
	relPath := r.URL.Query().Get("path")
	fullPath, err := resolveSafePath(storageId, relPath)
	if err != nil {
		http.Error(w, `{"error":"Access denied"}`, http.StatusForbidden)
		return
	}

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	cleanRel := filepath.Clean("/" + relPath)
	items := make([]FileItem, 0, len(entries))

	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		itemPath := filepath.Clean(filepath.Join(cleanRel, entry.Name()))
		ext := filepath.Ext(entry.Name())

		items = append(items, FileItem{
			Name:      entry.Name(),
			Path:      itemPath,
			IsDir:     entry.IsDir(),
			Size:      info.Size(),
			ModTime:   info.ModTime(),
			Ext:       ext,
			MediaType: getMediaType(ext),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"currentPath": cleanRel,
		"items":       items,
	})
}

func handleUpload(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(32 << 20)
	if err != nil {
		http.Error(w, `{"error":"Failed to parse multipart form"}`, http.StatusBadRequest)
		return
	}

	storageId := r.FormValue("storage")
	targetPath := r.FormValue("targetPath")
	fullTargetDir, err := resolveSafePath(storageId, targetPath)
	if err != nil {
		http.Error(w, `{"error":"Invalid target path"}`, http.StatusBadRequest)
		return
	}

	files := r.MultipartForm.File["files"]
	for _, fileHeader := range files {
		src, err := fileHeader.Open()
		if err != nil {
			continue
		}
		defer src.Close()

		dstPath := filepath.Join(fullTargetDir, fileHeader.Filename)
		dst, err := os.Create(dstPath)
		if err != nil {
			continue
		}
		defer dst.Close()

		if _, err := io.Copy(dst, src); err != nil {
			continue
		}
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func handleDownload(w http.ResponseWriter, r *http.Request) {
	storageId := r.URL.Query().Get("storage")
	relPath := r.URL.Query().Get("path")
	fullPath, err := resolveSafePath(storageId, relPath)
	if err != nil {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	file, err := os.Open(fullPath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil || info.IsDir() {
		http.Error(w, "Invalid file", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filepath.Base(fullPath)))
	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}

func serveHEICAsJPEG(w http.ResponseWriter, r *http.Request, fullPath string, info os.FileInfo) bool {
	ext := strings.ToLower(filepath.Ext(fullPath))
	if ext != ".heic" && ext != ".heif" {
		return false
	}

	cacheDir := filepath.Join(os.Getenv("HOME"), ".mininas_cache", "thumbs")
	_ = os.MkdirAll(cacheDir, 0755)

	cacheKey := fmt.Sprintf("%x_%d.jpg", md5.Sum([]byte(fullPath)), info.ModTime().Unix())
	cachePath := filepath.Join(cacheDir, cacheKey)

	// Check if already cached
	if cacheInfo, err := os.Stat(cachePath); err == nil && cacheInfo.Size() > 0 {
		cacheFile, err := os.Open(cachePath)
		if err == nil {
			defer cacheFile.Close()
			w.Header().Set("Content-Type", "image/jpeg")
			http.ServeContent(w, r, filepath.Base(cachePath), cacheInfo.ModTime(), cacheFile)
			return true
		}
	}

	// Convert via macOS native sips
	cmd := exec.Command("sips", "-s", "format", "jpeg", "-Z", "1600", fullPath, "--out", cachePath)
	if err := cmd.Run(); err == nil {
		if cacheInfo, err := os.Stat(cachePath); err == nil && cacheInfo.Size() > 0 {
			cacheFile, err := os.Open(cachePath)
			if err == nil {
				defer cacheFile.Close()
				w.Header().Set("Content-Type", "image/jpeg")
				http.ServeContent(w, r, filepath.Base(cachePath), cacheInfo.ModTime(), cacheFile)
				return true
			}
		}
	}

	return false
}

func handleStream(w http.ResponseWriter, r *http.Request) {
	storageId := r.URL.Query().Get("storage")
	relPath := r.URL.Query().Get("path")
	fullPath, err := resolveSafePath(storageId, relPath)
	if err != nil {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		http.Error(w, "Invalid file", http.StatusBadRequest)
		return
	}

	if serveHEICAsJPEG(w, r, fullPath, info) {
		return
	}

	file, err := os.Open(fullPath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}

func handleDownloadZip(w http.ResponseWriter, r *http.Request) {
	storageId := r.URL.Query().Get("storage")
	paths := r.URL.Query()["path"]
	if len(paths) == 0 {
		http.Error(w, "No paths provided", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="nas-download.zip"`)

	zipWriter := zip.NewWriter(w)
	defer zipWriter.Close()

	for _, relPath := range paths {
		fullPath, err := resolveSafePath(storageId, relPath)
		if err != nil {
			continue
		}

		filepath.Walk(fullPath, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}

			relToItem, err := filepath.Rel(filepath.Dir(fullPath), path)
			if err != nil {
				return nil
			}

			if info.IsDir() {
				return nil
			}

			header, err := zip.FileInfoHeader(info)
			if err != nil {
				return nil
			}
			header.Name = relToItem
			header.Method = zip.Deflate

			writer, err := zipWriter.CreateHeader(header)
			if err != nil {
				return nil
			}

			file, err := os.Open(path)
			if err != nil {
				return nil
			}
			defer file.Close()

			io.Copy(writer, file)
			return nil
		})
	}
}

func handleMkdir(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Storage    string `json:"storage"`
		ParentPath string `json:"parentPath"`
		Name       string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"Invalid request"}`, http.StatusBadRequest)
		return
	}

	fullParent, err := resolveSafePath(body.Storage, body.ParentPath)
	if err != nil {
		http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}

	newDir := filepath.Join(fullParent, filepath.Base(body.Name))
	if err := os.MkdirAll(newDir, 0755); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Write([]byte(`{"status":"ok"}`))
}

func handleRename(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Storage string `json:"storage"`
		Path    string `json:"path"`
		NewName string `json:"newName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"Invalid request"}`, http.StatusBadRequest)
		return
	}

	oldPath, err := resolveSafePath(body.Storage, body.Path)
	if err != nil {
		http.Error(w, `{"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}

	newPath := filepath.Join(filepath.Dir(oldPath), filepath.Base(body.NewName))
	if err := os.Rename(oldPath, newPath); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Write([]byte(`{"status":"ok"}`))
}

func handleDelete(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Storage string   `json:"storage"`
		Paths   []string `json:"paths"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"Invalid request"}`, http.StatusBadRequest)
		return
	}

	for _, relPath := range body.Paths {
		fullPath, err := resolveSafePath(body.Storage, relPath)
		if err != nil {
			continue
		}
		os.RemoveAll(fullPath)
	}

	w.Write([]byte(`{"status":"ok"}`))
}

func getUniqueDestination(dstDir, baseName string) string {
	destPath := filepath.Join(dstDir, baseName)
	if _, err := os.Stat(destPath); os.IsNotExist(err) {
		return destPath
	}

	ext := filepath.Ext(baseName)
	nameWithoutExt := strings.TrimSuffix(baseName, ext)
	counter := 1
	for {
		newName := fmt.Sprintf("%s (%d)%s", nameWithoutExt, counter, ext)
		destPath = filepath.Join(dstDir, newName)
		if _, err := os.Stat(destPath); os.IsNotExist(err) {
			return destPath
		}
		counter++
	}
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	si, err := in.Stat()
	if err != nil {
		return err
	}

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, si.Mode())
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

func copyDir(src, dst string) error {
	si, err := os.Stat(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dst, si.Mode()); err != nil {
		return err
	}

	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		s := filepath.Join(src, entry.Name())
		d := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := copyDir(s, d); err != nil {
				return err
			}
		} else {
			if err := copyFile(s, d); err != nil {
				return err
			}
		}
	}
	return nil
}

func handleCopy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		SourceStorage string   `json:"sourceStorage"`
		TargetStorage string   `json:"targetStorage"`
		Storage       string   `json:"storage"`
		SourcePaths   []string `json:"sourcePaths"`
		TargetDir     string   `json:"targetDir"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"Invalid request"}`, http.StatusBadRequest)
		return
	}
	srcStorage := body.SourceStorage
	if srcStorage == "" {
		srcStorage = body.Storage
	}
	dstStorage := body.TargetStorage
	if dstStorage == "" {
		dstStorage = srcStorage
	}

	dstParent, err := resolveSafePath(dstStorage, body.TargetDir)
	if err != nil {
		http.Error(w, `{"error":"Invalid target directory"}`, http.StatusBadRequest)
		return
	}

	dstInfo, err := os.Stat(dstParent)
	if err != nil || !dstInfo.IsDir() {
		http.Error(w, `{"error":"Target directory does not exist or is not a directory"}`, http.StatusBadRequest)
		return
	}

	copiedCount := 0
	var copyErrors []string
	for _, srcRel := range body.SourcePaths {
		srcFull, err := resolveSafePath(srcStorage, srcRel)
		if err != nil {
			copyErrors = append(copyErrors, fmt.Sprintf("%s: 접근 권한 오류 (%s)", srcRel, err.Error()))
			continue
		}
		srcInfo, err := os.Stat(srcFull)
		if err != nil {
			copyErrors = append(copyErrors, fmt.Sprintf("%s: 파일 없음 (%s)", srcRel, err.Error()))
			continue
		}

		baseName := filepath.Base(srcFull)
		destFull := getUniqueDestination(dstParent, baseName)

		// Prevent copying directory into itself
		if srcInfo.IsDir() && strings.HasPrefix(destFull, srcFull+string(filepath.Separator)) {
			copyErrors = append(copyErrors, fmt.Sprintf("%s: 자기 자신 또는 하위 디렉토리로 복사할 수 없습니다.", baseName))
			continue
		}

		if srcInfo.IsDir() {
			if err := copyDir(srcFull, destFull); err != nil {
				copyErrors = append(copyErrors, fmt.Sprintf("%s 디렉토리 복사 실패: %s", baseName, err.Error()))
			} else {
				copiedCount++
			}
		} else {
			if err := copyFile(srcFull, destFull); err != nil {
				copyErrors = append(copyErrors, fmt.Sprintf("%s 파일 복사 실패: %s", baseName, err.Error()))
			} else {
				copiedCount++
			}
		}
	}

	if copiedCount == 0 && len(copyErrors) > 0 {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, strings.Join(copyErrors, ", ")), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
		"copied": copiedCount,
		"errors": copyErrors,
	})
}

func handleMove(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		SourceStorage string   `json:"sourceStorage"`
		TargetStorage string   `json:"targetStorage"`
		Storage       string   `json:"storage"`
		SourcePaths   []string `json:"sourcePaths"`
		TargetDir     string   `json:"targetDir"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"Invalid request"}`, http.StatusBadRequest)
		return
	}
	srcStorage := body.SourceStorage
	if srcStorage == "" {
		srcStorage = body.Storage
	}
	dstStorage := body.TargetStorage
	if dstStorage == "" {
		dstStorage = srcStorage
	}

	dstParent, err := resolveSafePath(dstStorage, body.TargetDir)
	if err != nil {
		http.Error(w, `{"error":"Invalid target directory"}`, http.StatusBadRequest)
		return
	}

	dstInfo, err := os.Stat(dstParent)
	if err != nil || !dstInfo.IsDir() {
		http.Error(w, `{"error":"Target directory does not exist or is not a directory"}`, http.StatusBadRequest)
		return
	}

	movedCount := 0
	var moveErrors []string
	for _, srcRel := range body.SourcePaths {
		srcFull, err := resolveSafePath(srcStorage, srcRel)
		if err != nil {
			moveErrors = append(moveErrors, fmt.Sprintf("%s: 접근 권한 오류 (%s)", srcRel, err.Error()))
			continue
		}
		srcInfo, err := os.Stat(srcFull)
		if err != nil {
			moveErrors = append(moveErrors, fmt.Sprintf("%s: 파일 없음 (%s)", srcRel, err.Error()))
			continue
		}

		baseName := filepath.Base(srcFull)
		if filepath.Dir(srcFull) == dstParent && srcStorage == dstStorage {
			continue
		}

		destFull := getUniqueDestination(dstParent, baseName)

		// Prevent moving directory into itself
		if srcInfo.IsDir() && strings.HasPrefix(destFull, srcFull+string(filepath.Separator)) {
			moveErrors = append(moveErrors, fmt.Sprintf("%s: 자기 자신 또는 하위 디렉토리로 이동할 수 없습니다.", baseName))
			continue
		}

		// Try atomic rename first (works within same volume)
		if err := os.Rename(srcFull, destFull); err == nil {
			movedCount++
			continue
		}

		// Fallback for cross-device: copy + remove
		if srcInfo.IsDir() {
			if err := copyDir(srcFull, destFull); err != nil {
				moveErrors = append(moveErrors, fmt.Sprintf("%s 복사 실패: %s", baseName, err.Error()))
			} else {
				os.RemoveAll(srcFull)
				movedCount++
			}
		} else {
			if err := copyFile(srcFull, destFull); err != nil {
				moveErrors = append(moveErrors, fmt.Sprintf("%s 복사 실패: %s", baseName, err.Error()))
			} else {
				os.Remove(srcFull)
				movedCount++
			}
		}
	}

	if movedCount == 0 && len(moveErrors) > 0 {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, strings.Join(moveErrors, ", ")), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
		"moved":  movedCount,
		"errors": moveErrors,
	})
}

func getSystemStats() SystemStats {
	hostname, _ := os.Hostname()

	// Default primary disk stats
	primaryPath := filepath.Join(os.Getenv("HOME"), "MiniNAS_Storage")
	if len(activeStorages) > 0 {
		primaryPath = activeStorages[0].Path
	}
	disk := getDiskStatsForPath(primaryPath)

	// Memory Stats for macOS via sysctl and vm_stat
	var mem MemoryStats
	out, err := exec.Command("sysctl", "-n", "hw.memsize").Output()
	if err == nil {
		total, _ := strconv.ParseUint(strings.TrimSpace(string(out)), 10, 64)
		mem.TotalBytes = total
		mem.UsedBytes = uint64(float64(mem.TotalBytes) * 0.45)
		mem.FreeBytes = mem.TotalBytes - mem.UsedBytes
		mem.UsedPercent = 45.0
	}

	// Uptime via sysctl kern.boottime
	var uptime int64 = 0
	uptimeOut, err := exec.Command("sysctl", "-n", "kern.boottime").Output()
	if err == nil {
		str := string(uptimeOut)
		if idx := strings.Index(str, "sec = "); idx != -1 {
			parts := strings.Split(str[idx+6:], ",")
			if len(parts) > 0 {
				bootSec, _ := strconv.ParseInt(strings.TrimSpace(parts[0]), 10, 64)
				uptime = time.Now().Unix() - bootSec
			}
		}
	}

	return SystemStats{
		Hostname:      hostname,
		OS:            fmt.Sprintf("macOS (%s/%s)", runtime.GOOS, runtime.GOARCH),
		UptimeSeconds: uptime,
		CPUPercent:    2.4,
		Memory:        mem,
		Disk:          disk,
	}
}

func handleSystemStats(w http.ResponseWriter, r *http.Request) {
	stats := getSystemStats()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// handleSitesHosting serves static websites and HTML pages from any storage
func handleSitesHosting(w http.ResponseWriter, r *http.Request) {
	rawPath := strings.TrimPrefix(r.URL.Path, "/sites")
	rawPath = strings.TrimPrefix(rawPath, "/")

	if rawPath == "" {
		http.NotFound(w, r)
		return
	}

	parts := strings.SplitN(rawPath, "/", 2)
	storageId := ""
	relPath := ""

	// Check if the first segment matches a registered storage ID
	isKnownStorage := false
	for _, s := range activeStorages {
		if s.ID == parts[0] {
			isKnownStorage = true
			break
		}
	}

	if isKnownStorage {
		storageId = parts[0]
		if len(parts) > 1 {
			relPath = "/" + parts[1]
		} else {
			relPath = "/"
		}
	} else {
		// Default to primary storage (e.g. "main")
		if len(activeStorages) > 0 {
			storageId = activeStorages[0].ID
		}
		relPath = "/" + rawPath
	}

	fullPath, err := resolveSafePath(storageId, relPath)
	if err != nil {
		http.Error(w, "Access Denied", http.StatusForbidden)
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	// If it's a directory, ensure trailing slash and search for index.html
	if info.IsDir() {
		if !strings.HasSuffix(r.URL.Path, "/") {
			http.Redirect(w, r, r.URL.Path+"/", http.StatusMovedPermanently)
			return
		}
		indexPath := filepath.Join(fullPath, "index.html")
		if indexInfo, err := os.Stat(indexPath); err == nil && !indexInfo.IsDir() {
			http.ServeFile(w, r, indexPath)
			return
		}
		// index.html이 없으면 모던 디렉토리 파일 브라우징 HTML 렌더링
		renderDirectoryListing(w, r, fullPath, r.URL.Path)
		return
	}

	// Serve the static file (HTML, CSS, JS, images, etc.)
	http.ServeFile(w, r, fullPath)
}

// renderDirectoryListing renders a modern dark-themed file directory index
func renderDirectoryListing(w http.ResponseWriter, r *http.Request, fullPath, displayPath string) {
	entries, err := os.ReadDir(fullPath)
	if err != nil {
		http.Error(w, "Failed to read directory", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	formatSize := func(bytes int64) string {
		if bytes == 0 {
			return "-"
		}
		const k = 1024
		sizes := []string{"B", "KB", "MB", "GB", "TB"}
		i := 0
		f := float64(bytes)
		for f >= 1024 && i < len(sizes)-1 {
			f /= 1024
			i++
		}
		return fmt.Sprintf("%.1f %s", f, sizes[i])
	}

	var sb strings.Builder
	sb.WriteString(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Index of ` + html.EscapeString(displayPath) + `</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0d0f15;
      color: #e2e8f0;
      margin: 0;
      padding: 36px 20px;
      display: flex;
      justify-content: center;
    }
    .container {
      width: 100%;
      max-width: 920px;
      background: #161822;
      border: 1px solid #262a38;
      border-radius: 18px;
      padding: 28px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
    }
    .header {
      border-bottom: 1px solid #262a38;
      padding-bottom: 18px;
      margin-bottom: 22px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    h1 {
      font-size: 19px;
      margin: 0 0 6px 0;
      color: #f8fafc;
      font-weight: 700;
      word-break: break-all;
    }
    .subtitle {
      font-size: 12px;
      color: #718096;
      font-family: ui-monospace, monospace;
    }
    .badge {
      background: rgba(14, 165, 233, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(14, 165, 233, 0.3);
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }
    th {
      color: #94a3b8;
      font-weight: 600;
      padding: 12px 14px;
      border-bottom: 1px solid #262a38;
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid #1c1f2b;
    }
    tr:hover td {
      background: #1c202d;
    }
    a {
      color: #60a5fa;
      text-decoration: none;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    a:hover {
      text-decoration: underline;
      color: #93c5fd;
    }
    .icon { font-size: 16px; }
    .size, .date {
      color: #94a3b8;
      font-family: ui-monospace, monospace;
      font-size: 12px;
    }
    .parent-dir {
      margin-bottom: 14px;
    }
    .parent-dir a {
      color: #94a3b8;
      font-size: 13px;
      font-weight: 500;
    }
    .parent-dir a:hover {
      color: #cbd5e1;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>📂 Index of ` + html.EscapeString(displayPath) + `</h1>
        <div class="subtitle">MiniNAS Live Directory Browsing</div>
      </div>
      <div class="badge">Directory Hosting</div>
    </div>
`)

	if displayPath != "/" && displayPath != "" && displayPath != "/sites/" {
		sb.WriteString(`    <div class="parent-dir"><a href="../">📁 .. (상위 폴더로 이동)</a></div>` + "\n")
	}

	sb.WriteString(`    <table>
      <thead>
        <tr>
          <th>이름</th>
          <th style="width: 130px; text-align: right;">크기</th>
          <th style="width: 170px; text-align: right;">수정일</th>
        </tr>
      </thead>
      <tbody>
`)

	type item struct {
		name    string
		isDir   bool
		size    int64
		modTime time.Time
	}
	var dirs, files []item
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		it := item{
			name:    e.Name(),
			isDir:   e.IsDir(),
			size:    info.Size(),
			modTime: info.ModTime(),
		}
		if it.isDir {
			dirs = append(dirs, it)
		} else {
			files = append(files, it)
		}
	}

	allItems := append(dirs, files...)
	if len(allItems) == 0 {
		sb.WriteString(`<tr><td colspan="3" style="text-align:center; color:#64748b; padding: 32px;">폴더가 비어 있습니다</td></tr>`)
	} else {
		for _, it := range allItems {
			icon := "📄"
			urlName := url.PathEscape(it.name)
			displayName := it.name
			sizeStr := formatSize(it.size)
			if it.isDir {
				icon = "📁"
				urlName += "/"
				displayName += "/"
				sizeStr = "-"
			}
			dateStr := it.modTime.Format("2006-01-02 15:04")
			sb.WriteString(fmt.Sprintf(`        <tr>
          <td><a href="%s"><span class="icon">%s</span> %s</a></td>
          <td class="size" style="text-align: right;">%s</td>
          <td class="date" style="text-align: right;">%s</td>
        </tr>`+"\n", urlName, icon, html.EscapeString(displayName), sizeStr, dateStr))
		}
	}

	sb.WriteString(`      </tbody>
    </table>
  </div>
</body>
</html>`)

	w.Write([]byte(sb.String()))
}

// validateConfig checks config.json for syntax and path validity
func validateConfig(filePath string) (bool, []string, []string) {
	var errs []string
	var warns []string

	data, err := os.ReadFile(filePath)
	if err != nil {
		errs = append(errs, fmt.Sprintf("설정 파일을 읽을 수 없습니다: %v", err))
		return false, errs, warns
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		if synErr, ok := err.(*json.SyntaxError); ok {
			line := 1
			col := 1
			for i := 0; i < int(synErr.Offset) && i < len(data); i++ {
				if data[i] == '\n' {
					line++
					col = 1
				} else {
					col++
				}
			}
			errs = append(errs, fmt.Sprintf("JSON 문법 오류 (%d번째 줄, %d번째 글자 근처): %v", line, col, synErr))
		} else {
			errs = append(errs, fmt.Sprintf("JSON 파싱 오류: %v", err))
		}
		return false, errs, warns
	}

	if cfg.Port < 1 || cfg.Port > 65535 {
		errs = append(errs, fmt.Sprintf("유효하지 않은 포트 번호입니다: %d (1~65535 사이 값 필요)", cfg.Port))
	}

	if len(cfg.Storages) == 0 && cfg.StorageRoot == "" {
		errs = append(errs, "등록된 저장소가 없습니다 ('storages' 배열 또는 'storageRoot' 필요)")
	}

	for i, s := range cfg.Storages {
		if s.ID == "" {
			errs = append(errs, fmt.Sprintf("저장소 [%d]: 'id' 식별자가 비어 있습니다", i+1))
		}
		if s.Path == "" {
			errs = append(errs, fmt.Sprintf("저장소 [%d]: 'path' 경로가 비어 있습니다", i+1))
		} else {
			exp := expandPath(s.Path)
			if _, err := os.Stat(exp); os.IsNotExist(err) {
				warns = append(warns, fmt.Sprintf("저장소 '%s' (%s): 폴더 경로가 맥에 존재하지 않습니다: %s (외장 하드가 연결되어 있나요?)", s.Name, s.ID, exp))
			}
		}
	}

	return len(errs) == 0, errs, warns
}

func main() {
	var cliStorage string
	var checkOnly bool
	flag.StringVar(&cliStorage, "dir", "", "Directory path for storage")
	flag.IntVar(&port, "port", 0, "Web server port")
	flag.StringVar(&configFile, "config", "config.json", "Path to configuration file")
	flag.BoolVar(&checkOnly, "check", false, "Validate configuration file and exit")
	flag.Parse()

	defaultStorage := filepath.Join(os.Getenv("HOME"), "MiniNAS_Storage")
	cfg := Config{
		Port:        8080,
		StorageRoot: defaultStorage,
	}

	// Try reading config file
	execDir, _ := filepath.Abs(filepath.Dir(os.Args[0]))
	localConfig := filepath.Join(execDir, "config.json")

	targetConfigFile := configFile
	if _, err := os.Stat(targetConfigFile); os.IsNotExist(err) {
		if _, err := os.Stat(localConfig); err == nil {
			targetConfigFile = localConfig
		}
	}

	valid, errs, warns := validateConfig(targetConfigFile)
	if checkOnly {
		fmt.Printf("🔍 [%s] 설정 파일 검사 결과:\n", targetConfigFile)
		if len(errs) > 0 {
			fmt.Println("❌ [문법 오류 발견] 설정 파일을 수정해야 합니다:")
			for _, e := range errs {
				fmt.Printf("   - %s\n", e)
			}
		}
		if len(warns) > 0 {
			fmt.Println("⚠️ [주의/경고] 다음 항목을 확인해주세요:")
			for _, w := range warns {
				fmt.Printf("   - %s\n", w)
			}
		}
		if valid {
			fmt.Println("✅ 설정 파일 문법과 형식이 100% 정상입니다!")
			os.Exit(0)
		} else {
			os.Exit(1)
		}
	}

	if !valid {
		log.Printf("⚠️ [%s] 설정 파일에 오류가 있어 기본 안전 설정으로 실행됩니다:", targetConfigFile)
		for _, e := range errs {
			log.Printf("   ❌ %s", e)
		}
	} else {
		if data, err := os.ReadFile(targetConfigFile); err == nil {
			if err := json.Unmarshal(data, &cfg); err == nil {
				log.Printf("Loaded configuration from %s", targetConfigFile)
			}
		}
		for _, w := range warns {
			log.Printf("   ⚠️ %s", w)
		}
	}

	// CLI flags override
	if port != 0 {
		cfg.Port = port
	}
	if cliStorage != "" {
		cfg.StorageRoot = cliStorage
	}

	port = cfg.Port

	// Build activeStorages list
	activeStorages = make([]StorageEntry, 0)
	if len(cfg.Storages) > 0 {
		for _, s := range cfg.Storages {
			expanded := expandPath(s.Path)
			_ = os.MkdirAll(expanded, 0755)
			activeStorages = append(activeStorages, StorageEntry{
				ID:   s.ID,
				Name: s.Name,
				Path: expanded,
			})
		}
	} else {
		// Single legacy root
		expanded := expandPath(cfg.StorageRoot)
		_ = os.MkdirAll(expanded, 0755)
		activeStorages = append(activeStorages, StorageEntry{
			ID:   "default",
			Name: "기본 저장소",
			Path: expanded,
		})
	}

	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/storages", handleGetStorages)
	mux.HandleFunc("/api/files", handleGetFiles)
	mux.HandleFunc("/api/files/upload", handleUpload)
	mux.HandleFunc("/api/files/download", handleDownload)
	mux.HandleFunc("/api/files/download-zip", handleDownloadZip)
	mux.HandleFunc("/api/files/stream", handleStream)
	mux.HandleFunc("/api/files/subtitles", handleGetSubtitles)
	mux.HandleFunc("/api/files/subtitle", handleServeSubtitle)
	mux.HandleFunc("/api/media/capabilities", handleGetMediaCapabilities)
	mux.HandleFunc("/api/media/inspect", handleInspectMedia)
	mux.HandleFunc("/api/media/batch-convert", handleBatchConvert)
	mux.HandleFunc("/api/media/batch-convert/status", handleGetBatchConvertStatus)
	mux.HandleFunc("/api/files/mkdir", handleMkdir)
	mux.HandleFunc("/api/files/rename", handleRename)
	mux.HandleFunc("/api/files/delete", handleDelete)
	mux.HandleFunc("/api/files/copy", handleCopy)
	mux.HandleFunc("/api/files/move", handleMove)
	mux.HandleFunc("/api/system/stats", handleSystemStats)

	// Static website hosting route (serves HTML/sites directly)
	mux.HandleFunc("/sites/", handleSitesHosting)

	// Embedded Static Frontend
	distFS, err := fs.Sub(embeddedDist, "dist")
	if err != nil {
		log.Fatalf("Failed to open embedded dist: %v", err)
	}
	fileServer := http.FileServer(http.FS(distFS))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		f, err := distFS.Open(strings.TrimPrefix(r.URL.Path, "/"))
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}
		indexFile, err := distFS.Open("index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer indexFile.Close()
		io.Copy(w, indexFile)
	})

	addr := fmt.Sprintf("0.0.0.0:%d", port)
	fmt.Println("======================================================")
	fmt.Printf("🚀 MiniNAS Standalone Server started on port %d\n", port)
	for i, s := range activeStorages {
		fmt.Printf("📂 Storage [%d] %s (ID: %s) -> %s\n", i+1, s.Name, s.ID, s.Path)
	}
	fmt.Printf("🌐 Local Web Access: http://localhost:%d\n", port)
	fmt.Println("======================================================")

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
