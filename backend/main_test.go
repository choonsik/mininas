package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func setupTestEnvironment(t *testing.T) (string, func()) {
	t.Helper()
	tempDir, err := os.MkdirTemp("", "mininas_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	storage1 := filepath.Join(tempDir, "storage1")
	storage2 := filepath.Join(tempDir, "storage2")
	_ = os.MkdirAll(storage1, 0755)
	_ = os.MkdirAll(storage2, 0755)

	activeStorages = []StorageEntry{
		{ID: "s1", Name: "스토리지 1", Path: storage1},
		{ID: "s2", Name: "스토리지 2", Path: storage2},
	}

	cleanup := func() {
		os.RemoveAll(tempDir)
	}
	return tempDir, cleanup
}

func TestStorageSecurityTraversal(t *testing.T) {
	_, cleanup := setupTestEnvironment(t)
	defer cleanup()

	// Directory traversal attempt
	_, err := resolveSafePath("s1", "../../etc/passwd")
	if err == nil {
		t.Fatal("Expected error on directory traversal attempt, got nil")
	}

	// Normal valid path
	valid, err := resolveSafePath("s1", "sub/folder")
	if err != nil {
		t.Fatalf("Expected valid path, got error: %v", err)
	}
	if !strings.HasPrefix(valid, activeStorages[0].Path) {
		t.Fatalf("Path %s escaped storage root %s", valid, activeStorages[0].Path)
	}
}

func TestGetStoragesAPI(t *testing.T) {
	_, cleanup := setupTestEnvironment(t)
	defer cleanup()

	req := httptest.NewRequest("GET", "/api/storages", nil)
	w := httptest.NewRecorder()

	handleGetStorages(w, req)
	resp := w.Result()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", resp.StatusCode)
	}

	var storages []StorageInfo
	if err := json.NewDecoder(resp.Body).Decode(&storages); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(storages) != 2 {
		t.Fatalf("Expected 2 storages, got %d", len(storages))
	}
	if storages[0].ID != "s1" || storages[1].ID != "s2" {
		t.Fatalf("Unexpected storage IDs: %+v", storages)
	}
}

func TestFileUploadAndGetFiles(t *testing.T) {
	_, cleanup := setupTestEnvironment(t)
	defer cleanup()

	// 1. Prepare multipart upload
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("storage", "s1")
	_ = writer.WriteField("targetPath", "/")

	part, err := writer.CreateFormFile("files", "test_file.txt")
	if err != nil {
		t.Fatalf("Failed to create form file: %v", err)
	}
	testContent := "Hello MiniNAS Test Harness!"
	_, _ = part.Write([]byte(testContent))
	_ = writer.Close()

	// 2. Perform upload
	req := httptest.NewRequest("POST", "/api/files/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()

	handleUpload(w, req)
	if w.Result().StatusCode != http.StatusOK {
		t.Fatalf("Upload failed with status %d", w.Result().StatusCode)
	}

	// 3. Verify file exists in filesystem
	filePath := filepath.Join(activeStorages[0].Path, "test_file.txt")
	content, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("File was not saved to disk: %v", err)
	}
	if string(content) != testContent {
		t.Fatalf("Content mismatch: expected %q, got %q", testContent, string(content))
	}

	// 4. Verify /api/files API
	reqFiles := httptest.NewRequest("GET", "/api/files?storage=s1&path=/", nil)
	wFiles := httptest.NewRecorder()
	handleGetFiles(wFiles, reqFiles)

	var listResp struct {
		CurrentPath string     `json:"currentPath"`
		Items       []FileItem `json:"items"`
	}
	_ = json.NewDecoder(wFiles.Result().Body).Decode(&listResp)

	if len(listResp.Items) != 1 || listResp.Items[0].Name != "test_file.txt" {
		t.Fatalf("Expected test_file.txt in file list, got %+v", listResp.Items)
	}
}

func TestRangeStreaming(t *testing.T) {
	_, cleanup := setupTestEnvironment(t)
	defer cleanup()

	// Write sample video/text data
	testData := []byte("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ")
	filePath := filepath.Join(activeStorages[0].Path, "stream.bin")
	_ = os.WriteFile(filePath, testData, 0644)

	// Range request for bytes 10-19 ("ABCDEFGHIJ")
	req := httptest.NewRequest("GET", "/api/files/stream?storage=s1&path=/stream.bin", nil)
	req.Header.Set("Range", "bytes=10-19")
	w := httptest.NewRecorder()

	handleStream(w, req)
	resp := w.Result()

	if resp.StatusCode != http.StatusPartialContent {
		t.Fatalf("Expected status 206 Partial Content, got %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	expected := "ABCDEFGHIJ"
	if string(body) != expected {
		t.Fatalf("Expected range %q, got %q", expected, string(body))
	}
}

func TestZipStreaming(t *testing.T) {
	_, cleanup := setupTestEnvironment(t)
	defer cleanup()

	// Write 2 sample files
	_ = os.WriteFile(filepath.Join(activeStorages[0].Path, "f1.txt"), []byte("File 1 content"), 0644)
	_ = os.WriteFile(filepath.Join(activeStorages[0].Path, "f2.txt"), []byte("File 2 content"), 0644)

	req := httptest.NewRequest("GET", "/api/files/download-zip?storage=s1&path=/f1.txt&path=/f2.txt", nil)
	w := httptest.NewRecorder()

	handleDownloadZip(w, req)
	resp := w.Result()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", resp.StatusCode)
	}

	zipBytes, _ := io.ReadAll(resp.Body)
	zipReader, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("Failed to parse zip output: %v", err)
	}

	if len(zipReader.File) != 2 {
		t.Fatalf("Expected 2 files in zip, got %d", len(zipReader.File))
	}
}

func TestStaticSiteHosting(t *testing.T) {
	_, cleanup := setupTestEnvironment(t)
	defer cleanup()

	// 1. Create a site directory in storage 2 (s2)
	siteDir := filepath.Join(activeStorages[1].Path, "my-blog")
	_ = os.MkdirAll(siteDir, 0755)

	htmlContent := "<html><body><h1>Welcome to My MiniNAS Blog</h1></body></html>"
	cssContent := "body { background: #000; color: #fff; }"
	_ = os.WriteFile(filepath.Join(siteDir, "index.html"), []byte(htmlContent), 0644)
	_ = os.WriteFile(filepath.Join(siteDir, "style.css"), []byte(cssContent), 0644)

	// Test 1: Accessing directory with trailing slash -> should auto-serve index.html
	req1 := httptest.NewRequest("GET", "/sites/s2/my-blog/", nil)
	w1 := httptest.NewRecorder()
	handleSitesHosting(w1, req1)
	resp1 := w1.Result()

	if resp1.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 for index.html, got %d", resp1.StatusCode)
	}
	body1, _ := io.ReadAll(resp1.Body)
	if !strings.Contains(string(body1), "Welcome to My MiniNAS Blog") {
		t.Fatalf("Expected HTML content, got %s", string(body1))
	}

	// Test 2: Accessing relative asset style.css
	req2 := httptest.NewRequest("GET", "/sites/s2/my-blog/style.css", nil)
	w2 := httptest.NewRecorder()
	handleSitesHosting(w2, req2)
	resp2 := w2.Result()

	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 for style.css, got %d", resp2.StatusCode)
	}
	body2, _ := io.ReadAll(resp2.Body)
	if !strings.Contains(string(body2), "background: #000") {
		t.Fatalf("Expected CSS content, got %s", string(body2))
	}

	// Test 3: Path traversal attempt -> should return 403 Forbidden
	req3 := httptest.NewRequest("GET", "/sites/s2/../../etc/passwd", nil)
	w3 := httptest.NewRecorder()
	handleSitesHosting(w3, req3)
	if w3.Result().StatusCode != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden on traversal attempt, got %d", w3.Result().StatusCode)
	}

	// Test 4: Accessing directory WITHOUT index.html -> should render modern directory listing
	noIndexDir := filepath.Join(activeStorages[0].Path, "docs")
	_ = os.MkdirAll(noIndexDir, 0755)
	_ = os.WriteFile(filepath.Join(noIndexDir, "readme.txt"), []byte("Docs content..."), 0644)

	req4 := httptest.NewRequest("GET", "/sites/s1/docs/", nil)
	w4 := httptest.NewRecorder()
	handleSitesHosting(w4, req4)
	resp4 := w4.Result()

	if resp4.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 for directory listing, got %d", resp4.StatusCode)
	}
	body4, _ := io.ReadAll(resp4.Body)
	if !strings.Contains(string(body4), "Index of") || !strings.Contains(string(body4), "readme.txt") {
		t.Fatalf("Expected directory listing HTML, got: %s", string(body4))
	}
}

func TestConfigValidation(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "cfg_test_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	// Case 1: Broken JSON syntax (missing comma)
	brokenJSON := `{
		"port": 8080
		"storages": []
	}`
	brokenPath := filepath.Join(tempDir, "broken.json")
	_ = os.WriteFile(brokenPath, []byte(brokenJSON), 0644)

	valid1, errs1, _ := validateConfig(brokenPath)
	if valid1 || len(errs1) == 0 {
		t.Fatal("Expected error on broken JSON syntax, got valid")
	}
	if !strings.Contains(errs1[0], "JSON 문법 오류") {
		t.Fatalf("Expected 'JSON 문법 오류' message, got: %s", errs1[0])
	}

	// Case 2: Invalid port
	badPortJSON := `{
		"port": 999999,
		"storages": [{"id": "s", "name": "n", "path": "/tmp"}]
	}`
	badPortPath := filepath.Join(tempDir, "badport.json")
	_ = os.WriteFile(badPortPath, []byte(badPortJSON), 0644)

	valid2, errs2, _ := validateConfig(badPortPath)
	if valid2 || len(errs2) == 0 {
		t.Fatal("Expected error on invalid port, got valid")
	}

	// Case 3: Valid config with non-existent path warning
	validJSON := `{
		"port": 8080,
		"storages": [
			{"id": "main", "name": "기본", "path": "/tmp"},
			{"id": "hdd", "name": "외장", "path": "/path/does/not/exist/99999"}
		]
	}`
	validPath := filepath.Join(tempDir, "valid.json")
	_ = os.WriteFile(validPath, []byte(validJSON), 0644)

	valid3, errs3, warns3 := validateConfig(validPath)
	if !valid3 || len(errs3) != 0 {
		t.Fatalf("Expected valid config, got errors: %v", errs3)
	}
	if len(warns3) != 1 {
		t.Fatalf("Expected 1 warning for non-existent path, got %d", len(warns3))
	}
}
