package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// A /sync and /images server, so the bytes are exercised rather than only the note that names them.
type imageCloud struct {
	mu      sync.Mutex
	blobs   map[string][]byte
	notes   map[string]NoteDocument
	putFail bool
	server  *httptest.Server
}

func newImageCloud(t *testing.T) *imageCloud {
	t.Helper()

	c := &imageCloud{blobs: map[string][]byte{}, notes: map[string]NoteDocument{}}
	c.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if key, ok := strings.CutPrefix(r.URL.Path, "/images/"); ok {
			c.mu.Lock()
			defer c.mu.Unlock()
			switch r.Method {
			case http.MethodPut:
				if c.putFail {
					http.Error(w, "nope", http.StatusInternalServerError)
					return
				}
				body, _ := io.ReadAll(r.Body)
				c.blobs[key] = body
				w.WriteHeader(http.StatusOK)
			case http.MethodGet:
				body, ok := c.blobs[key]
				if !ok {
					http.Error(w, "missing", http.StatusNotFound)
					return
				}
				w.Write(body)
			}
			return
		}

		var req request
		json.NewDecoder(r.Body).Decode(&req)
		c.mu.Lock()
		for _, doc := range req.Notes {
			c.notes[doc.ID] = doc
		}
		c.mu.Unlock()

		json.NewEncoder(w).Encode(response{
			Notes:      []NoteDocument{},
			Folders:    []FolderDocument{},
			ServerTime: time.Now().UTC().Format(time.RFC3339Nano),
		})
	}))
	t.Cleanup(c.server.Close)

	return c
}

func seedNoteWithImage(t *testing.T, f *fixture, name string, bytes []byte) {
	t.Helper()

	if err := os.MkdirAll(ImagesDir(), 0o755); err != nil {
		t.Fatalf("images dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(ImagesDir(), name), bytes, 0o644); err != nil {
		t.Fatalf("write image: %v", err)
	}

	note, err := f.notes.NewNote("With an image", nil)
	if err != nil {
		t.Fatalf("create note: %v", err)
	}
	content := json.RawMessage(fmt.Sprintf(`{"url":"noteblock-image:///%s"}`, name))
	if _, err := f.blocks.CreateNewBlock(note.ID, "image", 0, &content); err != nil {
		t.Fatalf("create block: %v", err)
	}
}

func TestAnImageRoundTripsWithItsNote(t *testing.T) {
	t.Setenv("NOTE_DB_PATH", t.TempDir())
	f := newFixture(t)
	cloud := newImageCloud(t)
	engine := NewEngine(f.conn, cloud.server.URL, time.Hour)

	want := []byte("the actual bytes")
	seedNoteWithImage(t, f, "shot.png", want)

	if err := engine.Pass(context.Background()); err != nil {
		t.Fatalf("pass: %v", err)
	}

	cloud.mu.Lock()
	defer cloud.mu.Unlock()
	got, ok := cloud.blobs["shot.png"]
	if !ok {
		t.Fatal("the note was pushed but its bytes never were")
	}
	if string(got) != string(want) {
		t.Errorf("uploaded %q, want %q", got, want)
	}
}

// Pushing the note while its bytes failed to upload leaves the peer with a permanently broken
// image: the note is past the cursor and will never be offered again.
func TestANoteStaysPendingWhenItsImageCannotBeUploaded(t *testing.T) {
	t.Setenv("NOTE_DB_PATH", t.TempDir())
	f := newFixture(t)
	cloud := newImageCloud(t)
	cloud.putFail = true
	engine := NewEngine(f.conn, cloud.server.URL, time.Hour)

	seedNoteWithImage(t, f, "shot.png", []byte("bytes"))

	if err := engine.Pass(context.Background()); err == nil {
		t.Fatal("the pass reported success despite the image upload failing")
	}

	cloud.mu.Lock()
	pushed := len(cloud.notes)
	cloud.mu.Unlock()
	if pushed != 0 {
		t.Errorf("%d notes reached the cloud describing bytes that are not there", pushed)
	}

	cursors, err := f.store.Cursors()
	if err != nil {
		t.Fatalf("cursors: %v", err)
	}
	if cursors.LastPushedLocal != nil {
		t.Error("the cursor advanced past a note whose image never uploaded")
	}
}
