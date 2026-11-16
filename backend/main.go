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
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
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
	if strings.HasPrefix(filepath.Clean("/"+relPath), "/.trash") {
		http.Error(w, `{"error":"Access denied"}`, http.StatusForbidden)
		return
	}
	fullPath, err := resolveSafePath(storageId, relPath)
	if err != nil {
		http.Error(w, `{"error":"Access denied"}`, http.StatusForbidden)
		return
	}

	cleanRel := filepath.Clean("/" + relPath)
	recursive := r.URL.Query().Get("recursive") == "true"
	typeFilter := strings.ToLower(r.URL.Query().Get("type"))

	var items []FileItem

	if recursive {
		items = make([]FileItem, 0, 64)
		_ = filepath.WalkDir(fullPath, func(path string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return nil
			}
			name := d.Name()
			if strings.HasPrefix(name, ".") {
				if d.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}

			// Skip the target directory itself
			if path == fullPath {
				return nil
			}

			relToTarget, err := filepath.Rel(fullPath, path)
			if err != nil {
				return nil
			}

			// Depth limit (up to 8 levels deep)
			depth := strings.Count(filepath.ToSlash(relToTarget), "/")
			if depth > 8 && d.IsDir() {
				return filepath.SkipDir
			}

			if d.IsDir() {
				lower := strings.ToLower(name)
				if lower == ".trash" || lower == "trash" || lower == "node_modules" || lower == ".mininas_cache" {
					return filepath.SkipDir
				}
				return nil
			}

			ext := filepath.Ext(name)
			mType := getMediaType(ext)

			if typeFilter != "" && mType != typeFilter {
				return nil
			}

			info, err := d.Info()
			if err != nil || info.Size() == 0 {
				return nil
			}

			itemPath := filepath.Clean(filepath.Join(cleanRel, filepath.ToSlash(relToTarget)))

			items = append(items, FileItem{
				Name:      name,
				Path:      itemPath,
				IsDir:     false,
				Size:      info.Size(),
				ModTime:   info.ModTime(),
				Ext:       ext,
				MediaType: mType,
			})
			return nil
		})
	} else {
		entries, err := os.ReadDir(fullPath)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
			return
		}

		items = make([]FileItem, 0, len(entries))

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
		Storage   string   `json:"storage"`
		Paths     []string `json:"paths"`
		Permanent bool     `json:"permanent"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"Invalid request"}`, http.StatusBadRequest)
		return
	}

	if body.Permanent {
		for _, relPath := range body.Paths {
			fullPath, err := resolveSafePath(body.Storage, relPath)
			if err != nil {
				continue
			}
			os.RemoveAll(fullPath)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
		return
	}

	if err := moveToTrash(body.Storage, body.Paths); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
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

type PinnedSite struct {
	StorageID string `json:"storage"`
	Path      string `json:"path"`
}

type SiteItem struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	StorageID   string    `json:"storageId"`
	StorageName string    `json:"storageName"`
	RelPath     string    `json:"relPath"`
	URL         string    `json:"url"`
	IsDir       bool      `json:"isDir"`
	HasIndex    bool      `json:"hasIndex"`
	IsPinned    bool      `json:"isPinned"`
	DocCount    int       `json:"docCount"`
	Size        int64     `json:"size"`
	ModTime     time.Time `json:"modTime"`
}

type CinemaItem struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Name        string    `json:"name"`
	StorageID   string    `json:"storageId"`
	StorageName string    `json:"storageName"`
	RelPath     string    `json:"relPath"`
	Size        int64     `json:"size"`
	ModTime     time.Time `json:"modTime"`
	Ext         string    `json:"ext"`
	HasSubtitle bool      `json:"hasSubtitle"`
}

type PhotoItem struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	StorageID   string    `json:"storageId"`
	StorageName string    `json:"storageName"`
	RelPath     string    `json:"relPath"`
	Size        int64     `json:"size"`
	ModTime     time.Time `json:"modTime"`
	Ext         string    `json:"ext"`
	MediaType   string    `json:"mediaType"`
}

var (
	pinnedSitesMutex sync.RWMutex
	pinnedSitesFile  string
)

func getPinnedSitesFilePath() string {
	if pinnedSitesFile != "" {
		return pinnedSitesFile
	}
	if configFile != "" {
		return filepath.Join(filepath.Dir(configFile), "pinned_sites.json")
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".mininas_pinned_sites.json")
}

func loadPinnedSites() []PinnedSite {
	pinnedSitesMutex.RLock()
	defer pinnedSitesMutex.RUnlock()

	p := getPinnedSitesFilePath()
	data, err := os.ReadFile(p)
	if err != nil {
		return []PinnedSite{}
	}
	var sites []PinnedSite
	_ = json.Unmarshal(data, &sites)
	if sites == nil {
		return []PinnedSite{}
	}
	return sites
}

func savePinnedSites(sites []PinnedSite) error {
	pinnedSitesMutex.Lock()
	defer pinnedSitesMutex.Unlock()

	p := getPinnedSitesFilePath()
	_ = os.MkdirAll(filepath.Dir(p), 0755)
	data, err := json.MarshalIndent(sites, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0644)
}

var htmlTitleRegex = regexp.MustCompile(`(?i)<title[^>]*>([^<]+)</title>`)

func extractHTMLTitle(filePath string, fallback string) string {
	f, err := os.Open(filePath)
	if err != nil {
		return fallback
	}
	defer f.Close()

	buf := make([]byte, 4096)
	n, _ := f.Read(buf)
	if n > 0 {
		matches := htmlTitleRegex.FindSubmatch(buf[:n])
		if len(matches) > 1 {
			title := strings.TrimSpace(string(matches[1]))
			if title != "" {
				return title
			}
		}
	}
	return fallback
}

// handleListSites combines Model B (Convention: htdocs/ or sites/ directory) and Model C (User Pinned Sites)
func handleListSites(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	siteMap := make(map[string]*SiteItem)
	var siteOrder []string

	// 1. Model B: Search for convention hosting directories ('htdocs', 'sites', 'public_html', 'my-site')
	isHostingDir := func(name string) bool {
		lower := strings.ToLower(name)
		return lower == "htdocs" || lower == "sites" || lower == "public_html" || lower == "my-site"
	}

	for _, storage := range activeStorages {
		rootDir := storage.Path
		if rootDir == "" {
			continue
		}

		// Find hosting directory candidates
		var candidateDirs []string

		// Check if the root dir itself is a hosting dir
		if isHostingDir(filepath.Base(rootDir)) {
			candidateDirs = append(candidateDirs, rootDir)
		}

		// Check 1st-level subdirectories of the storage
		rootEntries, err := os.ReadDir(rootDir)
		if err == nil {
			for _, e := range rootEntries {
				if e.IsDir() && isHostingDir(e.Name()) {
					candidateDirs = append(candidateDirs, filepath.Join(rootDir, e.Name()))
				}
			}
		}

		// Now scan the hosting folders (only direct children, no deep crawling!)
		for _, hostDir := range candidateDirs {
			entries, err := os.ReadDir(hostDir)
			if err != nil {
				continue
			}

			// 1) Check if hostDir itself contains index.html (the directory itself is a web project)
			hasHostIndex := false
			var hostIndexPath string
			hostHtmlCount := 0
			for _, entry := range entries {
				if !entry.IsDir() {
					ext := strings.ToLower(filepath.Ext(entry.Name()))
					if ext == ".html" || ext == ".htm" {
						hostHtmlCount++
						if strings.EqualFold(entry.Name(), "index.html") || strings.EqualFold(entry.Name(), "index.htm") {
							hasHostIndex = true
							hostIndexPath = filepath.Join(hostDir, entry.Name())
						}
					}
				}
			}

			if hasHostIndex {
				rel, err := filepath.Rel(rootDir, hostDir)
				if err == nil {
					relSlash := filepath.ToSlash(rel)
					relPath := "/" + strings.Trim(relSlash, "/")
					if relPath == "/." {
						relPath = "/"
					}
					key := storage.ID + ":" + relPath
					title := extractHTMLTitle(hostIndexPath, filepath.Base(hostDir))
					info, _ := os.Stat(hostDir)
					var size int64
					modTime := time.Now()
					if info != nil {
						size = info.Size()
						modTime = info.ModTime()
					}

					var siteURL string
					if relPath == "/" {
						siteURL = fmt.Sprintf("/sites/%s/", storage.ID)
					} else {
						siteURL = fmt.Sprintf("/sites/%s%s/", storage.ID, relPath)
					}
					item := &SiteItem{
						ID:          key,
						Title:       title,
						StorageID:   storage.ID,
						StorageName: storage.Name,
						RelPath:     relPath,
						URL:         siteURL,
						IsDir:       true,
						HasIndex:    true,
						IsPinned:    false,
						DocCount:    hostHtmlCount,
						Size:        size,
						ModTime:     modTime,
					}
					siteMap[key] = item
					siteOrder = append(siteOrder, key)
				}
			}

			// 2) Check subdirectories inside hostDir (projects inside sites/ or htdocs/)
			for _, entry := range entries {
				name := entry.Name()
				if strings.HasPrefix(name, ".") || !entry.IsDir() {
					continue
				}

				entryPath := filepath.Join(hostDir, name)
				rel, err := filepath.Rel(rootDir, entryPath)
				if err != nil {
					continue
				}
				relPath := "/" + filepath.ToSlash(rel)
				key := storage.ID + ":" + relPath

				// Only directories with index.html are automatically detected (Model B)
				hasIndex := false
				htmlCount := 0
				var indexPath string

				subEntries, _ := os.ReadDir(entryPath)
				for _, se := range subEntries {
					if !se.IsDir() {
						ext := strings.ToLower(filepath.Ext(se.Name()))
						if ext == ".html" || ext == ".htm" {
							htmlCount++
							if strings.EqualFold(se.Name(), "index.html") || strings.EqualFold(se.Name(), "index.htm") {
								hasIndex = true
								indexPath = filepath.Join(entryPath, se.Name())
							}
						}
					}
				}

					// Skip directories without index.html (these can be pinned manually via Model C)
					if !hasIndex {
						continue
					}

					title := extractHTMLTitle(indexPath, name)

					info, _ := entry.Info()
					var size int64
					modTime := time.Now()
					if info != nil {
						size = info.Size()
						modTime = info.ModTime()
					}

					siteURL := fmt.Sprintf("/sites/%s%s/", storage.ID, relPath)
					item := &SiteItem{
						ID:          key,
						Title:       title,
						StorageID:   storage.ID,
						StorageName: storage.Name,
						RelPath:     relPath,
						URL:         siteURL,
						IsDir:       true,
						HasIndex:    true,
						IsPinned:    false,
						DocCount:    htmlCount,
						Size:        size,
						ModTime:     modTime,
					}
					siteMap[key] = item
					siteOrder = append(siteOrder, key)
				}
				// Standalone files are not auto-detected; users can pin them explicitly via Model C
			}
		}

	// 2. Model C: Merge user pinned sites
	pinnedList := loadPinnedSites()
	for _, pin := range pinnedList {
		fullPath, err := resolveSafePath(pin.StorageID, pin.Path)
		if err != nil {
			continue
		}
		info, err := os.Stat(fullPath)
		if err != nil {
			continue
		}

		key := pin.StorageID + ":" + pin.Path
		if existing, ok := siteMap[key]; ok {
			existing.IsPinned = true
			continue
		}

		// Find storage name
		storageName := pin.StorageID
		for _, s := range activeStorages {
			if s.ID == pin.StorageID {
				storageName = s.Name
				break
			}
		}

		name := filepath.Base(fullPath)
		if info.IsDir() {
			hasIndex := false
			htmlCount := 0
			var indexPath string

			subEntries, _ := os.ReadDir(fullPath)
			for _, se := range subEntries {
				if !se.IsDir() {
					ext := strings.ToLower(filepath.Ext(se.Name()))
					if ext == ".html" || ext == ".htm" {
						htmlCount++
						if strings.EqualFold(se.Name(), "index.html") || strings.EqualFold(se.Name(), "index.htm") {
							hasIndex = true
							indexPath = filepath.Join(fullPath, se.Name())
						}
					}
				}
			}

			title := name
			if hasIndex {
				title = extractHTMLTitle(indexPath, name)
			} else if htmlCount > 0 {
				title = fmt.Sprintf("%s (%d개 문서)", name, htmlCount)
			}

			siteURL := fmt.Sprintf("/sites/%s%s/", pin.StorageID, pin.Path)
			item := &SiteItem{
				ID:          key,
				Title:       title,
				StorageID:   pin.StorageID,
				StorageName: storageName,
				RelPath:     pin.Path,
				URL:         siteURL,
				IsDir:       true,
				HasIndex:    hasIndex,
				IsPinned:    true,
				DocCount:    htmlCount,
				Size:        info.Size(),
				ModTime:     info.ModTime(),
			}
			siteMap[key] = item
			siteOrder = append(siteOrder, key)
		} else {
			ext := strings.ToLower(filepath.Ext(name))
			if ext == ".html" || ext == ".htm" {
				title := extractHTMLTitle(fullPath, strings.TrimSuffix(name, ext))
				siteURL := fmt.Sprintf("/sites/%s%s", pin.StorageID, pin.Path)
				item := &SiteItem{
					ID:          key,
					Title:       title,
					StorageID:   pin.StorageID,
					StorageName: storageName,
					RelPath:     pin.Path,
					URL:         siteURL,
					IsDir:       false,
					HasIndex:    false,
					IsPinned:    true,
					DocCount:    1,
					Size:        info.Size(),
					ModTime:     info.ModTime(),
				}
				siteMap[key] = item
				siteOrder = append(siteOrder, key)
			}
		}
	}

	var result []SiteItem
	for _, k := range siteOrder {
		if item, ok := siteMap[k]; ok {
			result = append(result, *item)
		}
	}

	if result == nil {
		result = []SiteItem{}
	}

	// Sort pinned first, then by ModTime desc
	sort.Slice(result, func(i, j int) bool {
		if result[i].IsPinned != result[j].IsPinned {
			return result[i].IsPinned
		}
		return result[i].ModTime.After(result[j].ModTime)
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// handlePinSite pins a file or directory to Sites Hub
func handlePinSite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Storage string `json:"storage"`
		Path    string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if req.Storage == "" || req.Path == "" {
		http.Error(w, "Storage and path are required", http.StatusBadRequest)
		return
	}

	pinned := loadPinnedSites()
	for _, p := range pinned {
		if p.StorageID == req.Storage && p.Path == req.Path {
			// Already pinned
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]bool{"success": true})
			return
		}
	}

	pinned = append(pinned, PinnedSite{
		StorageID: req.Storage,
		Path:      req.Path,
	})

	if err := savePinnedSites(pinned); err != nil {
		http.Error(w, "Failed to save pinned site: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// handleUnpinSite unpins a file or directory from Sites Hub
func handleUnpinSite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Storage string `json:"storage"`
		Path    string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	pinned := loadPinnedSites()
	var updated []PinnedSite
	for _, p := range pinned {
		if !(p.StorageID == req.Storage && p.Path == req.Path) {
			updated = append(updated, p)
		}
	}

	if err := savePinnedSites(updated); err != nil {
		http.Error(w, "Failed to update pinned sites: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// handleCinemaList scans registered storages for video files to build an OTT library
func handleCinemaList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	storageFilter := r.URL.Query().Get("storage")
	var results []CinemaItem

	for _, storage := range activeStorages {
		if storageFilter != "" && storage.ID != storageFilter {
			continue
		}
		rootDir := storage.Path
		if rootDir == "" {
			continue
		}

		_ = filepath.WalkDir(rootDir, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}

			name := d.Name()
			if strings.HasPrefix(name, ".") {
				if d.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}

			// Skip deep directories (limit depth to 4 for Mac mini HDD performance)
			rel, err := filepath.Rel(rootDir, path)
			if err != nil {
				return nil
			}
			depth := strings.Count(filepath.ToSlash(rel), "/")
			if depth > 4 && d.IsDir() {
				return filepath.SkipDir
			}

			if d.IsDir() {
				lower := strings.ToLower(name)
				if lower == "node_modules" || lower == ".trash" || lower == "trash" || lower == ".mininas_cache" {
					return filepath.SkipDir
				}
				return nil
			}

			ext := strings.ToLower(filepath.Ext(name))
			if getMediaType(ext) != "video" {
				return nil
			}

			info, err := d.Info()
			if err != nil {
				return nil
			}

			// Filter out files smaller than 1MB
			if info.Size() < 1024*1024 {
				return nil
			}

			relPath := "/" + filepath.ToSlash(rel)
			parentDir := filepath.Dir(path)
			baseWithoutExt := strings.TrimSuffix(name, filepath.Ext(name))

			// Check for subtitle in the same directory
			hasSub := false
			for _, subExt := range []string{".srt", ".smi", ".vtt"} {
				if _, err := os.Stat(filepath.Join(parentDir, baseWithoutExt+subExt)); err == nil {
					hasSub = true
					break
				}
				if _, err := os.Stat(filepath.Join(parentDir, baseWithoutExt+strings.ToUpper(subExt))); err == nil {
					hasSub = true
					break
				}
			}

			results = append(results, CinemaItem{
				ID:          storage.ID + ":" + relPath,
				Title:       baseWithoutExt,
				Name:        name,
				StorageID:   storage.ID,
				StorageName: storage.Name,
				RelPath:     relPath,
				Size:        info.Size(),
				ModTime:     info.ModTime(),
				Ext:         ext,
				HasSubtitle: hasSub,
			})
			return nil
		})
	}

	if results == nil {
		results = []CinemaItem{}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].ModTime.After(results[j].ModTime)
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

// handlePhotosList scans registered storages for photos and videos for the timeline
func handlePhotosList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	storageFilter := r.URL.Query().Get("storage")
	typeFilter := strings.ToLower(r.URL.Query().Get("type")) // "image", "video", or "" ("all")
	skipSpecial := r.URL.Query().Get("skip_special") == "true" // User toggle: exclude movies/sites folders
	var results []PhotoItem

	for _, storage := range activeStorages {
		if storageFilter != "" && storage.ID != storageFilter {
			continue
		}
		// If skipSpecial is requested, exclude dedicated movie storage
		if skipSpecial && storage.ID == "movies" {
			continue
		}
		rootDir := storage.Path
		if rootDir == "" {
			continue
		}

		_ = filepath.WalkDir(rootDir, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}

			name := d.Name()
			if strings.HasPrefix(name, ".") {
				if d.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}

			if d.IsDir() {
				lower := strings.ToLower(name)
				// Always exclude system, cache, and trash folders
				if lower == "node_modules" || lower == ".trash" || lower == "trash" || lower == ".mininas_cache" || lower == ".git" {
					return filepath.SkipDir
				}

				// Only skip movie and website folders when skipSpecial toggle is explicitly enabled
				if skipSpecial {
					// 1) Static website folders
					if lower == "sites" || lower == "htdocs" || lower == "public_html" || lower == "my-site" || lower == "www" {
						return filepath.SkipDir
					}
					// 2) Cinema, movie, drama, series folders (singular & plural, Korean & English)
					if lower == "movies" || lower == "movie" || lower == "영화" ||
						lower == "dramas" || lower == "drama" || lower == "드라마" ||
						lower == "cinema" || lower == "series" || lower == "tv" ||
						lower == "vod" || lower == "방송" || lower == "예능" {
						return filepath.SkipDir
					}
				}
				return nil
			}

			ext := strings.ToLower(filepath.Ext(name))
			mediaType := getMediaType(ext)

			// Photos Hub collects both images and videos (no size limit)
			if mediaType != "image" && mediaType != "video" {
				return nil
			}

			if typeFilter == "image" && mediaType != "image" {
				return nil
			}
			if typeFilter == "video" && mediaType != "video" {
				return nil
			}

			info, err := d.Info()
			if err != nil {
				return nil
			}

			// Skip 0-byte files
			if info.Size() == 0 {
				return nil
			}

			rel, err := filepath.Rel(rootDir, path)
			if err != nil {
				return nil
			}
			relPath := "/" + filepath.ToSlash(rel)

			results = append(results, PhotoItem{
				ID:          storage.ID + ":" + relPath,
				Name:        name,
				StorageID:   storage.ID,
				StorageName: storage.Name,
				RelPath:     relPath,
				Size:        info.Size(),
				ModTime:     info.ModTime(),
				Ext:         ext,
				MediaType:   mediaType,
			})
			return nil
		})
	}

	if results == nil {
		results = []PhotoItem{}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].ModTime.After(results[j].ModTime)
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
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

	storageId := ""
	relPath := ""

	if rawPath == "" {
		// When requesting /sites or /sites/, redirect to the MiniNAS Web UI Sites Hub!
		http.Redirect(w, r, "/?tab=sites", http.StatusFound)
		return
	} else {
		parts := strings.SplitN(rawPath, "/", 2)

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
      table-layout: fixed;
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
      overflow: hidden;
    }
    th.col-name, td.col-name {
      width: auto;
    }
    th.col-size, td.col-size {
      width: 120px;
      text-align: right;
    }
    th.col-date, td.col-date {
      width: 160px;
      text-align: right;
    }
    tr:hover td {
      background: #1c202d;
    }
    a.item-link {
      color: #60a5fa;
      text-decoration: none;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      overflow: hidden;
    }
    a.item-link:hover {
      text-decoration: underline;
      color: #93c5fd;
    }
    .icon {
      font-size: 16px;
      flex-shrink: 0;
    }
    .name-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
      flex: 1;
    }
    .size, .date {
      color: #94a3b8;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      white-space: nowrap;
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
    @media (max-width: 860px) {
      body {
        padding: 20px 14px;
      }
      .container {
        padding: 20px 16px;
        border-radius: 14px;
      }
      th.col-date, td.col-date {
        display: none;
      }
      th.col-size, td.col-size {
        width: 85px;
        font-size: 11px;
      }
    }
    @media (max-width: 520px) {
      body {
        padding: 14px 8px;
      }
      .container {
        padding: 14px 10px;
        border-radius: 12px;
      }
      .header {
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        padding-bottom: 10px;
        margin-bottom: 12px;
      }
      h1 {
        font-size: 14px;
      }
      th, td {
        padding: 8px 4px;
      }
      th.col-size, td.col-size {
        width: 68px;
        font-size: 10px;
      }
      .name-text {
        font-size: 12px;
      }
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
          <th class="col-name">이름</th>
          <th class="col-size">크기</th>
          <th class="col-date">수정일</th>
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
			escapedName := html.EscapeString(displayName)
			sb.WriteString(fmt.Sprintf(`        <tr>
          <td class="col-name"><a href="%s" class="item-link" title="%s"><span class="icon">%s</span><span class="name-text">%s</span></a></td>
          <td class="size col-size">%s</td>
          <td class="date col-date">%s</td>
        </tr>`+"\n", urlName, escapedName, icon, escapedName, sizeStr, dateStr))
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
	mux.HandleFunc("/api/trash", handleGetTrash)
	mux.HandleFunc("/api/trash/restore", handleRestoreTrash)
	mux.HandleFunc("/api/trash/delete", handleDeleteTrash)
	mux.HandleFunc("/api/trash/empty", handleEmptyTrash)
	mux.HandleFunc("/api/sites", handleListSites)
	mux.HandleFunc("/api/sites/pin", handlePinSite)
	mux.HandleFunc("/api/sites/unpin", handleUnpinSite)
	mux.HandleFunc("/api/cinema", handleCinemaList)
	mux.HandleFunc("/api/photos", handlePhotosList)

	// Static website hosting route (serves HTML/sites directly)
	mux.HandleFunc("/sites/", handleSitesHosting)

	// Embedded Static Frontend
	distFS, err := fs.Sub(embeddedDist, "dist")
	if err != nil {
		log.Fatalf("Failed to open embedded dist: %v", err)
	}
	fileServer := http.FileServer(http.FS(distFS))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path != "" && path != "index.html" {
			f, err := distFS.Open(path)
			if err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		// SPA Fallback & index.html: Prevent caching so newly bundled JS is loaded immediately
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")

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
