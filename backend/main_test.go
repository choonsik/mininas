package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
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

	// 5. Test Recursive Media Query (/api/files?recursive=true&type=image)
	subDir := filepath.Join(activeStorages[0].Path, "sub_album", "2026")
	_ = os.MkdirAll(subDir, 0755)
	_ = os.WriteFile(filepath.Join(subDir, "photo1.jpg"), []byte("fake_jpg_content"), 0644)
	_ = os.WriteFile(filepath.Join(subDir, "document.pdf"), []byte("fake_pdf_content"), 0644)

	reqRec := httptest.NewRequest("GET", "/api/files?storage=s1&path=/&recursive=true&type=image", nil)
	wRec := httptest.NewRecorder()
	handleGetFiles(wRec, reqRec)

	var recResp struct {
		CurrentPath string     `json:"currentPath"`
		Items       []FileItem `json:"items"`
	}
	_ = json.NewDecoder(wRec.Result().Body).Decode(&recResp)

	if len(recResp.Items) != 1 || recResp.Items[0].Name != "photo1.jpg" {
		t.Fatalf("Expected recursive to find 1 photo1.jpg, got %+v", recResp.Items)
	}
	if recResp.Items[0].Path != "/sub_album/2026/photo1.jpg" {
		t.Fatalf("Expected item path /sub_album/2026/photo1.jpg, got %s", recResp.Items[0].Path)
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

func TestFileCopyAndMove(t *testing.T) {
	_, cleanup := setupTestEnvironment(t)
	defer cleanup()

	// 1. Create a file and a subdirectory
	srcFilePath := filepath.Join(activeStorages[0].Path, "original.txt")
	_ = os.WriteFile(srcFilePath, []byte("Content to copy and move"), 0644)
	subDir := filepath.Join(activeStorages[0].Path, "target_folder")
	_ = os.MkdirAll(subDir, 0755)

	// 2. Test Copy
	copyReqBody := `{"storage":"s1","sourcePaths":["/original.txt"],"targetDir":"/target_folder"}`
	reqCopy := httptest.NewRequest("POST", "/api/files/copy", strings.NewReader(copyReqBody))
	reqCopy.Header.Set("Content-Type", "application/json")
	wCopy := httptest.NewRecorder()
	handleCopy(wCopy, reqCopy)

	if wCopy.Result().StatusCode != http.StatusOK {
		t.Fatalf("Copy failed with status %d", wCopy.Result().StatusCode)
	}

	copiedPath := filepath.Join(subDir, "original.txt")
	if _, err := os.Stat(copiedPath); os.IsNotExist(err) {
		t.Fatalf("Copied file does not exist at %s", copiedPath)
	}
	// Verify original file still exists
	if _, err := os.Stat(srcFilePath); os.IsNotExist(err) {
		t.Fatalf("Original file should still exist after copy")
	}

	// 3. Test Move
	moveReqBody := `{"storage":"s1","sourcePaths":["/original.txt"],"targetDir":"/target_folder"}`
	reqMove := httptest.NewRequest("POST", "/api/files/move", strings.NewReader(moveReqBody))
	reqMove.Header.Set("Content-Type", "application/json")
	wMove := httptest.NewRecorder()
	handleMove(wMove, reqMove)

	if wMove.Result().StatusCode != http.StatusOK {
		t.Fatalf("Move failed with status %d", wMove.Result().StatusCode)
	}

	// Since target_folder already has original.txt, it should have been moved with unique name original (1).txt
	movedUniquePath := filepath.Join(subDir, "original (1).txt")
	if _, err := os.Stat(movedUniquePath); os.IsNotExist(err) {
		t.Fatalf("Moved file should exist with unique name at %s", movedUniquePath)
	}
	// Original file in root should no longer exist
	if _, err := os.Stat(srcFilePath); !os.IsNotExist(err) {
		t.Fatalf("Original file should be gone after move")
	}

	// 4. Test Cross-Storage Move (s1 -> s2)
	crossSrcPath := filepath.Join(activeStorages[0].Path, "to_cross.txt")
	_ = os.WriteFile(crossSrcPath, []byte("Cross storage content"), 0644)
	crossMoveBody := `{"sourceStorage":"s1","targetStorage":"s2","sourcePaths":["/to_cross.txt"],"targetDir":"/"}`
	reqCross := httptest.NewRequest("POST", "/api/files/move", strings.NewReader(crossMoveBody))
	reqCross.Header.Set("Content-Type", "application/json")
	wCross := httptest.NewRecorder()
	handleMove(wCross, reqCross)

	if wCross.Result().StatusCode != http.StatusOK {
		t.Fatalf("Cross-storage move failed with status %d", wCross.Result().StatusCode)
	}

	dstCrossPath := filepath.Join(activeStorages[1].Path, "to_cross.txt")
	if _, err := os.Stat(dstCrossPath); os.IsNotExist(err) {
		t.Fatalf("Cross-storage destination file not found at %s", dstCrossPath)
	}
	if _, err := os.Stat(crossSrcPath); !os.IsNotExist(err) {
		t.Fatalf("Cross-storage source file should be deleted after move")
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

	// Test 5: Accessing default root /sites/ directly -> should redirect to web UI Sites Hub (/?tab=sites)
	req5 := httptest.NewRequest("GET", "/sites/", nil)
	w5 := httptest.NewRecorder()
	handleSitesHosting(w5, req5)
	resp5 := w5.Result()
	if resp5.StatusCode != http.StatusFound {
		t.Fatalf("Expected 302 redirect for root /sites/, got %d", resp5.StatusCode)
	}
	loc := resp5.Header.Get("Location")
	if loc != "/?tab=sites" {
		t.Fatalf("Expected redirect to '/?tab=sites', got %s", loc)
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

func TestListSitesAPI(t *testing.T) {
	tempDir := t.TempDir()
	origStorages := activeStorages
	defer func() { activeStorages = origStorages }()

	origPinnedFile := pinnedSitesFile
	pinnedSitesFile = filepath.Join(tempDir, "pinned_test.json")
	defer func() { pinnedSitesFile = origPinnedFile }()

	activeStorages = []StorageEntry{
		{ID: "test-site", Name: "테스트", Path: tempDir},
	}

	// 1. Model B: htdocs 폴더 생성
	htdocsDir := filepath.Join(tempDir, "htdocs")
	_ = os.Mkdir(htdocsDir, 0755)

	// htdocs/bomchoon (index.html 포함 웹 프로젝트)
	bomchoonDir := filepath.Join(htdocsDir, "bomchoon")
	_ = os.Mkdir(bomchoonDir, 0755)
	_ = os.WriteFile(filepath.Join(bomchoonDir, "index.html"), []byte("<html><head><title>봄春 블로그</title></head><body>본문</body></html>"), 0644)

	// sites/ (폴더 자체가 index.html을 포함하는 루트 웹사이트)
	sitesDir := filepath.Join(tempDir, "sites")
	_ = os.Mkdir(sitesDir, 0755)
	_ = os.WriteFile(filepath.Join(sitesDir, "index.html"), []byte("<html><head><title>내 메인 사이트</title></head><body>환영합니다</body></html>"), 0644)

	// htdocs/maily.so (index.html 없는 문서 아카이브)
	mailyDir := filepath.Join(htdocsDir, "maily.so")
	_ = os.Mkdir(mailyDir, 0755)
	_ = os.WriteFile(filepath.Join(mailyDir, "post1.html"), []byte("<html><body>글1</body></html>"), 0644)
	_ = os.WriteFile(filepath.Join(mailyDir, "post2.html"), []byte("<html><body>글2</body></html>"), 0644)

	// 2. Model C: htdocs 바깥의 독립 보고서
	outsideDir := filepath.Join(tempDir, "outside")
	_ = os.Mkdir(outsideDir, 0755)
	reportFile := filepath.Join(outsideDir, "report.html")
	_ = os.WriteFile(reportFile, []byte("<html><head><title>외부 매출 보고서</title></head></html>"), 0644)

	// 3. API 호출 1: 핀 전에는 index.html이 있는 bomchoon과 sites 2개가 검출되어야 함 (maily.so는 index 없음)
	req1 := httptest.NewRequest(http.MethodGet, "/api/sites", nil)
	rr1 := httptest.NewRecorder()
	handleListSites(rr1, req1)

	var sites1 []SiteItem
	_ = json.NewDecoder(rr1.Body).Decode(&sites1)
	if len(sites1) != 2 {
		t.Fatalf("Expected 2 sites (with index.html), got %d", len(sites1))
	}
	// Check that both bomchoon and sites are present
	foundBomchoon := false
	foundSites := false
	for _, s := range sites1 {
		if strings.Contains(s.Title, "봄春 블로그") {
			foundBomchoon = true
		}
		if s.RelPath == "/sites" {
			foundSites = true
			if s.URL != "/sites/test-site/sites/" {
				t.Errorf("Expected URL '/sites/test-site/sites/', got '%s'", s.URL)
			}
		}
	}
	if !foundBomchoon || !foundSites {
		t.Errorf("Expected both bomchoon and sites, got foundBomchoon=%v, foundSites=%v", foundBomchoon, foundSites)
	}

	// 4. Model C: index.html이 없는 maily.so를 핀 고정 호출
	pinBody := `{"storage":"test-site", "path":"/htdocs/maily.so"}`
	pinReq := httptest.NewRequest(http.MethodPost, "/api/sites/pin", strings.NewReader(pinBody))
	pinRR := httptest.NewRecorder()
	handlePinSite(pinRR, pinReq)
	if pinRR.Code != http.StatusOK {
		t.Fatalf("Failed to pin site: %s", pinRR.Body.String())
	}

	// 5. API 호출 2: 핀 후에는 3개가 검출되어야 함 (bomchoon + sites + maily.so)
	req2 := httptest.NewRequest(http.MethodGet, "/api/sites", nil)
	rr2 := httptest.NewRecorder()
	handleListSites(rr2, req2)

	var sites2 []SiteItem
	_ = json.NewDecoder(rr2.Body).Decode(&sites2)
	if len(sites2) != 3 {
		t.Fatalf("Expected 3 sites after pin, got %d", len(sites2))
	}

	foundPinned := false
	for _, s := range sites2 {
		if s.RelPath == "/htdocs/maily.so" {
			foundPinned = true
			if !s.IsPinned {
				t.Errorf("Expected IsPinned true, got false")
			}
			if !strings.Contains(s.Title, "maily.so") {
				t.Errorf("Expected title to contain 'maily.so', got %s", s.Title)
			}
		}
	}
	if !foundPinned {
		t.Errorf("Pinned site not found in list")
	}

	// 6. 핀 해제 API 호출
	unpinReq := httptest.NewRequest(http.MethodPost, "/api/sites/unpin", strings.NewReader(pinBody))
	unpinRR := httptest.NewRecorder()
	handleUnpinSite(unpinRR, unpinReq)
	if unpinRR.Code != http.StatusOK {
		t.Fatalf("Failed to unpin site: %s", unpinRR.Body.String())
	}

	// 7. API 호출 3: 핀 해제 후 다시 2개로 복귀 (bomchoon + sites)
	req3 := httptest.NewRequest(http.MethodGet, "/api/sites", nil)
	rr3 := httptest.NewRecorder()
	handleListSites(rr3, req3)

	var sites3 []SiteItem
	_ = json.NewDecoder(rr3.Body).Decode(&sites3)
	if len(sites3) != 2 {
		t.Fatalf("Expected 2 sites after unpin, got %d", len(sites3))
	}
}

func TestCinemaListAPI(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "mininas_cinema_test_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	oldStorages := activeStorages
	defer func() { activeStorages = oldStorages }()

	activeStorages = []StorageEntry{
		{ID: "cinema-test", Name: "영화 테스트", Path: tempDir},
	}

	// 1. 영화 파일 1: 1.5MB mp4 + srt 자막
	movie1 := filepath.Join(tempDir, "Parasite (2019).mp4")
	_ = os.WriteFile(movie1, make([]byte, 1500000), 0644)
	sub1 := filepath.Join(tempDir, "Parasite (2019).srt")
	_ = os.WriteFile(sub1, []byte("1\n00:00:01,000 --> 00:00:04,000\n안녕하세요\n"), 0644)

	// 2. 영화 파일 2: 하위 폴더 내 2MB mkv (자막 없음)
	subDir := filepath.Join(tempDir, "Sci-Fi")
	_ = os.Mkdir(subDir, 0755)
	movie2 := filepath.Join(subDir, "Inception.mkv")
	_ = os.WriteFile(movie2, make([]byte, 2000000), 0644)

	// 3. 작은 파일: 500KB (1MB 미만이므로 시네마 라이브러리에서 필터링되어야 함)
	smallVideo := filepath.Join(tempDir, "sample_clip.mp4")
	_ = os.WriteFile(smallVideo, make([]byte, 500000), 0644)

	// API 호출
	req := httptest.NewRequest(http.MethodGet, "/api/cinema", nil)
	rr := httptest.NewRecorder()
	handleCinemaList(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
	}

	var items []CinemaItem
	if err := json.NewDecoder(rr.Body).Decode(&items); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(items) != 2 {
		t.Fatalf("Expected 2 cinema items, got %d", len(items))
	}

	foundParasite := false
	foundInception := false
	for _, it := range items {
		if strings.Contains(it.Name, "Parasite") {
			foundParasite = true
			if !it.HasSubtitle {
				t.Errorf("Expected Parasite to have subtitle=true, got false")
			}
			if it.StorageID != "cinema-test" {
				t.Errorf("Expected storageId 'cinema-test', got %s", it.StorageID)
			}
		}
		if strings.Contains(it.Name, "Inception") {
			foundInception = true
			if it.HasSubtitle {
				t.Errorf("Expected Inception to have subtitle=false, got true")
			}
			if it.RelPath != "/Sci-Fi/Inception.mkv" {
				t.Errorf("Expected relPath '/Sci-Fi/Inception.mkv', got %s", it.RelPath)
			}
		}
	}

	if !foundParasite || !foundInception {
		t.Errorf("Did not find expected movies: foundParasite=%v, foundInception=%v", foundParasite, foundInception)
	}
}

func TestPhotosListAPI(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "mininas_photos_test_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	oldStorages := activeStorages
	defer func() { activeStorages = oldStorages }()

	activeStorages = []StorageEntry{
		{ID: "photo-test", Name: "포토 테스트", Path: tempDir},
	}

	// 1. 사진 파일: JPG, HEIC
	_ = os.WriteFile(filepath.Join(tempDir, "family.jpg"), []byte("fake-jpeg-data"), 0644)
	_ = os.WriteFile(filepath.Join(tempDir, "vacation.heic"), []byte("fake-heic-data"), 0644)

	// 2. 비디오 클립: MOV (50KB)
	_ = os.WriteFile(filepath.Join(tempDir, "baby_steps.mov"), []byte("fake-mov-data"), 0644)

	// 3. 웹사이트 에셋 (sites/logo.png) -> 반드시 제외되어야 함!
	sitesDir := filepath.Join(tempDir, "sites")
	_ = os.Mkdir(sitesDir, 0755)
	_ = os.WriteFile(filepath.Join(sitesDir, "logo.png"), []byte("web-logo"), 0644)

	// 4. 영화 폴더 내 비디오 (movies/action.mp4) -> 반드시 제외되어야 함!
	moviesDir := filepath.Join(tempDir, "movies")
	_ = os.Mkdir(moviesDir, 0755)
	_ = os.WriteFile(filepath.Join(moviesDir, "action.mp4"), []byte("movie-data"), 0644)

	// 5. 비미디어 파일: 텍스트 (제외되어야 함)
	_ = os.WriteFile(filepath.Join(tempDir, "notes.txt"), []byte("notes-data"), 0644)

	// 전체 조회 (기본값: 모든 폴더 포함 -> 5개)
	req := httptest.NewRequest(http.MethodGet, "/api/photos", nil)
	rr := httptest.NewRecorder()
	handlePhotosList(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
	}

	var allItems []PhotoItem
	if err := json.NewDecoder(rr.Body).Decode(&allItems); err != nil {
		t.Fatalf("Failed to decode: %v", err)
	}
	if len(allItems) != 5 {
		t.Fatalf("Expected 5 items (all folders included), got %d", len(allItems))
	}

	// skip_special=true 토글 검증 (영화/웹사이트 폴더 제외 -> 3개)
	reqSkip := httptest.NewRequest(http.MethodGet, "/api/photos?skip_special=true", nil)
	rrSkip := httptest.NewRecorder()
	handlePhotosList(rrSkip, reqSkip)
	var skipItems []PhotoItem
	_ = json.NewDecoder(rrSkip.Body).Decode(&skipItems)
	if len(skipItems) != 3 {
		t.Fatalf("Expected 3 items with skip_special=true, got %d", len(skipItems))
	}

	// type=image 필터 검증 (기본값: sites/logo.png 포함 3개)
	reqImg := httptest.NewRequest(http.MethodGet, "/api/photos?type=image", nil)
	rrImg := httptest.NewRecorder()
	handlePhotosList(rrImg, reqImg)
	var imgItems []PhotoItem
	_ = json.NewDecoder(rrImg.Body).Decode(&imgItems)
	if len(imgItems) != 3 {
		t.Fatalf("Expected 3 images (including sites/logo.png), got %d", len(imgItems))
	}

	// type=image&skip_special=true 검증 (웹 에셋 제외 2개)
	reqImgSkip := httptest.NewRequest(http.MethodGet, "/api/photos?type=image&skip_special=true", nil)
	rrImgSkip := httptest.NewRecorder()
	handlePhotosList(rrImgSkip, reqImgSkip)
	var imgSkipItems []PhotoItem
	_ = json.NewDecoder(rrImgSkip.Body).Decode(&imgSkipItems)
	if len(imgSkipItems) != 2 {
		t.Fatalf("Expected 2 images with skip_special=true, got %d", len(imgSkipItems))
	}

	// type=video 필터 검증 (기본값: movies/action.mp4 포함 2개)
	reqVid := httptest.NewRequest(http.MethodGet, "/api/photos?type=video", nil)
	rrVid := httptest.NewRecorder()
	handlePhotosList(rrVid, reqVid)
	var vidItems []PhotoItem
	_ = json.NewDecoder(rrVid.Body).Decode(&vidItems)
	if len(vidItems) != 2 {
		t.Fatalf("Expected 2 videos (including movies/action.mp4), got %d", len(vidItems))
	}

	// type=video&skip_special=true 검증 (영화 제외 1개)
	reqVidSkip := httptest.NewRequest(http.MethodGet, "/api/photos?type=video&skip_special=true", nil)
	rrVidSkip := httptest.NewRecorder()
	handlePhotosList(rrVidSkip, reqVidSkip)
	var vidSkipItems []PhotoItem
	_ = json.NewDecoder(rrVidSkip.Body).Decode(&vidSkipItems)
	if len(vidSkipItems) != 1 {
		t.Fatalf("Expected 1 video with skip_special=true, got %d", len(vidSkipItems))
	}
}

func TestMkdirRenameAndDownload(t *testing.T) {
	_, cleanup := setupTestEnvironment(t)
	defer cleanup()

	// 1. Test Mkdir (/api/files/mkdir)
	mkdirBody := `{"storage":"s1","parentPath":"/","name":"new_album"}`
	reqMkdir := httptest.NewRequest(http.MethodPost, "/api/files/mkdir", strings.NewReader(mkdirBody))
	reqMkdir.Header.Set("Content-Type", "application/json")
	wMkdir := httptest.NewRecorder()
	handleMkdir(wMkdir, reqMkdir)

	if wMkdir.Result().StatusCode != http.StatusOK {
		t.Fatalf("Mkdir failed with status %d", wMkdir.Result().StatusCode)
	}
	createdDir := filepath.Join(activeStorages[0].Path, "new_album")
	if info, err := os.Stat(createdDir); err != nil || !info.IsDir() {
		t.Fatalf("Expected directory at %s, err: %v", createdDir, err)
	}

	// 2. Create a file inside new_album and test Rename (/api/files/rename)
	origFile := filepath.Join(createdDir, "draft.txt")
	expectedPayload := "Download verification payload 12345"
	_ = os.WriteFile(origFile, []byte(expectedPayload), 0644)

	renameBody := `{"storage":"s1","path":"/new_album/draft.txt","newName":"final.txt"}`
	reqRename := httptest.NewRequest(http.MethodPost, "/api/files/rename", strings.NewReader(renameBody))
	reqRename.Header.Set("Content-Type", "application/json")
	wRename := httptest.NewRecorder()
	handleRename(wRename, reqRename)

	if wRename.Result().StatusCode != http.StatusOK {
		t.Fatalf("Rename failed with status %d", wRename.Result().StatusCode)
	}
	renamedFile := filepath.Join(createdDir, "final.txt")
	if _, err := os.Stat(renamedFile); err != nil {
		t.Fatalf("Expected renamed file at %s, err: %v", renamedFile, err)
	}

	// 3. Test Single File Download (/api/files/download)
	reqDl := httptest.NewRequest(http.MethodGet, "/api/files/download?storage=s1&path=/new_album/final.txt", nil)
	wDl := httptest.NewRecorder()
	handleDownload(wDl, reqDl)

	respDl := wDl.Result()
	if respDl.StatusCode != http.StatusOK {
		t.Fatalf("Download failed with status %d", respDl.StatusCode)
	}
	if !strings.Contains(respDl.Header.Get("Content-Disposition"), "final.txt") {
		t.Errorf("Expected Content-Disposition with final.txt, got %s", respDl.Header.Get("Content-Disposition"))
	}
	dlBytes, _ := io.ReadAll(respDl.Body)
	if string(dlBytes) != expectedPayload {
		t.Fatalf("Downloaded content mismatch: expected %q, got %q", expectedPayload, string(dlBytes))
	}
}

func TestMusicAndCoverAPI(t *testing.T) {
	_, cleanup := setupTestEnvironment(t)
	defer cleanup()

	// 1. Create an album directory with an MP3 containing an ID3v2.3 APIC JPEG frame
	albumDir1 := filepath.Join(activeStorages[0].Path, "Jazz Classics")
	_ = os.MkdirAll(albumDir1, 0755)

	fakeJPEG := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{0x42}, 24)...)
	apicData := append([]byte{0x00, 'i', 'm', 'a', 'g', 'e', '/', 'j', 'p', 'e', 'g', 0x00, 0x03, 0x00}, fakeJPEG...)
	frameLen := len(apicData)
	apicFrame := []byte{
		'A', 'P', 'I', 'C',
		byte(frameLen >> 24), byte(frameLen >> 16), byte(frameLen >> 8), byte(frameLen),
		0x00, 0x00,
	}
	apicFrame = append(apicFrame, apicData...)
	tagLen := len(apicFrame)
	id3Header := []byte{
		'I', 'D', '3', 0x03, 0x00, 0x00,
		byte((tagLen >> 21) & 0x7F),
		byte((tagLen >> 14) & 0x7F),
		byte((tagLen >> 7) & 0x7F),
		byte(tagLen & 0x7F),
	}
	mp3Bytes := append(id3Header, apicFrame...)
	mp3Path := filepath.Join(albumDir1, "Miles Davis - So What.mp3")
	_ = os.WriteFile(mp3Path, mp3Bytes, 0644)

	// 2. Create a second album directory in storage 2 with a folder fallback cover.jpg
	albumDir2 := filepath.Join(activeStorages[1].Path, "Acoustic Sessions")
	_ = os.MkdirAll(albumDir2, 0755)
	_ = os.WriteFile(filepath.Join(albumDir2, "untagged_song.flac"), []byte("fake-audio-payload"), 0644)
	folderCoverBytes := append([]byte{0xFF, 0xD8, 0xFF, 0xE1}, bytes.Repeat([]byte{0x99}, 20)...)
	_ = os.WriteFile(filepath.Join(albumDir2, "cover.jpg"), folderCoverBytes, 0644)

	// 3. Verify GET /api/music scans both storages and parses artist/title/album
	reqMusic := httptest.NewRequest(http.MethodGet, "/api/music", nil)
	wMusic := httptest.NewRecorder()
	handleMusicList(wMusic, reqMusic)

	if wMusic.Result().StatusCode != http.StatusOK {
		t.Fatalf("GET /api/music failed with status %d", wMusic.Result().StatusCode)
	}
	var tracks []MusicItem
	if err := json.NewDecoder(wMusic.Result().Body).Decode(&tracks); err != nil {
		t.Fatalf("Failed to decode /api/music response: %v", err)
	}
	if len(tracks) != 2 {
		t.Fatalf("Expected 2 music tracks across storages, got %d", len(tracks))
	}

	foundMiles := false
	for _, tr := range tracks {
		if tr.Artist == "Miles Davis" && tr.Title == "So What" && tr.Album == "Jazz Classics" {
			foundMiles = true
		}
	}
	if !foundMiles {
		t.Errorf("Expected parsed artist 'Miles Davis', title 'So What', album 'Jazz Classics', got %+v", tracks)
	}

	// 4. Verify GET /api/music/cover extracts ID3v2 APIC JPEG
	reqCover1 := httptest.NewRequest(http.MethodGet, "/api/music/cover?storage=s1&path="+url.QueryEscape("/Jazz Classics/Miles Davis - So What.mp3"), nil)
	wCover1 := httptest.NewRecorder()
	handleMusicCover(wCover1, reqCover1)

	respCover1 := wCover1.Result()
	if respCover1.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK for ID3v2 cover, got %d", respCover1.StatusCode)
	}
	if respCover1.Header.Get("Content-Type") != "image/jpeg" {
		t.Errorf("Expected Content-Type image/jpeg, got %s", respCover1.Header.Get("Content-Type"))
	}
	cover1Body, _ := io.ReadAll(respCover1.Body)
	if !bytes.Equal(cover1Body, fakeJPEG) {
		t.Errorf("Extracted ID3v2 cover bytes mismatch")
	}

	// 5. Verify GET /api/music/cover falls back to folder cover.jpg
	reqCover2 := httptest.NewRequest(http.MethodGet, "/api/music/cover?storage=s2&path="+url.QueryEscape("/Acoustic Sessions/untagged_song.flac"), nil)
	wCover2 := httptest.NewRecorder()
	handleMusicCover(wCover2, reqCover2)

	respCover2 := wCover2.Result()
	if respCover2.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK for folder cover fallback, got %d", respCover2.StatusCode)
	}
	cover2Body, _ := io.ReadAll(respCover2.Body)
	if !bytes.Equal(cover2Body, folderCoverBytes) {
		t.Errorf("Folder cover fallback bytes mismatch")
	}
}

