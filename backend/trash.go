package main

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type TrashItem struct {
	ID           string    `json:"id"`
	StorageID    string    `json:"storageId"`
	OriginalPath string    `json:"originalPath"`
	Name         string    `json:"name"`
	TrashName    string    `json:"trashName"`
	Size         int64     `json:"size"`
	IsDir        bool      `json:"isDir"`
	DeletedAt    time.Time `json:"deletedAt"`
}

type TrashResponse struct {
	Items      []TrashItem `json:"items"`
	TotalSize  int64       `json:"totalSize"`
	TotalCount int         `json:"totalCount"`
}

var trashMutex sync.Mutex

func generateTrashID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%d_%x", time.Now().Unix(), b)
}

func getTrashDir(storagePath string) string {
	return filepath.Join(storagePath, ".trash")
}

func getTrashFilesDir(storagePath string) string {
	return filepath.Join(storagePath, ".trash", "files")
}

func getTrashMetaPath(storagePath string) string {
	return filepath.Join(storagePath, ".trash", "meta.json")
}

func getDirSize(path string) int64 {
	var size int64
	_ = filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	return size
}

func readTrashMeta(storagePath string) ([]TrashItem, error) {
	metaPath := getTrashMetaPath(storagePath)
	data, err := os.ReadFile(metaPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []TrashItem{}, nil
		}
		return nil, err
	}
	var items []TrashItem
	if err := json.Unmarshal(data, &items); err != nil {
		return []TrashItem{}, nil
	}
	return items, nil
}

func writeTrashMeta(storagePath string, items []TrashItem) error {
	trashDir := getTrashDir(storagePath)
	if err := os.MkdirAll(trashDir, 0755); err != nil {
		return err
	}
	metaPath := getTrashMetaPath(storagePath)
	data, err := json.MarshalIndent(items, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(metaPath, data, 0644)
}

// moveToTrash moves specified files or folders into .trash/files and records them in meta.json
func moveToTrash(storageId string, relPaths []string) error {
	trashMutex.Lock()
	defer trashMutex.Unlock()

	st := getStorage(storageId)
	filesDir := getTrashFilesDir(st.Path)
	if err := os.MkdirAll(filesDir, 0755); err != nil {
		return fmt.Errorf("failed to create trash directory: %w", err)
	}

	items, _ := readTrashMeta(st.Path)

	for _, relPath := range relPaths {
		cleanRel := filepath.Clean("/" + relPath)
		if cleanRel == "/" || cleanRel == "." || strings.HasPrefix(cleanRel, "/.trash") {
			continue
		}

		fullPath, err := resolveSafePath(storageId, cleanRel)
		if err != nil {
			continue
		}

		info, err := os.Stat(fullPath)
		if err != nil {
			continue
		}

		var size int64
		if info.IsDir() {
			size = getDirSize(fullPath)
		} else {
			size = info.Size()
		}

		id := generateTrashID()
		baseName := filepath.Base(fullPath)
		trashFileName := fmt.Sprintf("%s_%s", id, baseName)
		trashFullPath := filepath.Join(filesDir, trashFileName)

		// Move to trash files directory
		if err := os.Rename(fullPath, trashFullPath); err != nil {
			// Fallback if cross-device or error: try copy and remove
			if info.IsDir() {
				// Directories are skipped if rename fails
				continue
			}
			if err := copyFile(fullPath, trashFullPath); err != nil {
				continue
			}
			_ = os.Remove(fullPath)
		}

		item := TrashItem{
			ID:           id,
			StorageID:    st.ID,
			OriginalPath: cleanRel,
			Name:         baseName,
			TrashName:    trashFileName,
			Size:         size,
			IsDir:        info.IsDir(),
			DeletedAt:    time.Now(),
		}
		items = append([]TrashItem{item}, items...)
	}

	return writeTrashMeta(st.Path, items)
}

// getTrashItems retrieves active trash items for a given storage or all storages
func getTrashItems(storageId string) TrashResponse {
	trashMutex.Lock()
	defer trashMutex.Unlock()

	var targets []StorageEntry
	if storageId == "" || storageId == "all" {
		targets = activeStorages
		if len(targets) == 0 {
			targets = []StorageEntry{getStorage("")}
		}
	} else {
		targets = []StorageEntry{getStorage(storageId)}
	}

	var allItems []TrashItem
	var totalSize int64

	for _, st := range targets {
		items, err := readTrashMeta(st.Path)
		if err != nil {
			continue
		}
		filesDir := getTrashFilesDir(st.Path)

		validItems := make([]TrashItem, 0, len(items))
		changed := false

		for _, item := range items {
			itemFullPath := filepath.Join(filesDir, item.TrashName)
			if _, err := os.Stat(itemFullPath); err != nil {
				// Target file no longer exists in trash
				changed = true
				continue
			}
			item.StorageID = st.ID
			validItems = append(validItems, item)
			totalSize += item.Size
		}

		if changed {
			_ = writeTrashMeta(st.Path, validItems)
		}

		allItems = append(allItems, validItems...)
	}

	// Sort newest deleted first
	sort.Slice(allItems, func(i, j int) bool {
		return allItems[i].DeletedAt.After(allItems[j].DeletedAt)
	})

	return TrashResponse{
		Items:      allItems,
		TotalSize:  totalSize,
		TotalCount: len(allItems),
	}
}

// restoreTrashItems restores selected items from trash back to original locations
func restoreTrashItems(storageId string, ids []string) (int, error) {
	trashMutex.Lock()
	defer trashMutex.Unlock()

	st := getStorage(storageId)
	filesDir := getTrashFilesDir(st.Path)
	items, err := readTrashMeta(st.Path)
	if err != nil {
		return 0, err
	}

	idMap := make(map[string]bool)
	for _, id := range ids {
		idMap[id] = true
	}

	restoredCount := 0
	remainingItems := make([]TrashItem, 0, len(items))

	for _, item := range items {
		if !idMap[item.ID] {
			remainingItems = append(remainingItems, item)
			continue
		}

		trashFullPath := filepath.Join(filesDir, item.TrashName)
		if _, err := os.Stat(trashFullPath); err != nil {
			// File does not exist, prune from meta
			continue
		}

		targetFullPath, err := resolveSafePath(st.ID, item.OriginalPath)
		if err != nil {
			remainingItems = append(remainingItems, item)
			continue
		}

		// Ensure parent directory exists
		parentDir := filepath.Dir(targetFullPath)
		if err := os.MkdirAll(parentDir, 0755); err != nil {
			remainingItems = append(remainingItems, item)
			continue
		}

		// Resolve destination collision if already exists
		destPath := getUniqueDestination(parentDir, filepath.Base(targetFullPath))

		if err := os.Rename(trashFullPath, destPath); err != nil {
			remainingItems = append(remainingItems, item)
			continue
		}

		restoredCount++
	}

	_ = writeTrashMeta(st.Path, remainingItems)
	return restoredCount, nil
}

// deleteTrashPermanently removes selected items permanently from the trash
func deleteTrashPermanently(storageId string, ids []string) (int, error) {
	trashMutex.Lock()
	defer trashMutex.Unlock()

	st := getStorage(storageId)
	filesDir := getTrashFilesDir(st.Path)
	items, err := readTrashMeta(st.Path)
	if err != nil {
		return 0, err
	}

	idMap := make(map[string]bool)
	for _, id := range ids {
		idMap[id] = true
	}

	deletedCount := 0
	remainingItems := make([]TrashItem, 0, len(items))

	for _, item := range items {
		if !idMap[item.ID] {
			remainingItems = append(remainingItems, item)
			continue
		}

		trashFullPath := filepath.Join(filesDir, item.TrashName)
		_ = os.RemoveAll(trashFullPath)
		deletedCount++
	}

	_ = writeTrashMeta(st.Path, remainingItems)
	return deletedCount, nil
}

// emptyTrash clears all files and metadata in the trash for a given storage or all storages
func emptyTrash(storageId string) error {
	trashMutex.Lock()
	defer trashMutex.Unlock()

	var targets []StorageEntry
	if storageId == "" || storageId == "all" {
		targets = activeStorages
		if len(targets) == 0 {
			targets = []StorageEntry{getStorage("")}
		}
	} else {
		targets = []StorageEntry{getStorage(storageId)}
	}

	for _, st := range targets {
		filesDir := getTrashFilesDir(st.Path)
		_ = os.RemoveAll(filesDir)
		_ = os.MkdirAll(filesDir, 0755)
		_ = writeTrashMeta(st.Path, []TrashItem{})
	}

	return nil
}

// HTTP Handlers

func handleGetTrash(w http.ResponseWriter, r *http.Request) {
	storageId := r.URL.Query().Get("storage")
	resp := getTrashItems(storageId)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleRestoreTrash(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Storage string   `json:"storage"`
		IDs     []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	count, err := restoreTrashItems(body.Storage, body.IDs)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "ok",
		"restored": count,
	})
}

func handleDeleteTrash(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Storage string   `json:"storage"`
		IDs     []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	count, err := deleteTrashPermanently(body.Storage, body.IDs)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "ok",
		"deleted": count,
	})
}

func handleEmptyTrash(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Storage string `json:"storage"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	if err := emptyTrash(body.Storage); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "ok",
	})
}
