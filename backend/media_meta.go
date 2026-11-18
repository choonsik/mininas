package main

import (
	"bytes"
	"crypto/md5"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type MediaMeta struct {
	TakenAt      time.Time `json:"takenAt"`
	DateSource   string    `json:"dateSource"` // "exif", "mp4", "filename", "mtime"
	Orientation  int       `json:"orientation,omitempty"`
	Width        int       `json:"width,omitempty"`
	Height       int       `json:"height,omitempty"`
	CameraMake   string    `json:"cameraMake,omitempty"`
	CameraModel  string    `json:"cameraModel,omitempty"`
	FNumber      string    `json:"fNumber,omitempty"`
	ExposureTime string    `json:"exposureTime,omitempty"`
	ISO          int       `json:"iso,omitempty"`
	DurationSec  float64   `json:"durationSec,omitempty"`
	HasGPS       bool      `json:"hasGps,omitempty"`
}

type cachedMediaMetaEntry struct {
	Size        int64     `json:"size"`
	ModTimeNano int64     `json:"modTimeNano"`
	Meta        MediaMeta `json:"meta"`
}

type storageMetaIndex struct {
	mu      sync.RWMutex
	loaded  bool
	dirty   bool
	entries map[string]cachedMediaMetaEntry
}

const mediaIndexFileName = "media_index_v2.json"

var (
	metaIndicesMu sync.Mutex
	metaIndices   = make(map[string]*storageMetaIndex)
)

func getStorageMetaIndex(storage StorageEntry) *storageMetaIndex {
	metaIndicesMu.Lock()
	idx, ok := metaIndices[storage.ID]
	if !ok {
		idx = &storageMetaIndex{
			entries: make(map[string]cachedMediaMetaEntry),
		}
		metaIndices[storage.ID] = idx
	}
	metaIndicesMu.Unlock()

	idx.mu.Lock()
	if !idx.loaded {
		idx.loaded = true
		indexPath := filepath.Join(storage.Path, ".mininas_cache", mediaIndexFileName)
		if data, err := os.ReadFile(indexPath); err == nil {
			var loaded map[string]cachedMediaMetaEntry
			if err := json.Unmarshal(data, &loaded); err == nil && loaded != nil {
				idx.entries = loaded
			}
		}
	}
	idx.mu.Unlock()
	return idx
}

func computeThumbFileName(relPath string, size int64, modTimeNano int64) string {
	cleanRel := "/" + strings.TrimPrefix(filepath.ToSlash(filepath.Clean("/"+relPath)), "/")
	hashInput := fmt.Sprintf("v2:%s:%d:%d", cleanRel, size, modTimeNano)
	sum := md5.Sum([]byte(hashInput))
	return hex.EncodeToString(sum[:]) + ".jpg"
}

func flushStorageMetaIndex(storage StorageEntry, idx *storageMetaIndex) {
	idx.mu.Lock()
	if !idx.dirty {
		idx.mu.Unlock()
		return
	}
	idx.dirty = false
	snapshot := make(map[string]cachedMediaMetaEntry, len(idx.entries))
	for k, v := range idx.entries {
		snapshot[k] = v
	}
	idx.mu.Unlock()

	cacheDir := filepath.Join(storage.Path, ".mininas_cache")
	_ = os.MkdirAll(cacheDir, 0755)
	indexPath := filepath.Join(cacheDir, mediaIndexFileName)
	if data, err := json.Marshal(snapshot); err == nil {
		_ = os.WriteFile(indexPath, data, 0644)
	}
}

// pruneAndFlushStorageMetaIndex removes deleted files from media_index_v2.json and cleans up orphaned thumbnail files
func pruneAndFlushStorageMetaIndex(storage StorageEntry, activeRelPaths map[string]bool) {
	idx := getStorageMetaIndex(storage)
	validThumbs := make(map[string]bool, len(activeRelPaths))

	idx.mu.Lock()
	for relPath, entry := range idx.entries {
		if !activeRelPaths[relPath] {
			delete(idx.entries, relPath)
			idx.dirty = true
		} else {
			validThumbs[computeThumbFileName(relPath, entry.Size, entry.ModTimeNano)] = true
		}
	}
	idx.mu.Unlock()

	flushStorageMetaIndex(storage, idx)
	_ = os.Remove(filepath.Join(storage.Path, ".mininas_cache", "media_index.json"))

	thumbsDir := filepath.Join(storage.Path, ".mininas_cache", "thumbs")
	if entries, err := os.ReadDir(thumbsDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			if !validThumbs[e.Name()] {
				_ = os.Remove(filepath.Join(thumbsDir, e.Name()))
			}
		}
	}
}

func getOrExtractMediaMeta(storage StorageEntry, relPath, fullPath string, info os.FileInfo) MediaMeta {
	idx := getStorageMetaIndex(storage)
	modNano := info.ModTime().UnixNano()
	size := info.Size()

	idx.mu.RLock()
	if entry, ok := idx.entries[relPath]; ok && entry.Size == size && entry.ModTimeNano == modNano && !entry.Meta.TakenAt.IsZero() {
		idx.mu.RUnlock()
		return entry.Meta
	}
	idx.mu.RUnlock()

	meta := extractMediaMetaFromFile(fullPath, relPath, info)

	idx.mu.Lock()
	idx.entries[relPath] = cachedMediaMetaEntry{
		Size:        size,
		ModTimeNano: modNano,
		Meta:        meta,
	}
	idx.dirty = true
	idx.mu.Unlock()

	return meta
}

func extractMediaMetaFromFile(fullPath, relPath string, info os.FileInfo) MediaMeta {
	ext := strings.ToLower(filepath.Ext(fullPath))
	meta := MediaMeta{
		TakenAt:    info.ModTime(),
		DateSource: "mtime",
	}

	switch ext {
	case ".jpg", ".jpeg":
		if exifMeta, ok := parseJPEGExifAndDims(fullPath); ok {
			if !exifMeta.TakenAt.IsZero() {
				meta.TakenAt = exifMeta.TakenAt
				meta.DateSource = "exif"
			}
			meta.Orientation = exifMeta.Orientation
			if exifMeta.Width > 0 && exifMeta.Height > 0 {
				meta.Width = exifMeta.Width
				meta.Height = exifMeta.Height
			}
			meta.CameraMake = exifMeta.CameraMake
			meta.CameraModel = exifMeta.CameraModel
			meta.FNumber = exifMeta.FNumber
			meta.ExposureTime = exifMeta.ExposureTime
			meta.ISO = exifMeta.ISO
			meta.HasGPS = exifMeta.HasGPS
		}
	case ".heic", ".heif":
		if exifMeta, ok := parseHEICExif(fullPath); ok {
			if !exifMeta.TakenAt.IsZero() {
				meta.TakenAt = exifMeta.TakenAt
				meta.DateSource = "exif"
			}
			meta.Orientation = exifMeta.Orientation
			if exifMeta.Width > 0 && exifMeta.Height > 0 {
				meta.Width = exifMeta.Width
				meta.Height = exifMeta.Height
			}
			meta.CameraMake = exifMeta.CameraMake
			meta.CameraModel = exifMeta.CameraModel
			meta.FNumber = exifMeta.FNumber
			meta.ExposureTime = exifMeta.ExposureTime
			meta.ISO = exifMeta.ISO
			meta.HasGPS = exifMeta.HasGPS
		}
	case ".mp4", ".mov", ".m4v":
		if mp4Meta, ok := parseMP4HeaderMeta(fullPath); ok {
			if !mp4Meta.TakenAt.IsZero() {
				meta.TakenAt = mp4Meta.TakenAt
				meta.DateSource = "mp4"
			}
			if mp4Meta.Width > 0 && mp4Meta.Height > 0 {
				meta.Width = mp4Meta.Width
				meta.Height = mp4Meta.Height
			}
			if mp4Meta.DurationSec > 0 {
				meta.DurationSec = mp4Meta.DurationSec
			}
		}
	}

	// Swap width and height if EXIF Orientation indicates 90° or 270° rotation (5, 6, 7, 8)
	if meta.Orientation >= 5 && meta.Orientation <= 8 && meta.Width > 0 && meta.Height > 0 {
		meta.Width, meta.Height = meta.Height, meta.Width
	}

	if meta.DateSource == "mtime" {
		if parsedDate, ok := extractDateFromPathOrName(relPath, filepath.Base(fullPath)); ok {
			meta.TakenAt = parsedDate
			meta.DateSource = "filename"
		}
	}

	return meta
}

// parseHEICExif scans the first 256KB of a HEIC/HEIF file for an embedded Exif\x00\x00 TIFF block
func parseHEICExif(fullPath string) (MediaMeta, bool) {
	var meta MediaMeta
	f, err := os.Open(fullPath)
	if err != nil {
		return meta, false
	}
	defer f.Close()

	buf := make([]byte, 262144)
	n, err := f.Read(buf)
	if err != nil && err != io.EOF {
		return meta, false
	}
	data := buf[:n]

	idx := bytes.Index(data, []byte("Exif\x00\x00"))
	if idx >= 0 && idx+14 <= len(data) {
		if parseTIFFExif(data[idx+6:], &meta) {
			return meta, true
		}
	}
	return meta, false
}

// parseJPEGExifAndDims reads up to 128KB of a JPEG file to extract EXIF tags and SOF dimensions
func parseJPEGExifAndDims(fullPath string) (MediaMeta, bool) {
	var meta MediaMeta
	f, err := os.Open(fullPath)
	if err != nil {
		return meta, false
	}
	defer f.Close()

	buf := make([]byte, 131072)
	n, err := f.Read(buf)
	if err != nil && err != io.EOF {
		return meta, false
	}
	data := buf[:n]
	if len(data) < 4 || data[0] != 0xFF || data[1] != 0xD8 {
		return meta, false
	}

	offset := 2
	foundAny := false
	for offset+4 <= len(data) {
		if data[offset] != 0xFF {
			offset++
			continue
		}
		marker := data[offset+1]
		if marker == 0xFF {
			offset++
			continue
		}
		if marker == 0xD9 || marker == 0xDA {
			break // EOI or SOS
		}
		if offset+4 > len(data) {
			break
		}
		segLen := int(binary.BigEndian.Uint16(data[offset+2 : offset+4]))
		if segLen < 2 || offset+2+segLen > len(data) {
			break
		}
		segData := data[offset+4 : offset+2+segLen]

		// APP1 Exif marker
		if marker == 0xE1 && len(segData) >= 6 && string(segData[:6]) == "Exif\x00\x00" {
			if parseTIFFExif(segData[6:], &meta) {
				foundAny = true
			}
		}

		// SOF0 / SOF1 / SOF2 markers for image dimensions
		if (marker == 0xC0 || marker == 0xC1 || marker == 0xC2) && len(segData) >= 5 {
			h := int(binary.BigEndian.Uint16(segData[1:3]))
			w := int(binary.BigEndian.Uint16(segData[3:5]))
			if w > 0 && h > 0 {
				meta.Width = w
				meta.Height = h
				foundAny = true
			}
		}

		offset += 2 + segLen
	}

	return meta, foundAny
}

func parseTIFFExif(tiff []byte, meta *MediaMeta) bool {
	if len(tiff) < 8 {
		return false
	}
	var bo binary.ByteOrder
	switch string(tiff[:2]) {
	case "II":
		bo = binary.LittleEndian
	case "MM":
		bo = binary.BigEndian
	default:
		return false
	}

	if bo.Uint16(tiff[2:4]) != 0x002A {
		return false
	}

	ifd0Offset := int(bo.Uint32(tiff[4:8]))
	if ifd0Offset < 8 || ifd0Offset+2 > len(tiff) {
		return false
	}

	var exifIFDOffset int
	var gpsIFDOffset int
	var fallbackDateStr string
	var primaryDateStr string

	readStr := func(valOffset, count int) string {
		if count <= 0 || valOffset < 0 || valOffset+count > len(tiff) {
			return ""
		}
		s := string(tiff[valOffset : valOffset+count])
		s = strings.TrimRight(s, "\x00 ")
		return strings.TrimSpace(s)
	}

	readRational := func(valOffset int) (uint32, uint32, bool) {
		if valOffset < 0 || valOffset+8 > len(tiff) {
			return 0, 0, false
		}
		num := bo.Uint32(tiff[valOffset : valOffset+4])
		den := bo.Uint32(tiff[valOffset+4 : valOffset+8])
		if den == 0 {
			return 0, 0, false
		}
		return num, den, true
	}

	// Parse IFD0
	numEntries := int(bo.Uint16(tiff[ifd0Offset : ifd0Offset+2]))
	base := ifd0Offset + 2
	for i := 0; i < numEntries; i++ {
		ent := base + i*12
		if ent+12 > len(tiff) {
			break
		}
		tag := bo.Uint16(tiff[ent : ent+2])
		typ := bo.Uint16(tiff[ent+2 : ent+4])
		count := int(bo.Uint32(tiff[ent+4 : ent+8]))
		valBytes := tiff[ent+8 : ent+12]

		switch tag {
		case 0x010F: // Make
			if typ == 2 {
				off := ent + 8
				if count > 4 {
					off = int(bo.Uint32(valBytes))
				}
				meta.CameraMake = readStr(off, count)
			}
		case 0x0110: // Model
			if typ == 2 {
				off := ent + 8
				if count > 4 {
					off = int(bo.Uint32(valBytes))
				}
				meta.CameraModel = readStr(off, count)
			}
		case 0x0112: // Orientation
			if typ == 3 {
				meta.Orientation = int(bo.Uint16(valBytes[:2]))
			} else if typ == 4 {
				meta.Orientation = int(bo.Uint32(valBytes))
			}
		case 0x0132: // DateTime
			if typ == 2 && count >= 19 {
				off := int(bo.Uint32(valBytes))
				fallbackDateStr = readStr(off, count)
			}
		case 0x8769: // ExifIFDPointer
			exifIFDOffset = int(bo.Uint32(valBytes))
		case 0x8825: // GPSInfoIFDPointer
			gpsIFDOffset = int(bo.Uint32(valBytes))
		}
	}

	if gpsIFDOffset > 0 && gpsIFDOffset+2 <= len(tiff) {
		gpsCount := int(bo.Uint16(tiff[gpsIFDOffset : gpsIFDOffset+2]))
		if gpsCount > 0 {
			meta.HasGPS = true
		}
	}

	// Parse Exif SubIFD
	if exifIFDOffset > 0 && exifIFDOffset+2 <= len(tiff) {
		subEntries := int(bo.Uint16(tiff[exifIFDOffset : exifIFDOffset+2]))
		subBase := exifIFDOffset + 2
		for i := 0; i < subEntries; i++ {
			ent := subBase + i*12
			if ent+12 > len(tiff) {
				break
			}
			tag := bo.Uint16(tiff[ent : ent+2])
			typ := bo.Uint16(tiff[ent+2 : ent+4])
			count := int(bo.Uint32(tiff[ent+4 : ent+8]))
			valBytes := tiff[ent+8 : ent+12]

			switch tag {
			case 0x9003: // DateTimeOriginal
				if typ == 2 && count >= 19 {
					off := int(bo.Uint32(valBytes))
					if s := readStr(off, count); s != "" {
						primaryDateStr = s
					}
				}
			case 0x9004: // DateTimeDigitized
				if primaryDateStr == "" && typ == 2 && count >= 19 {
					off := int(bo.Uint32(valBytes))
					primaryDateStr = readStr(off, count)
				}
			case 0x829A: // ExposureTime
				if typ == 5 {
					off := int(bo.Uint32(valBytes))
					if num, den, ok := readRational(off); ok && num > 0 {
						if num < den {
							ratio := int(math.Round(float64(den) / float64(num)))
							meta.ExposureTime = fmt.Sprintf("1/%ds", ratio)
						} else {
							meta.ExposureTime = fmt.Sprintf("%.1fs", float64(num)/float64(den))
						}
					}
				}
			case 0x829D: // FNumber
				if typ == 5 {
					off := int(bo.Uint32(valBytes))
					if num, den, ok := readRational(off); ok && num > 0 {
						fval := float64(num) / float64(den)
						meta.FNumber = fmt.Sprintf("f/%.1f", fval)
					}
				}
			case 0x8827: // ISOSpeedRatings
				if typ == 3 {
					meta.ISO = int(bo.Uint16(valBytes[:2]))
				} else if typ == 4 {
					meta.ISO = int(bo.Uint32(valBytes))
				}
			case 0xA002: // PixelXDimension
				if meta.Width == 0 {
					if typ == 3 {
						meta.Width = int(bo.Uint16(valBytes[:2]))
					} else if typ == 4 {
						meta.Width = int(bo.Uint32(valBytes))
					}
				}
			case 0xA003: // PixelYDimension
				if meta.Height == 0 {
					if typ == 3 {
						meta.Height = int(bo.Uint16(valBytes[:2]))
					} else if typ == 4 {
						meta.Height = int(bo.Uint32(valBytes))
					}
				}
			}
		}
	}

	dateStr := primaryDateStr
	if dateStr == "" {
		dateStr = fallbackDateStr
	}
	if dateStr != "" {
		if t, ok := parseExifDateTimeString(dateStr); ok {
			meta.TakenAt = t
		}
	}

	return !meta.TakenAt.IsZero() || meta.CameraModel != "" || meta.Width > 0 || meta.Orientation > 0
}

func parseExifDateTimeString(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if len(s) < 19 {
		return time.Time{}, false
	}
	layouts := []string{
		"2006:01:02 15:04:05",
		"2006-01-02 15:04:05",
		"2006/01/02 15:04:05",
	}
	clean := s[:19]
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, clean, time.Local); err == nil {
			if t.Year() >= 1990 && t.Year() <= 2099 {
				return t, true
			}
		}
	}
	return time.Time{}, false
}

// injectExifOrientation prepends a minimal 36-byte APP1 Exif header carrying the parent Orientation tag
// right after the JPEG SOI (0xFF 0xD8) so browsers render embedded thumbnails with the exact right orientation.
func injectExifOrientation(thumb []byte, orientation int) []byte {
	if orientation <= 1 || orientation > 8 || len(thumb) < 4 || thumb[0] != 0xFF || thumb[1] != 0xD8 {
		return thumb
	}
	app1 := []byte{
		0xFF, 0xE1, // APP1 marker
		0x00, 0x22, // Length = 34 bytes (including these 2 length bytes)
		'E', 'x', 'i', 'f', 0x00, 0x00, // Exif header (6 bytes)
		'I', 'I', 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, // Little-endian TIFF header (8 bytes)
		0x01, 0x00, // 1 IFD0 entry (2 bytes)
		0x12, 0x01, // Tag 0x0112 = Orientation (2 bytes)
		0x03, 0x00, // Type 3 = SHORT (2 bytes)
		0x01, 0x00, 0x00, 0x00, // Count = 1 (4 bytes)
		byte(orientation), 0x00, 0x00, 0x00, // Value = orientation (4 bytes)
		0x00, 0x00, 0x00, 0x00, // Next IFD offset = 0 (4 bytes)
	}
	out := make([]byte, 0, len(thumb)+len(app1))
	out = append(out, 0xFF, 0xD8)
	out = append(out, app1...)
	out = append(out, thumb[2:]...)
	return out
}

// extractExifThumbnail extracts an embedded JPEG thumbnail from a JPEG's APP1 EXIF segment
// and preserves the parent EXIF Orientation tag.
func extractExifThumbnail(fullPath string) ([]byte, bool) {
	f, err := os.Open(fullPath)
	if err != nil {
		return nil, false
	}
	defer f.Close()

	buf := make([]byte, 131072)
	n, err := f.Read(buf)
	if err != nil && err != io.EOF {
		return nil, false
	}
	data := buf[:n]
	if len(data) < 4 || data[0] != 0xFF || data[1] != 0xD8 {
		return nil, false
	}

	offset := 2
	for offset+4 <= len(data) {
		if data[offset] != 0xFF {
			offset++
			continue
		}
		marker := data[offset+1]
		if marker == 0xD9 || marker == 0xDA {
			break
		}
		segLen := int(binary.BigEndian.Uint16(data[offset+2 : offset+4]))
		if segLen < 2 || offset+2+segLen > len(data) {
			break
		}
		segData := data[offset+4 : offset+2+segLen]
		if marker == 0xE1 && len(segData) >= 14 && string(segData[:6]) == "Exif\x00\x00" {
			tiff := segData[6:]
			var parentMeta MediaMeta
			_ = parseTIFFExif(tiff, &parentMeta)

			// Look for embedded JPEG SOI (FF D8 FF) and EOI (FF D9) inside TIFF IFD1 area
			soi := bytes.Index(tiff, []byte{0xFF, 0xD8, 0xFF})
			if soi > 0 {
				eoi := bytes.LastIndex(tiff[soi:], []byte{0xFF, 0xD9})
				if eoi > 64 {
					thumb := tiff[soi : soi+eoi+2]
					thumb = injectExifOrientation(thumb, parentMeta.Orientation)
					return thumb, true
				}
			}
		}
		offset += 2 + segLen
	}
	return nil, false
}

// parseMP4HeaderMeta uses Seek to jump across top-level MP4/MOV boxes without reading mdat
func parseMP4HeaderMeta(fullPath string) (MediaMeta, bool) {
	var meta MediaMeta
	f, err := os.Open(fullPath)
	if err != nil {
		return meta, false
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil || info.Size() < 16 {
		return meta, false
	}
	fileSize := info.Size()

	var pos int64 = 0
	header := make([]byte, 16)
	for pos+8 <= fileSize {
		if _, err := f.Seek(pos, io.SeekStart); err != nil {
			break
		}
		n, err := f.Read(header)
		if err != nil || n < 8 {
			break
		}
		boxSize := int64(binary.BigEndian.Uint32(header[0:4]))
		boxType := string(header[4:8])
		headerLen := int64(8)

		if boxSize == 1 {
			if n < 16 {
				break
			}
			boxSize = int64(binary.BigEndian.Uint64(header[8:16]))
			headerLen = 16
		} else if boxSize == 0 {
			boxSize = fileSize - pos
		}

		if boxSize < headerLen || pos+boxSize > fileSize {
			break
		}

		if boxType == "moov" {
			moovSize := boxSize - headerLen
			if moovSize > 16*1024*1024 {
				moovSize = 16 * 1024 * 1024 // cap read at 16MB
			}
			if _, err := f.Seek(pos+headerLen, io.SeekStart); err == nil {
				moovBuf := make([]byte, moovSize)
				if rn, err := io.ReadFull(f, moovBuf); err == nil || rn > 0 {
					parseMoovBox(moovBuf[:rn], &meta)
				}
			}
			break
		}

		pos += boxSize
	}

	return meta, !meta.TakenAt.IsZero() || meta.DurationSec > 0 || meta.Width > 0
}

var reISO8601InMoov = regexp.MustCompile(`(19\d{2}|20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[T\s]([01]\d|2[0-3]):([0-5]\d):([0-5]\d)`)

func parseMoovBox(moov []byte, meta *MediaMeta) {
	const macEpochOffset = 2082844800 // seconds between 1904-01-01 and 1970-01-01
	offset := 0
	for offset+8 <= len(moov) {
		sz := int(binary.BigEndian.Uint32(moov[offset : offset+4]))
		typ := string(moov[offset+4 : offset+8])
		if sz < 8 || offset+sz > len(moov) {
			break
		}
		body := moov[offset+8 : offset+sz]

		if typ == "mvhd" && len(body) >= 20 {
			version := body[0]
			var creationSec uint64
			var timescale uint32
			var duration uint64
			if version == 0 && len(body) >= 20 {
				creationSec = uint64(binary.BigEndian.Uint32(body[4:8]))
				timescale = binary.BigEndian.Uint32(body[12:16])
				duration = uint64(binary.BigEndian.Uint32(body[16:20]))
			} else if version == 1 && len(body) >= 32 {
				creationSec = binary.BigEndian.Uint64(body[4:12])
				timescale = binary.BigEndian.Uint32(body[20:24])
				duration = binary.BigEndian.Uint64(body[24:32])
			}
			if creationSec > macEpochOffset {
				unixSec := int64(creationSec - macEpochOffset)
				t := time.Unix(unixSec, 0).Local()
				if t.Year() >= 1990 && t.Year() <= 2099 {
					meta.TakenAt = t
				}
			}
			if timescale > 0 && duration > 0 {
				meta.DurationSec = math.Round((float64(duration)/float64(timescale))*10) / 10
			}
		} else if typ == "trak" {
			parseTrakBox(body, meta)
		}

		offset += sz
	}

	// Fallback: QuickTime .MOV files often store com.apple.quicktime.creationdate in meta/udta even when mvhd is 0
	if meta.TakenAt.IsZero() {
		if m := reISO8601InMoov.FindSubmatch(moov); len(m) >= 7 {
			y, _ := strconv.Atoi(string(m[1]))
			mo, _ := strconv.Atoi(string(m[2]))
			d, _ := strconv.Atoi(string(m[3]))
			hr, _ := strconv.Atoi(string(m[4]))
			min, _ := strconv.Atoi(string(m[5]))
			sec, _ := strconv.Atoi(string(m[6]))
			if y >= 1990 && y <= 2099 {
				meta.TakenAt = time.Date(y, time.Month(mo), d, hr, min, sec, 0, time.Local)
			}
		}
	}
}

func parseTrakBox(trak []byte, meta *MediaMeta) {
	offset := 0
	for offset+8 <= len(trak) {
		sz := int(binary.BigEndian.Uint32(trak[offset : offset+4]))
		typ := string(trak[offset+4 : offset+8])
		if sz < 8 || offset+sz > len(trak) {
			break
		}
		body := trak[offset+8 : offset+sz]
		if typ == "tkhd" && len(body) >= 84 {
			version := body[0]
			wOffset := 76
			if version == 1 {
				wOffset = 88
			}
			if len(body) >= wOffset+8 {
				w := int(binary.BigEndian.Uint32(body[wOffset:wOffset+4]) >> 16)
				h := int(binary.BigEndian.Uint32(body[wOffset+4:wOffset+8]) >> 16)
				if w > 0 && h > 0 && meta.Width == 0 {
					meta.Width = w
					meta.Height = h
				}
			}
		}
		offset += sz
	}
}

var (
	reFilenameDateTime = regexp.MustCompile(`(?:^|[^\d])(19\d{2}|20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?:[-_.\sT]+([01]\d|2[0-3])[-_.]?([0-5]\d)[-_.]?([0-5]\d))?`)
	rePathYearMonth    = regexp.MustCompile(`/(19\d{2}|20\d{2})/(0[1-9]|1[0-2])(?:/(0[1-9]|[12]\d|3[01]))?/`)
	reImgPrefix        = regexp.MustCompile(`(?i)^(img_\d{3,6})`)
)

func extractDateFromPathOrName(relPath, fileName string) (time.Time, bool) {
	// 1. Check filename pattern first (e.g., IMG_20230514_142030.jpg or 2023-05-14.jpg)
	if m := reFilenameDateTime.FindStringSubmatch(fileName); len(m) >= 4 {
		y, _ := strconv.Atoi(m[1])
		mo, _ := strconv.Atoi(m[2])
		d, _ := strconv.Atoi(m[3])
		hr, min, sec := 12, 0, 0
		if len(m) >= 7 && m[4] != "" {
			hr, _ = strconv.Atoi(m[4])
			min, _ = strconv.Atoi(m[5])
			sec, _ = strconv.Atoi(m[6])
		}
		if y >= 1990 && y <= 2099 {
			return time.Date(y, time.Month(mo), d, hr, min, sec, 0, time.Local), true
		}
	}

	// 2. Check folder path pattern (e.g., /2014/03/photo.jpg)
	slashPath := filepath.ToSlash(relPath)
	if m := rePathYearMonth.FindStringSubmatch(slashPath); len(m) >= 3 {
		y, _ := strconv.Atoi(m[1])
		mo, _ := strconv.Atoi(m[2])
		d := 1
		if len(m) >= 4 && m[3] != "" {
			d, _ = strconv.Atoi(m[3])
		}
		if y >= 1990 && y <= 2099 {
			return time.Date(y, time.Month(mo), d, 12, 0, 0, 0, time.Local), true
		}
	}

	return time.Time{}, false
}

// resolveCompanionAndFolderDates links Live Photo .mov files and stripped-metadata files
// to their companion photo (e.g. IMG_0191.mov -> IMG_0191.jpg) or nearest dated neighbor in the same folder.
func resolveCompanionAndFolderDates(items []PhotoItem) {
	type dirGroup struct {
		indices []int
	}
	byDir := make(map[string]*dirGroup)
	for i := range items {
		dirKey := items[i].StorageID + ":" + filepath.ToSlash(filepath.Dir(items[i].RelPath))
		g, ok := byDir[dirKey]
		if !ok {
			g = &dirGroup{}
			byDir[dirKey] = g
		}
		g.indices = append(g.indices, i)
	}

	for _, g := range byDir {
		stemDates := make(map[string]time.Time)
		hasDatedNeighbor := false

		for _, idx := range g.indices {
			it := items[idx]
			if it.DateSource != "mtime" && !it.TakenAt.IsZero() {
				hasDatedNeighbor = true
				stem := strings.ToLower(strings.TrimSuffix(it.Name, filepath.Ext(it.Name)))
				stemDates[stem] = it.TakenAt
				if m := reImgPrefix.FindStringSubmatch(stem); len(m) >= 2 {
					stemDates[strings.ToLower(m[1])] = it.TakenAt
				}
			}
		}

		if !hasDatedNeighbor {
			continue
		}

		// Sort indices in this directory by filename for nearest-neighbor fallback
		sortedIdx := make([]int, len(g.indices))
		copy(sortedIdx, g.indices)
		sort.Slice(sortedIdx, func(a, b int) bool {
			return strings.ToLower(items[sortedIdx[a]].Name) < strings.ToLower(items[sortedIdx[b]].Name)
		})

		for pos, idx := range sortedIdx {
			if items[idx].DateSource != "mtime" {
				continue
			}
			stem := strings.ToLower(strings.TrimSuffix(items[idx].Name, filepath.Ext(items[idx].Name)))

			// 1. Exact stem match (e.g. Live Photo IMG_0191.mov -> IMG_0191.jpg)
			if t, ok := stemDates[stem]; ok {
				items[idx].TakenAt = t
				items[idx].DateSource = "exif"
				continue
			}

			// 2. IMG_XXXX prefix match (e.g. IMG_1291_Gemini...png -> IMG_1291.HEIC)
			if m := reImgPrefix.FindStringSubmatch(stem); len(m) >= 2 {
				if t, ok := stemDates[strings.ToLower(m[1])]; ok {
					items[idx].TakenAt = t
					items[idx].DateSource = "exif"
					continue
				}
			}

			// 3. Nearest dated neighbor in the same album folder (e.g. IMG_4440.MOV between IMG_4436.heic and IMG_4444.MOV)
			var nearestTime time.Time
			bestDist := len(sortedIdx) + 1
			for otherPos, otherIdx := range sortedIdx {
				if items[otherIdx].DateSource != "mtime" && !items[otherIdx].TakenAt.IsZero() {
					dist := pos - otherPos
					if dist < 0 {
						dist = -dist
					}
					if dist < bestDist {
						bestDist = dist
						nearestTime = items[otherIdx].TakenAt
					}
				}
			}
			if !nearestTime.IsZero() {
				items[idx].TakenAt = nearestTime
				items[idx].DateSource = "filename"
			}
		}
	}
}

// resolvePhotoAlbumName extracts a clean album title from a photo's relative path
func resolvePhotoAlbumName(relPath, storageName string) string {
	dir := filepath.ToSlash(filepath.Dir(relPath))
	dir = strings.Trim(dir, "/")
	if dir == "" || dir == "." {
		if storageName != "" {
			return storageName
		}
		return "기본 앨범"
	}
	parts := strings.Split(dir, "/")
	if len(parts) == 1 {
		return parts[0]
	}
	// If the first segment is a dedicated photo folder name (e.g., "사진/제주도 여행"), use the subfolder path as the album name
	if isPhotosDir(parts[0]) && len(parts) > 1 {
		return strings.Join(parts[1:], " / ")
	}
	return strings.Join(parts, " / ")
}

// handleMediaMeta returns extracted EXIF/MP4 metadata for a single file (/api/media/meta)
func handleMediaMeta(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	storageId := r.URL.Query().Get("storage")
	relPath := r.URL.Query().Get("path")
	fullPath, err := resolveSafePath(storageId, relPath)
	if err != nil {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	st := getStorage(storageId)
	cleanRel := "/" + strings.TrimPrefix(filepath.ToSlash(filepath.Clean("/"+relPath)), "/")
	meta := getOrExtractMediaMeta(st, cleanRel, fullPath, info)
	flushStorageMetaIndex(st, getStorageMetaIndex(st))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(meta)
}

// handlePhotoThumb serves or caches a lightweight JPEG thumbnail (/api/photos/thumb)
// GET: serves cached thumbnail for images/videos (or generates one for images)
// POST: saves a client-captured video thumbnail frame into .mininas_cache/thumbs/
func handlePhotoThumb(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var req struct {
			Storage string `json:"storage"`
			Path    string `json:"path"`
			DataURL string `json:"dataUrl"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		fullPath, err := resolveSafePath(req.Storage, req.Path)
		if err != nil {
			http.Error(w, "Access denied", http.StatusForbidden)
			return
		}
		info, err := os.Stat(fullPath)
		if err != nil || info.IsDir() {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}
		const prefix = "data:image/jpeg;base64,"
		if !strings.HasPrefix(req.DataURL, prefix) {
			http.Error(w, "Invalid dataUrl format", http.StatusBadRequest)
			return
		}
		rawBytes, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(req.DataURL, prefix))
		if err != nil || len(rawBytes) == 0 {
			http.Error(w, "Invalid base64 payload", http.StatusBadRequest)
			return
		}
		st := getStorage(req.Storage)
		thumbsDir := filepath.Join(st.Path, ".mininas_cache", "thumbs")
		_ = os.MkdirAll(thumbsDir, 0755)
		cacheFile := filepath.Join(thumbsDir, computeThumbFileName(req.Path, info.Size(), info.ModTime().UnixNano()))
		_ = os.WriteFile(cacheFile, rawBytes, 0644)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true}`))
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	storageId := r.URL.Query().Get("storage")
	relPath := r.URL.Query().Get("path")
	fullPath, err := resolveSafePath(storageId, relPath)
	if err != nil {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	st := getStorage(storageId)
	thumbsDir := filepath.Join(st.Path, ".mininas_cache", "thumbs")
	_ = os.MkdirAll(thumbsDir, 0755)

	cacheFile := filepath.Join(thumbsDir, computeThumbFileName(relPath, info.Size(), info.ModTime().UnixNano()))

	// 1. Serve directly from disk thumbnail cache if present
	if cInfo, err := os.Stat(cacheFile); err == nil && cInfo.Size() > 0 {
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		http.ServeFile(w, r, cacheFile)
		return
	}

	ext := strings.ToLower(filepath.Ext(fullPath))
	if getMediaType(ext) == "video" {
		// Video thumbnail not cached on disk yet; return 404 so client captures once and uploads via POST
		http.NotFound(w, r)
		return
	}

	// 2. Fast path: Extract embedded EXIF thumbnail from JPEG in <1ms (with Orientation tag preserved)
	if ext == ".jpg" || ext == ".jpeg" {
		if thumbBytes, ok := extractExifThumbnail(fullPath); ok && len(thumbBytes) > 0 {
			_ = os.WriteFile(cacheFile, thumbBytes, 0644)
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			_, _ = w.Write(thumbBytes)
			return
		}
	}

	// 3. If file is already small (< 120KB) and web-compatible image, serve directly
	if info.Size() <= 120*1024 && (ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp" || ext == ".gif") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		http.ServeFile(w, r, fullPath)
		return
	}

	// 4. macOS built-in sips thumbnail generator (supports JPEG, PNG, HEIC, GIF, TIFF on macOS 10.13+)
	if _, err := os.Stat("/usr/bin/sips"); err == nil {
		cmd := exec.Command("/usr/bin/sips", "-Z", "360", "-s", "format", "jpeg", "-s", "formatOptions", "75", fullPath, "--out", cacheFile)
		if err := cmd.Run(); err == nil {
			if cInfo, statErr := os.Stat(cacheFile); statErr == nil && cInfo.Size() > 0 {
				w.Header().Set("Content-Type", "image/jpeg")
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				http.ServeFile(w, r, cacheFile)
				return
			}
		}
	}

	// 5. Fallback to original file stream
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, fullPath)
}
