package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// The exact bytes the local sidecar sends. Its own suite asserts it marshals to this, so a rename on
// either side breaks one of the two tests instead of silently discarding every push in production.
const goldenClientRequest = `{"since":null,"notes":[{"id":"n1","title":"Lecture","folder_id":"f1","user_id":"00000000-0000-0000-0000-000000000001","updated_at":"2026-01-02T03:04:05.123456789Z","blocks":[{"id":"b1","type":"text","index":0,"content":{"text":"hello"}}]}],"folders":[{"id":"f1","name":"Term","parent_id":"root","user_id":"00000000-0000-0000-0000-000000000001","updated_at":"2026-01-02T03:04:05.123456789Z"}]}`

func TestTheHandlerReadsTheSidecarsWireFormat(t *testing.T) {
	_, r := newSyncServer(t)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/sync", strings.NewReader(goldenClientRequest))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var body map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	for _, key := range []string{"notes", "folders", "server_time"} {
		if _, ok := body[key]; !ok {
			t.Errorf("response has no %q key; the sidecar cannot read this", key)
		}
	}

	// A second exchange with no cursor must hand back what the first one stored.
	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/sync", strings.NewReader(`{"since":null,"notes":[],"folders":[]}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(rec, req)

	var pulled struct {
		Notes   []map[string]any `json:"notes"`
		Folders []map[string]any `json:"folders"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &pulled); err != nil {
		t.Fatalf("decode pull: %v", err)
	}
	if len(pulled.Notes) != 1 || pulled.Notes[0]["id"] != "n1" {
		t.Fatalf("the pushed note did not come back: %+v", pulled.Notes)
	}
	if len(pulled.Folders) != 1 || pulled.Folders[0]["id"] != "f1" {
		t.Fatalf("the pushed folder did not come back: %+v", pulled.Folders)
	}
	if pulled.Notes[0]["title"] != "Lecture" {
		t.Errorf("note title = %v, want it stored verbatim", pulled.Notes[0]["title"])
	}
}

func TestAClientStampFarInTheFutureIsClampedToServerTime(t *testing.T) {
	_, r := newSyncServer(t)

	post := func(body string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/sync", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(rec, req)
		return rec
	}
	note := func(title, updatedAt string) string {
		return `{"since":null,"folders":[],"notes":[{"id":"n1","title":"` + title +
			`","folder_id":"f1","user_id":"00000000-0000-0000-0000-000000000001","updated_at":"` +
			updatedAt + `","blocks":[]}]}`
	}

	if rec := post(note("Poisoned", "9999-01-01T00:00:00Z")); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	// An ordinary edit a moment later must still win, which it cannot if year 9999 was stored.
	later := time.Now().UTC().Add(time.Second).Format(time.RFC3339Nano)
	if rec := post(note("Corrected", later)); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var pulled struct {
		Notes []map[string]any `json:"notes"`
	}
	if err := json.Unmarshal(post(`{"since":null,"notes":[],"folders":[]}`).Body.Bytes(), &pulled); err != nil {
		t.Fatalf("decode pull: %v", err)
	}
	if len(pulled.Notes) != 1 {
		t.Fatalf("got %d notes, want 1", len(pulled.Notes))
	}
	if pulled.Notes[0]["title"] != "Corrected" {
		t.Error("a record stamped in the year 9999 cannot be corrected by any later edit")
	}
}

// What a peer actually compares is the stamp inside the document, not the column the cloud orders
// by. Clamping only the column leaves every device that pulls the record permanently unable to
// correct it.
func TestTheClampReachesTheDocumentPeersRead(t *testing.T) {
	_, r := newSyncServer(t)

	post := func(body string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/sync", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(rec, req)
		return rec
	}

	const poisoned = `{"since":null,"folders":[],"notes":[{"id":"n1","title":"Poisoned","folder_id":"f1","user_id":"00000000-0000-0000-0000-000000000001","updated_at":"9999-01-01T00:00:00Z","blocks":[]}]}`
	if rec := post(poisoned); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var pulled struct {
		Notes []map[string]any `json:"notes"`
	}
	if err := json.Unmarshal(post(`{"since":null,"notes":[],"folders":[]}`).Body.Bytes(), &pulled); err != nil {
		t.Fatalf("decode pull: %v", err)
	}
	if len(pulled.Notes) != 1 {
		t.Fatalf("got %d notes, want 1", len(pulled.Notes))
	}

	stamp, _ := pulled.Notes[0]["updated_at"].(string)
	parsed, err := time.Parse(time.RFC3339Nano, stamp)
	if err != nil {
		t.Fatalf("updated_at %q does not parse: %v", stamp, err)
	}
	if parsed.After(time.Now().UTC().Add(time.Hour)) {
		t.Errorf("peers receive updated_at %s; every device that pulls this can never correct the record", stamp)
	}
}
