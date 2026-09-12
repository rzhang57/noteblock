package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"noteblock-cloud-service/internal/database"
	"noteblock-cloud-service/internal/model"
)

func newSyncServer(t *testing.T) (*Server, *gin.Engine) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	conn, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "cloud.sqlite")), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() {
		if sqlDB, err := conn.DB(); err == nil {
			sqlDB.Close()
		}
	})

	if err := database.Migrate(conn); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	s := &Server{gorm: conn}
	r := gin.New()
	r.POST("/sync", s.syncHandler)

	return s, r
}

func postSync(t *testing.T, r *gin.Engine, body syncRequest) syncResponse {
	t.Helper()

	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/sync", bytes.NewReader(encoded))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var resp syncResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	return resp
}

func noteDoc(id, title string, updatedAt time.Time) map[string]any {
	return map[string]any{
		"id":         id,
		"title":      title,
		"folder_id":  "root",
		"user_id":    "00000000-0000-0000-0000-000000000001",
		"updated_at": updatedAt.Format(cursorLayout),
		"blocks":     []any{},
	}
}

func titlesOf(docs []map[string]any) map[string]string {
	out := map[string]string{}
	for _, d := range docs {
		id, _ := d["id"].(string)
		title, _ := d["title"].(string)
		out[id] = title
	}
	return out
}

func toDocs(raw []jsonbAlias) []map[string]any {
	out := make([]map[string]any, 0, len(raw))
	for _, r := range raw {
		out = append(out, r)
	}
	return out
}

func TestPushedNoteComesBackToASecondDevice(t *testing.T) {
	_, r := newSyncServer(t)

	pushed := postSync(t, r, syncRequest{Notes: docsOf(noteDoc("n1", "CS341", time.Now()))})
	if len(pushed.Notes) != 1 {
		t.Fatalf("first device got %d notes back", len(pushed.Notes))
	}

	// A second device that has never synced sends no cursor and must receive everything.
	second := postSync(t, r, syncRequest{})
	if len(second.Notes) != 1 {
		t.Fatalf("second device got %d notes, want 1", len(second.Notes))
	}
	if got := titlesOf(toDocs(second.Notes))["n1"]; got != "CS341" {
		t.Errorf("title = %q, want CS341", got)
	}
}

func TestNewerClientTimestampWinsAndOlderIsIgnored(t *testing.T) {
	_, r := newSyncServer(t)

	early := time.Now()
	late := early.Add(time.Minute)

	postSync(t, r, syncRequest{Notes: docsOf(noteDoc("n1", "original", early))})
	postSync(t, r, syncRequest{Notes: docsOf(noteDoc("n1", "newer", late))})
	postSync(t, r, syncRequest{Notes: docsOf(noteDoc("n1", "stale", early))})

	resp := postSync(t, r, syncRequest{})
	if got := titlesOf(toDocs(resp.Notes))["n1"]; got != "newer" {
		t.Errorf("title = %q, want newer; LWW picked the wrong side", got)
	}
}

func TestTheSamePayloadTwiceChangesNothing(t *testing.T) {
	_, r := newSyncServer(t)

	doc := noteDoc("n1", "CS341", time.Now())
	postSync(t, r, syncRequest{Notes: docsOf(doc)})
	postSync(t, r, syncRequest{Notes: docsOf(doc)})

	resp := postSync(t, r, syncRequest{})
	if len(resp.Notes) != 1 {
		t.Errorf("note count = %d after the same push twice, want 1", len(resp.Notes))
	}
}

func TestCursorExcludesWorkTheDeviceHasAlreadySeen(t *testing.T) {
	_, r := newSyncServer(t)

	first := postSync(t, r, syncRequest{Notes: docsOf(noteDoc("n1", "first", time.Now()))})
	cursor := first.ServerTime

	settled := postSync(t, r, syncRequest{Since: &cursor})
	if len(settled.Notes) != 0 {
		t.Errorf("got %d notes at a current cursor, want none", len(settled.Notes))
	}

	time.Sleep(10 * time.Millisecond)
	postSync(t, r, syncRequest{Notes: docsOf(noteDoc("n2", "second", time.Now()))})

	fresh := postSync(t, r, syncRequest{Since: &cursor})
	if len(fresh.Notes) != 1 {
		t.Fatalf("got %d notes after a new write, want 1", len(fresh.Notes))
	}
	if got := titlesOf(toDocs(fresh.Notes))["n2"]; got != "second" {
		t.Errorf("returned the wrong note: %v", toDocs(fresh.Notes))
	}
}

func TestTombstoneTravelsThroughUnchanged(t *testing.T) {
	_, r := newSyncServer(t)

	deletedAt := time.Now()
	doc := noteDoc("n1", "Doomed", deletedAt)
	doc["deleted_at"] = deletedAt.Format(cursorLayout)

	postSync(t, r, syncRequest{Notes: docsOf(doc)})

	resp := postSync(t, r, syncRequest{})
	if len(resp.Notes) != 1 {
		t.Fatalf("note count = %d, want 1", len(resp.Notes))
	}
	if _, ok := resp.Notes[0]["deleted_at"]; !ok {
		t.Error("deleted_at did not survive the round trip; the delete is invisible to the other device")
	}
}

func TestBlocksSurviveVerbatim(t *testing.T) {
	_, r := newSyncServer(t)

	doc := noteDoc("n1", "CS341", time.Now())
	doc["blocks"] = []any{
		map[string]any{"id": "b1", "type": "text", "index": float64(0), "content": map[string]any{"text": "hello"}},
	}

	postSync(t, r, syncRequest{Notes: docsOf(doc)})

	resp := postSync(t, r, syncRequest{})
	blocks, ok := resp.Notes[0]["blocks"].([]any)
	if !ok || len(blocks) != 1 {
		t.Fatalf("blocks = %v, want one block", resp.Notes[0]["blocks"])
	}
	block := blocks[0].(map[string]any)
	content := block["content"].(map[string]any)
	if content["text"] != "hello" {
		t.Errorf("block content = %v, want the stored value", content)
	}
}

func TestMalformedDocumentsAreSkippedRatherThanStored(t *testing.T) {
	_, r := newSyncServer(t)

	postSync(t, r, syncRequest{Notes: []jsonbAlias{
		{"title": "no id at all", "updated_at": time.Now().Format(cursorLayout)},
		{"id": "n2", "title": "no timestamp"},
	}})

	resp := postSync(t, r, syncRequest{})
	if len(resp.Notes) != 0 {
		t.Errorf("stored %d malformed documents, want 0", len(resp.Notes))
	}
}

type jsonbAlias = model.JSONB

func docsOf(docs ...map[string]any) []model.JSONB {
	out := make([]model.JSONB, 0, len(docs))
	for _, d := range docs {
		out = append(out, d)
	}
	return out
}
