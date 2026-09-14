package sync

import (
	"encoding/json"
	"testing"
	"time"

	"server/internal/model"
	"server/internal/service"
)

func TestChangedSinceSeesAWriteAgainstAUTCCursor(t *testing.T) {
	f := newFixture(t)
	cursor := time.Now().UTC().Add(-time.Hour)

	if _, err := f.notes.NewNote("Fresh", RootFolderID); err != nil {
		t.Fatalf("create note: %v", err)
	}

	changes, err := f.store.ChangedSince(&cursor)
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}
	if len(changes.Notes) != 1 {
		t.Fatalf("got %d notes, want 1; a UTC cursor did not see a local write", len(changes.Notes))
	}
}

// Reproduces a row written by a build that stored local time: the driver's own format, non-UTC zone.
func TestChangedSinceComparesInstantsNotStoredText(t *testing.T) {
	f := newFixture(t)

	west := time.FixedZone("PDT", -7*60*60)
	written := time.Date(2026, 1, 1, 6, 0, 0, 0, west) // 13:00Z
	cursor := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

	if err := f.conn.Exec(
		"INSERT INTO notes (id, title, folder_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		"legacy", "Legacy", RootFolderID, model.LocalUserID, written, written,
	).Error; err != nil {
		t.Fatalf("seed legacy row: %v", err)
	}

	changes, err := f.store.ChangedSince(&cursor)
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}
	if len(changes.Notes) != 1 || changes.Notes[0].ID != "legacy" {
		t.Fatalf("got %+v, want the legacy note; a later instant was hidden by its stored text", changes.Notes)
	}
}

func TestChangedSinceReportsFolderCreatesRenamesAndDeletes(t *testing.T) {
	f := newFixture(t)
	folders := &service.FolderService{DB: f.conn, NoteService: f.notes}

	created, err := folders.CreateNewFolder("Term", ptr(RootFolderID))
	if err != nil {
		t.Fatalf("create folder: %v", err)
	}

	changes, err := f.store.ChangedSince(nil)
	if err != nil {
		t.Fatalf("scan after create: %v", err)
	}
	if len(changes.Folders) != 1 {
		t.Fatalf("got %d folders, want 1", len(changes.Folders))
	}
	if changes.Folders[0].Name != "Term" {
		t.Errorf("name = %q, want Term", changes.Folders[0].Name)
	}
	if changes.Folders[0].ParentID == nil || *changes.Folders[0].ParentID != RootFolderID {
		t.Errorf("parent = %v, want root", changes.Folders[0].ParentID)
	}

	cursor := time.Now().UTC()
	if _, err := folders.UpdateFolder(created.ID, "Renamed", nil); err != nil {
		t.Fatalf("rename folder: %v", err)
	}

	changes, err = f.store.ChangedSince(&cursor)
	if err != nil {
		t.Fatalf("scan after rename: %v", err)
	}
	if len(changes.Folders) != 1 || changes.Folders[0].Name != "Renamed" {
		t.Fatalf("got %+v, want the rename", changes.Folders)
	}

	cursor = time.Now().UTC()
	if err := folders.DeleteFolderAndContents(created.ID); err != nil {
		t.Fatalf("delete folder: %v", err)
	}

	changes, err = f.store.ChangedSince(&cursor)
	if err != nil {
		t.Fatalf("scan after delete: %v", err)
	}
	if len(changes.Folders) != 1 {
		t.Fatalf("got %d folders, want the tombstone", len(changes.Folders))
	}
	if changes.Folders[0].DeletedAt == nil {
		t.Error("folder tombstone has no deleted_at; the delete will not reach the other device")
	}
}

func TestChangedSinceSeesANoteRename(t *testing.T) {
	f := newFixture(t)

	note, err := f.notes.NewNote("Before", RootFolderID)
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	cursor := time.Now().UTC()
	if _, err := f.notes.UpdateNoteMetaData(note.ID, "After", RootFolderID); err != nil {
		t.Fatalf("rename note: %v", err)
	}

	changes, err := f.store.ChangedSince(&cursor)
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}
	if len(changes.Notes) != 1 || changes.Notes[0].Title != "After" {
		t.Fatalf("got %+v, want the renamed note", changes.Notes)
	}
}

func TestTombstonedNoteDoesNotCarryItsBlocks(t *testing.T) {
	f := newFixture(t)

	note, err := f.notes.NewNote("Doomed", RootFolderID)
	if err != nil {
		t.Fatalf("create note: %v", err)
	}
	content := json.RawMessage(`{"text":"body"}`)
	if _, err := f.blocks.CreateNewBlock(note.ID, "text", 0, &content); err != nil {
		t.Fatalf("create block: %v", err)
	}

	cursor := time.Now().UTC()
	if err := f.notes.DeleteNote(note.ID); err != nil {
		t.Fatalf("delete note: %v", err)
	}

	changes, err := f.store.ChangedSince(&cursor)
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}
	if len(changes.Notes) != 1 {
		t.Fatalf("got %d notes, want the tombstone", len(changes.Notes))
	}
	if changes.Notes[0].DeletedAt == nil {
		t.Fatal("note tombstone has no deleted_at")
	}
	if len(changes.Notes[0].Blocks) != 0 {
		t.Errorf("tombstone carries %d blocks, want none", len(changes.Notes[0].Blocks))
	}
}

func TestSaveCursorsLeavesTheOtherCursorAlone(t *testing.T) {
	f := newFixture(t)

	pulled := "server-token"
	if err := SaveCursors(f.conn, Cursors{LastPulledServer: pulled}); err != nil {
		t.Fatalf("save pulled cursor: %v", err)
	}

	pushed := time.Now().UTC()
	if err := SaveCursors(f.conn, Cursors{LastPushedLocal: &pushed}); err != nil {
		t.Fatalf("save pushed cursor: %v", err)
	}

	got, err := f.store.Cursors()
	if err != nil {
		t.Fatalf("read cursors: %v", err)
	}
	if got.LastPulledServer != pulled {
		t.Errorf("LastPulledServer = %q, want %q; advancing one cursor blanked the other", got.LastPulledServer, pulled)
	}
	if got.LastPushedLocal == nil {
		t.Error("LastPushedLocal was not saved")
	}
}


// The cursor is inclusive by design: re-sending a record is safe, dropping one is not.
func TestChangedSinceIncludesARecordWrittenAtTheCursor(t *testing.T) {
	f := newFixture(t)

	note, err := f.notes.NewNote("At the boundary", RootFolderID)
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	var stored time.Time
	if err := f.conn.Model(&model.Note{}).Where("id = ?", note.ID).Pluck("updated_at", &stored).Error; err != nil {
		t.Fatalf("read updated_at: %v", err)
	}

	changes, err := f.store.ChangedSince(&stored)
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}
	if len(changes.Notes) != 1 {
		t.Fatalf("got %d notes, want the record at the cursor instant", len(changes.Notes))
	}
}

func TestChangedSinceReturnsNotesOldestFirst(t *testing.T) {
	f := newFixture(t)

	for _, title := range []string{"first", "second", "third"} {
		if _, err := f.notes.NewNote(title, RootFolderID); err != nil {
			t.Fatalf("create %s: %v", title, err)
		}
		time.Sleep(2 * time.Millisecond)
	}

	changes, err := f.store.ChangedSince(nil)
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}
	if len(changes.Notes) != 3 {
		t.Fatalf("got %d notes, want 3", len(changes.Notes))
	}
	for i, want := range []string{"first", "second", "third"} {
		if changes.Notes[i].Title != want {
			t.Errorf("note %d = %q, want %q; the scan is not ordered by change time", i, changes.Notes[i].Title, want)
		}
	}
}
