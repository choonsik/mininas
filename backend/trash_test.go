package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTrashLifecycle(t *testing.T) {
	_, cleanup := setupTestEnvironment(t)
	defer cleanup()

	// 1. Create test files and directories in s1
	file1Path := filepath.Join(activeStorages[0].Path, "important_doc.pdf")
	_ = os.WriteFile(file1Path, []byte("PDF content 12345"), 0644)

	dirPath := filepath.Join(activeStorages[0].Path, "test_folder")
	_ = os.MkdirAll(dirPath, 0755)
	_ = os.WriteFile(filepath.Join(dirPath, "nested.txt"), []byte("Nested file inside folder"), 0644)

	// 2. Soft-delete important_doc.pdf via handleDelete (default soft delete)
	deleteReqBody := `{"storage":"s1","paths":["/important_doc.pdf"]}`
	req1 := httptest.NewRequest("POST", "/api/files/delete", strings.NewReader(deleteReqBody))
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	handleDelete(w1, req1)

	if w1.Result().StatusCode != http.StatusOK {
		t.Fatalf("Soft delete failed with status %d", w1.Result().StatusCode)
	}

	// Verify original file is gone from storage root
	if _, err := os.Stat(file1Path); !os.IsNotExist(err) {
		t.Fatalf("Original file should not exist at %s after soft delete", file1Path)
	}

	// 3. Query Trash API
	reqTrash := httptest.NewRequest("GET", "/api/trash?storage=s1", nil)
	wTrash := httptest.NewRecorder()
	handleGetTrash(wTrash, reqTrash)

	if wTrash.Result().StatusCode != http.StatusOK {
		t.Fatalf("Get trash failed with status %d", wTrash.Result().StatusCode)
	}

	var trashResp TrashResponse
	if err := json.NewDecoder(wTrash.Result().Body).Decode(&trashResp); err != nil {
		t.Fatalf("Failed to decode trash response: %v", err)
	}

	if trashResp.TotalCount != 1 || len(trashResp.Items) != 1 {
		t.Fatalf("Expected 1 item in trash, got %d", trashResp.TotalCount)
	}
	item := trashResp.Items[0]
	if item.Name != "important_doc.pdf" || item.OriginalPath != "/important_doc.pdf" {
		t.Fatalf("Unexpected trash item data: %+v", item)
	}
	if item.Size != int64(len("PDF content 12345")) {
		t.Fatalf("Expected size %d, got %d", len("PDF content 12345"), item.Size)
	}

	// Verify .trash is hidden from handleGetFiles
	reqFiles := httptest.NewRequest("GET", "/api/files?storage=s1&path=/", nil)
	wFiles := httptest.NewRecorder()
	handleGetFiles(wFiles, reqFiles)

	var filesResp struct {
		Items []FileItem `json:"items"`
	}
	_ = json.NewDecoder(wFiles.Result().Body).Decode(&filesResp)
	for _, fi := range filesResp.Items {
		if fi.Name == ".trash" {
			t.Fatalf(".trash folder must not be visible in handleGetFiles!")
		}
	}

	// Also verify direct access to /.trash is forbidden
	reqHidden := httptest.NewRequest("GET", "/api/files?storage=s1&path=/.trash", nil)
	wHidden := httptest.NewRecorder()
	handleGetFiles(wHidden, reqHidden)
	if wHidden.Result().StatusCode != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden for /.trash access, got %d", wHidden.Result().StatusCode)
	}

	// 4. Restore important_doc.pdf
	restoreReqBody := fmt.Sprintf(`{"storage":"s1","ids":["%s"]}`, item.ID)
	reqRestore := httptest.NewRequest("POST", "/api/trash/restore", strings.NewReader(restoreReqBody))
	reqRestore.Header.Set("Content-Type", "application/json")
	wRestore := httptest.NewRecorder()
	handleRestoreTrash(wRestore, reqRestore)

	if wRestore.Result().StatusCode != http.StatusOK {
		t.Fatalf("Restore failed with status %d", wRestore.Result().StatusCode)
	}

	// Verify restored file exists at original location
	if _, err := os.Stat(file1Path); os.IsNotExist(err) {
		t.Fatalf("Restored file does not exist at %s", file1Path)
	}

	// 5. Test soft-deleting directory test_folder
	deleteDirReqBody := `{"storage":"s1","paths":["/test_folder"]}`
	reqDirDel := httptest.NewRequest("POST", "/api/files/delete", strings.NewReader(deleteDirReqBody))
	reqDirDel.Header.Set("Content-Type", "application/json")
	wDirDel := httptest.NewRecorder()
	handleDelete(wDirDel, reqDirDel)

	// Check trash contains directory
	wTrash2 := httptest.NewRecorder()
	handleGetTrash(wTrash2, httptest.NewRequest("GET", "/api/trash?storage=s1", nil))
	var trashResp2 TrashResponse
	_ = json.NewDecoder(wTrash2.Result().Body).Decode(&trashResp2)
	if trashResp2.TotalCount != 1 || !trashResp2.Items[0].IsDir {
		t.Fatalf("Expected 1 dir item in trash, got %+v", trashResp2)
	}

	// 6. Test selective permanent delete from trash (/api/trash/delete)
	extraTrashFile := filepath.Join(activeStorages[0].Path, "temp_note.txt")
	_ = os.WriteFile(extraTrashFile, []byte("To be selectively deleted from trash"), 0644)
	reqExtraDel := httptest.NewRequest("POST", "/api/files/delete", strings.NewReader(`{"storage":"s1","paths":["/temp_note.txt"]}`))
	reqExtraDel.Header.Set("Content-Type", "application/json")
	handleDelete(httptest.NewRecorder(), reqExtraDel)

	// Trash now has 2 items (test_folder and temp_note.txt). Delete only test_folder permanently.
	delTrashBody := fmt.Sprintf(`{"storage":"s1","ids":["%s"]}`, trashResp2.Items[0].ID)
	reqDelTrash := httptest.NewRequest("POST", "/api/trash/delete", strings.NewReader(delTrashBody))
	reqDelTrash.Header.Set("Content-Type", "application/json")
	wDelTrash := httptest.NewRecorder()
	handleDeleteTrash(wDelTrash, reqDelTrash)

	if wDelTrash.Result().StatusCode != http.StatusOK {
		t.Fatalf("Selective trash delete failed with status %d", wDelTrash.Result().StatusCode)
	}

	wTrashAfterDel := httptest.NewRecorder()
	handleGetTrash(wTrashAfterDel, httptest.NewRequest("GET", "/api/trash?storage=s1", nil))
	var trashRespAfterDel TrashResponse
	_ = json.NewDecoder(wTrashAfterDel.Result().Body).Decode(&trashRespAfterDel)
	if trashRespAfterDel.TotalCount != 1 || trashRespAfterDel.Items[0].Name != "temp_note.txt" {
		t.Fatalf("Expected only temp_note.txt to remain in trash, got %+v", trashRespAfterDel)
	}

	// 7. Test Empty Trash
	emptyBody := `{"storage":"s1"}`
	reqEmpty := httptest.NewRequest("POST", "/api/trash/empty", strings.NewReader(emptyBody))
	reqEmpty.Header.Set("Content-Type", "application/json")
	wEmpty := httptest.NewRecorder()
	handleEmptyTrash(wEmpty, reqEmpty)

	if wEmpty.Result().StatusCode != http.StatusOK {
		t.Fatalf("Empty trash failed with status %d", wEmpty.Result().StatusCode)
	}

	// Verify trash is now empty
	wTrash3 := httptest.NewRecorder()
	handleGetTrash(wTrash3, httptest.NewRequest("GET", "/api/trash?storage=s1", nil))
	var trashResp3 TrashResponse
	_ = json.NewDecoder(wTrash3.Result().Body).Decode(&trashResp3)
	if trashResp3.TotalCount != 0 {
		t.Fatalf("Trash should be empty, but got %d items", trashResp3.TotalCount)
	}
}

func TestPermanentDelete(t *testing.T) {
	_, cleanup := setupTestEnvironment(t)
	defer cleanup()

	file1Path := filepath.Join(activeStorages[0].Path, "to_destroy.txt")
	_ = os.WriteFile(file1Path, []byte("Goodbye forever"), 0644)

	// Delete with permanent: true
	deleteReqBody := `{"storage":"s1","paths":["/to_destroy.txt"],"permanent":true}`
	req := httptest.NewRequest("POST", "/api/files/delete", strings.NewReader(deleteReqBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleDelete(w, req)

	if w.Result().StatusCode != http.StatusOK {
		t.Fatalf("Permanent delete failed with status %d", w.Result().StatusCode)
	}

	// Verify file is gone from filesystem
	if _, err := os.Stat(file1Path); !os.IsNotExist(err) {
		t.Fatalf("Permanently deleted file should not exist at %s", file1Path)
	}

	// Verify it was NOT added to trash
	wTrash := httptest.NewRecorder()
	handleGetTrash(wTrash, httptest.NewRequest("GET", "/api/trash?storage=s1", nil))
	var trashResp TrashResponse
	_ = json.NewDecoder(wTrash.Result().Body).Decode(&trashResp)
	if trashResp.TotalCount != 0 {
		t.Fatalf("Trash should be 0 for permanent delete, got %d", trashResp.TotalCount)
	}
}
