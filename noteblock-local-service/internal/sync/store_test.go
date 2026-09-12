package sync

import (
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"gorm.io/gorm"
	"server/internal/db"
	"server/internal/model"
	"server/internal/service"
)

type fixture struct {
	conn   *gorm.DB
	store  *Store
	notes  *service.NoteService
	blocks *service.BlockService
}

func newFixture(t *testing.T) *fixture {
	t.Helper()

	conn, err := db.Open(filepath.Join(t.TempDir(), "test.sqlite"))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() {
		if sqlDB, err := conn.DB(); err == nil {
			sqlDB.Close()
		}
	})
	return &fixture{
		conn:   conn,
		store:  &Store{DB: conn},
		notes:  &service.NoteService{DB: conn},
		blocks: &service.BlockService{DB: conn},
	}
}

func TestCursorsStartEmptyAndRoundTrip(t *testing.T) {
	f := newFixture(t)

	got, err := f.store.Cursors()
	if err != nil {
		t.Fatalf("read cursors: %v", err)
	}
	if got.LastPushedLocal != nil {
		t.Errorf("LastPushedLocal = %v, want nil on a fresh database", got.LastPushedLocal)
	}
	if got.LastPulledServer != "" {
		t.Errorf("LastPulledServer = %q, want empty", got.LastPulledServer)
	}

	pushed := time.Now().UTC().Truncate(time.Millisecond)
	if err := SaveCursors(f.conn, Cursors{LastPushedLocal: &pushed, LastPulledServer: "srv-token-1"}); err != nil {
		t.Fatalf("save cursors: %v", err)
	}

	got, err = f.store.Cursors()
	if err != nil {
		t.Fatalf("re-read cursors: %v", err)
	}
	if got.LastPushedLocal == nil || !got.LastPushedLocal.Equal(pushed) {
		t.Errorf("LastPushedLocal = %v, want %v", got.LastPushedLocal, pushed)
	}
	if got.LastPulledServer != "srv-token-1" {
		t.Errorf("LastPulledServer = %q, want srv-token-1", got.LastPulledServer)
	}
}

func TestCursorTableHoldsExactlyOneRow(t *testing.T) {
	f := newFixture(t)

	if err := f.conn.Exec("INSERT INTO sync_states (id, last_pulled_server) VALUES (2, 'x')").Error; err == nil {
		t.Error("a second cursor row was accepted; the single-row check is not enforced")
	}
}

func TestChangedSinceReturnsWholeNoteDocuments(t *testing.T) {
	f := newFixture(t)

	note, err := f.notes.NewNote("CS341", nil)
	if err != nil {
		t.Fatalf("create note: %v", err)
	}
	for i, text := range []string{`{"text":"first"}`, `{"text":"second"}`} {
		raw := []byte(text)
		msg := rawMessage(raw)
		if _, err := f.blocks.CreateNewBlock(note.ID, "text", i, msg); err != nil {
			t.Fatalf("create block %d: %v", i, err)
		}
	}

	changes, err := f.store.ChangedSince(nil)
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}

	if len(changes.Notes) != 1 {
		t.Fatalf("note count = %d, want 1", len(changes.Notes))
	}
	doc := changes.Notes[0]
	if doc.Title != "CS341" {
		t.Errorf("title = %q, want CS341", doc.Title)
	}
	if doc.UserID != model.LocalUserID {
		t.Errorf("user id = %q, want %q", doc.UserID, model.LocalUserID)
	}
	if len(doc.Blocks) != 2 {
		t.Fatalf("block count = %d, want 2; the document must carry the whole set", len(doc.Blocks))
	}
	if doc.Blocks[0].Index != 0 || doc.Blocks[1].Index != 1 {
		t.Errorf("blocks out of order: %d then %d", doc.Blocks[0].Index, doc.Blocks[1].Index)
	}
	if string(doc.Blocks[0].Content) != `{"text":"first"}` {
		t.Errorf("block content = %s, want the stored json verbatim", doc.Blocks[0].Content)
	}
}

func TestChangedSinceSkipsWorkOlderThanTheCursor(t *testing.T) {
	f := newFixture(t)

	if _, err := f.notes.NewNote("Old", nil); err != nil {
		t.Fatalf("create old note: %v", err)
	}

	time.Sleep(20 * time.Millisecond)
	cursor := time.Now()
	time.Sleep(20 * time.Millisecond)

	if _, err := f.notes.NewNote("New", nil); err != nil {
		t.Fatalf("create new note: %v", err)
	}

	changes, err := f.store.ChangedSince(&cursor)
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}
	if len(changes.Notes) != 1 {
		t.Fatalf("note count = %d, want only the one written after the cursor", len(changes.Notes))
	}
	if changes.Notes[0].Title != "New" {
		t.Errorf("returned %q, want New", changes.Notes[0].Title)
	}
}

func TestChangedSinceCarriesTombstones(t *testing.T) {
	f := newFixture(t)

	note, err := f.notes.NewNote("Doomed", nil)
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	time.Sleep(20 * time.Millisecond)
	cursor := time.Now()
	time.Sleep(20 * time.Millisecond)

	if err := f.notes.DeleteNote(note.ID); err != nil {
		t.Fatalf("delete note: %v", err)
	}

	changes, err := f.store.ChangedSince(&cursor)
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}
	if len(changes.Notes) != 1 {
		t.Fatalf("note count = %d; a delete after the cursor must be reported", len(changes.Notes))
	}
	if changes.Notes[0].DeletedAt == nil {
		t.Error("document has no deleted_at; the other device cannot tell this was deleted")
	}
}

func TestTopLevelNotesCarryANullFolder(t *testing.T) {
	f := newFixture(t)

	if _, err := f.notes.NewNote("Loose", nil); err != nil {
		t.Fatalf("create note: %v", err)
	}

	changes, err := f.store.ChangedSince(nil)
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}
	if len(changes.Notes) != 1 {
		t.Fatalf("note count = %d, want 1", len(changes.Notes))
	}
	if changes.Notes[0].FolderID != nil {
		t.Errorf("folder_id = %v, want nil for a top-level note", *changes.Notes[0].FolderID)
	}
}

func TestChangedSinceIsEmptyWhenNothingHasHappened(t *testing.T) {
	f := newFixture(t)

	if _, err := f.notes.NewNote("Settled", nil); err != nil {
		t.Fatalf("create note: %v", err)
	}

	time.Sleep(20 * time.Millisecond)
	cursor := time.Now()

	changes, err := f.store.ChangedSince(&cursor)
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}
	if !changes.IsEmpty() {
		t.Errorf("changes = %+v, want nothing left to push once the cursor has caught up", changes)
	}
}

func rawMessage(b []byte) *json.RawMessage {
	raw := json.RawMessage(b)
	return &raw
}
