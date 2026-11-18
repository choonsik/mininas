package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func buildSyntheticJPEGWithExif(dateStr, makeStr, modelStr string, orientation uint16, thumbJPEG []byte) []byte {
	var tiff bytes.Buffer
	// Little-endian TIFF header: "II", 0x002A, offset to IFD0 = 8
	tiff.Write([]byte{'I', 'I', 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00})

	// IFD0 has 4 entries: Make (0x010F), Model (0x0110), Orientation (0x0112), ExifIFDPointer (0x8769)
	numIFD0 := uint16(4)
	_ = binary.Write(&tiff, binary.LittleEndian, numIFD0)

	// IFD0 takes 2 + 4*12 + 4 = 54 bytes -> ends at offset 8 + 54 = 62
	makeBytes := append([]byte(makeStr), 0)
	modelBytes := append([]byte(modelStr), 0)
	makeOffset := uint32(62)
	modelOffset := makeOffset + uint32(len(makeBytes))
	exifIFDOffset := modelOffset + uint32(len(modelBytes))

	writeEntry := func(buf *bytes.Buffer, tag, typ uint16, count, valOrOffset uint32) {
		_ = binary.Write(buf, binary.LittleEndian, tag)
		_ = binary.Write(buf, binary.LittleEndian, typ)
		_ = binary.Write(buf, binary.LittleEndian, count)
		_ = binary.Write(buf, binary.LittleEndian, valOrOffset)
	}

	writeEntry(&tiff, 0x010F, 2, uint32(len(makeBytes)), makeOffset)
	writeEntry(&tiff, 0x0110, 2, uint32(len(modelBytes)), modelOffset)
	writeEntry(&tiff, 0x0112, 3, 1, uint32(orientation))
	writeEntry(&tiff, 0x8769, 4, 1, exifIFDOffset)
	_ = binary.Write(&tiff, binary.LittleEndian, uint32(0)) // next IFD = 0

	tiff.Write(makeBytes)
	tiff.Write(modelBytes)

	// Exif SubIFD at exifIFDOffset: 2 entries: DateTimeOriginal (0x9003), ISOSpeedRatings (0x8827)
	_ = binary.Write(&tiff, binary.LittleEndian, uint16(2))
	dateBytes := append([]byte(dateStr), 0)
	dateOffset := exifIFDOffset + 2 + 2*12 + 4
	writeEntry(&tiff, 0x9003, 2, uint32(len(dateBytes)), dateOffset)
	writeEntry(&tiff, 0x8827, 3, 1, 400) // ISO 400
	_ = binary.Write(&tiff, binary.LittleEndian, uint32(0))
	tiff.Write(dateBytes)

	if len(thumbJPEG) > 0 {
		tiff.Write(thumbJPEG)
	}

	app1Payload := append([]byte("Exif\x00\x00"), tiff.Bytes()...)
	app1Len := uint16(len(app1Payload) + 2)

	var jpeg bytes.Buffer
	jpeg.Write([]byte{0xFF, 0xD8}) // SOI
	jpeg.Write([]byte{0xFF, 0xE1}) // APP1
	_ = binary.Write(&jpeg, binary.BigEndian, app1Len)
	jpeg.Write(app1Payload)

	// SOF0 marker (0xFF 0xC0) with width=4032, height=3024
	sof0 := []byte{0x08, 0x0B, 0xD0, 0x0F, 0xC0, 0x01, 0x01, 0x11, 0x00}
	jpeg.Write([]byte{0xFF, 0xC0})
	_ = binary.Write(&jpeg, binary.BigEndian, uint16(len(sof0)+2))
	jpeg.Write(sof0)

	jpeg.Write([]byte{0xFF, 0xD9}) // EOI
	return jpeg.Bytes()
}

func buildSyntheticMP4WithMoovAtEnd(creationTime time.Time, durationSec uint32, width, height uint16) []byte {
	const macEpochOffset = 2082844800
	var out bytes.Buffer

	// 1. ftyp box (16 bytes)
	_ = binary.Write(&out, binary.BigEndian, uint32(16))
	out.WriteString("ftypmp42")
	_ = binary.Write(&out, binary.BigEndian, uint32(0))

	// 2. mdat box (2048 bytes of dummy video payload BEFORE moov)
	mdatPayload := bytes.Repeat([]byte{0xAA}, 2040)
	_ = binary.Write(&out, binary.BigEndian, uint32(8+len(mdatPayload)))
	out.WriteString("mdat")
	out.Write(mdatPayload)

	// 3. moov box at the end of the file
	var moovBody bytes.Buffer

	// 3a. mvhd box (version 0, 108 bytes total)
	mvhdBody := make([]byte, 100)
	mvhdBody[0] = 0 // version 0
	macSec := uint32(creationTime.Unix() + macEpochOffset)
	binary.BigEndian.PutUint32(mvhdBody[4:8], macSec)
	binary.BigEndian.PutUint32(mvhdBody[12:16], 1000)                // timescale = 1000
	binary.BigEndian.PutUint32(mvhdBody[16:20], durationSec*1000)    // duration
	_ = binary.Write(&moovBody, binary.BigEndian, uint32(8+len(mvhdBody)))
	moovBody.WriteString("mvhd")
	moovBody.Write(mvhdBody)

	// 3b. trak -> tkhd box
	tkhdBody := make([]byte, 84)
	tkhdBody[0] = 0 // version 0
	binary.BigEndian.PutUint32(tkhdBody[76:80], uint32(width)<<16)
	binary.BigEndian.PutUint32(tkhdBody[80:84], uint32(height)<<16)

	var trakBody bytes.Buffer
	_ = binary.Write(&trakBody, binary.BigEndian, uint32(8+len(tkhdBody)))
	trakBody.WriteString("tkhd")
	trakBody.Write(tkhdBody)

	_ = binary.Write(&moovBody, binary.BigEndian, uint32(8+trakBody.Len()))
	moovBody.WriteString("trak")
	moovBody.Write(trakBody.Bytes())

	_ = binary.Write(&out, binary.BigEndian, uint32(8+moovBody.Len()))
	out.WriteString("moov")
	out.Write(moovBody.Bytes())

	return out.Bytes()
}

func TestMediaMetaExtractionAndPhotoThumb(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "mininas_meta_test_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	oldStorages := activeStorages
	defer func() { activeStorages = oldStorages }()

	activeStorages = []StorageEntry{
		{ID: "photos", Name: "사진 보관함", Path: tempDir},
	}

	// 1. Create JPEG with EXIF DateTimeOriginal (2021:05:15 14:30:00), Orientation=6 (90° CW), and embedded thumbnail
	albumDir := filepath.Join(tempDir, "제주도 여행")
	_ = os.MkdirAll(albumDir, 0755)
	embeddedThumb := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{0x77}, 80)...)
	embeddedThumb = append(embeddedThumb, 0xFF, 0xD9)

	jpegBytes := buildSyntheticJPEGWithExif("2021:05:15 14:30:00", "Apple", "iPhone 15 Pro", 6, embeddedThumb)
	jpegPath := filepath.Join(albumDir, "IMG_0191.jpg")
	_ = os.WriteFile(jpegPath, jpegBytes, 0644)

	// 1b. Create Live Photo companion .mov with no mvhd creation date (should inherit IMG_0191.jpg's 2021-05-15 date)
	liveMovBytes := buildSyntheticMP4WithMoovAtEnd(time.Unix(0, 0), 3, 1440, 1920)
	_ = os.WriteFile(filepath.Join(albumDir, "IMG_0191.mov"), liveMovBytes, 0644)

	// 2. Create MP4 with moov at the end (2022-10-01 09:00:00 Local)
	mp4Date := time.Date(2022, 10, 1, 9, 0, 0, 0, time.Local)
	mp4Bytes := buildSyntheticMP4WithMoovAtEnd(mp4Date, 45, 1920, 1080)
	mp4Path := filepath.Join(albumDir, "sunset.mp4")
	_ = os.WriteFile(mp4Path, mp4Bytes, 0644)

	// 3. Create photo without EXIF in a date-named folder (/2014/03/old_memory.png)
	oldDir := filepath.Join(tempDir, "2014", "03")
	_ = os.MkdirAll(oldDir, 0755)
	_ = os.WriteFile(filepath.Join(oldDir, "old_memory.png"), []byte("fake-png-bytes"), 0644)

	// A. Verify /api/media/meta on JPEG (Orientation=6 swaps 4032x3024 -> 3024x4032)
	reqMeta := httptest.NewRequest(http.MethodGet, "/api/media/meta?storage=photos&path="+url.QueryEscape("/제주도 여행/IMG_0191.jpg"), nil)
	rrMeta := httptest.NewRecorder()
	handleMediaMeta(rrMeta, reqMeta)
	if rrMeta.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK from /api/media/meta, got %d", rrMeta.Code)
	}
	var meta MediaMeta
	_ = json.NewDecoder(rrMeta.Body).Decode(&meta)
	if meta.DateSource != "exif" || meta.TakenAt.Year() != 2021 || meta.TakenAt.Month() != 5 || meta.TakenAt.Day() != 15 {
		t.Errorf("Expected EXIF date 2021-05-15, got source=%s date=%v", meta.DateSource, meta.TakenAt)
	}
	if meta.CameraModel != "iPhone 15 Pro" || meta.Width != 3024 || meta.Height != 4032 || meta.Orientation != 6 || meta.ISO != 400 {
		t.Errorf("Unexpected JPEG EXIF fields (expected 3024x4032 after orientation=6 swap): %+v", meta)
	}

	// B. Verify /api/media/meta on MP4 (with moov after mdat)
	reqMP4Meta := httptest.NewRequest(http.MethodGet, "/api/media/meta?storage=photos&path="+url.QueryEscape("/제주도 여행/sunset.mp4"), nil)
	rrMP4Meta := httptest.NewRecorder()
	handleMediaMeta(rrMP4Meta, reqMP4Meta)
	var mp4Meta MediaMeta
	_ = json.NewDecoder(rrMP4Meta.Body).Decode(&mp4Meta)
	if mp4Meta.DateSource != "mp4" || mp4Meta.TakenAt.Year() != 2022 || mp4Meta.Width != 1920 || mp4Meta.Height != 1080 || mp4Meta.DurationSec != 45 {
		t.Errorf("Unexpected MP4 meta: %+v", mp4Meta)
	}

	// C. Verify /api/photos returns Album names, inherits Live Photo companion date, and sorts by TakenAt descending
	reqList := httptest.NewRequest(http.MethodGet, "/api/photos?dedicated=true", nil)
	rrList := httptest.NewRecorder()
	handlePhotosList(rrList, reqList)
	var items []PhotoItem
	_ = json.NewDecoder(rrList.Body).Decode(&items)
	if len(items) != 4 {
		t.Fatalf("Expected 4 photo items, got %d", len(items))
	}
	if items[0].Name != "sunset.mp4" || items[3].Name != "old_memory.png" {
		t.Errorf("Expected sunset.mp4 first and old_memory.png last, got %+v", items)
	}
	for _, it := range items {
		if it.Name == "IMG_0191.mov" && it.TakenAt.Year() != 2021 {
			t.Errorf("Expected Live Photo IMG_0191.mov to inherit 2021 date from IMG_0191.jpg, got %v", it.TakenAt)
		}
	}

	// D. Verify /api/photos/thumb extracts embedded EXIF thumbnail, injects Orientation=6 APP1 header, and caches it
	reqThumb := httptest.NewRequest(http.MethodGet, "/api/photos/thumb?storage=photos&path="+url.QueryEscape("/제주도 여행/IMG_0191.jpg"), nil)
	rrThumb := httptest.NewRecorder()
	handlePhotoThumb(rrThumb, reqThumb)
	if rrThumb.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK from /api/photos/thumb, got %d", rrThumb.Code)
	}
	var thumbMeta MediaMeta
	if !bytes.Contains(rrThumb.Body.Bytes(), []byte("Exif\x00\x00")) {
		t.Errorf("Expected injected Exif orientation header in extracted thumbnail")
	}
	_ = thumbMeta

	// E. Verify deleting IMG_0191.jpg and re-listing prunes orphaned thumbnail and index entry
	thumbsDir := filepath.Join(tempDir, ".mininas_cache", "thumbs")
	thumbFilesBefore, _ := os.ReadDir(thumbsDir)
	if len(thumbFilesBefore) != 1 {
		t.Fatalf("Expected 1 cached thumbnail file before deletion, got %d", len(thumbFilesBefore))
	}
	_ = os.Remove(jpegPath)

	reqListAfter := httptest.NewRequest(http.MethodGet, "/api/photos?dedicated=true", nil)
	rrListAfter := httptest.NewRecorder()
	handlePhotosList(rrListAfter, reqListAfter)
	var itemsAfter []PhotoItem
	_ = json.NewDecoder(rrListAfter.Body).Decode(&itemsAfter)
	if len(itemsAfter) != 3 {
		t.Fatalf("Expected 3 items after deleting IMG_0191.jpg, got %d", len(itemsAfter))
	}

	thumbFilesAfter, _ := os.ReadDir(thumbsDir)
	if len(thumbFilesAfter) != 0 {
		t.Errorf("Expected orphaned thumbnail to be garbage-collected, but %d remained", len(thumbFilesAfter))
	}
}
