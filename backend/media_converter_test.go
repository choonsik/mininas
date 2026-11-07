package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMediaCapabilitiesAPI(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/media/capabilities", nil)
	rec := httptest.NewRecorder()

	handleGetMediaCapabilities(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", rec.Code)
	}

	var caps MediaCapabilities
	if err := json.Unmarshal(rec.Body.Bytes(), &caps); err != nil {
		t.Fatalf("Failed to parse capabilities JSON: %v", err)
	}

	// Should not crash, returns valid JSON response
	t.Logf("Capabilities: available=%v, tool=%s", caps.Available, caps.Tool)
}
