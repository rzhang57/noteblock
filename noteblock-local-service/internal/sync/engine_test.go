package sync

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"server/internal/model"
)

// A stand-in for the cloud service with the same LWW rules, so the engine can be driven
// without a running server. The real endpoint is covered by its own suite.
type fakeCloud struct {
	notes     map[string]NoteDocument
	folders   map[string]FolderDocument
	writtenAt map[string]time.Time
	clock     time.Time
	requests  int
	server    *httptest.Server
}

func newFakeCloud(t *testing.T) *fakeCloud {
	t.Helper()

	c := &fakeCloud{
		notes:     map[string]NoteDocument{},
		folders:   map[string]FolderDocument{},
		writtenAt: map[string]time.Time{},
		clock:     time.Unix(0, 0).UTC(),
	}

	c.server = httptest.NewServer(http.HandlerFunc(c.handle))
	t.Cleanup(c.server.Close)

	return c
}

func (c *fakeCloud) handle(w http.ResponseWriter, r *http.Request) {
	c.requests++
	c.clock = c.clock.Add(time.Second)

	var req request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	for _, doc := range req.Notes {
		if stored, ok := c.notes[doc.ID]; ok && !doc.UpdatedAt.After(stored.UpdatedAt) {
			continue
		}
		c.notes[doc.ID] = doc
		c.writtenAt["note:"+doc.ID] = c.clock
	}
	for _, doc := range req.Folders {
		if stored, ok := c.folders[doc.ID]; ok && !doc.UpdatedAt.After(stored.UpdatedAt) {
			continue
		}
		c.folders[doc.ID] = doc
		c.writtenAt["folder:"+doc.ID] = c.clock
	}

	var since time.Time
	if req.Since != nil && *req.Since != "" {
		since, _ = time.Parse(time.RFC3339Nano, *req.Since)
	}

	res := response{Notes: []NoteDocument{}, Folders: []FolderDocument{}, ServerTime: c.clock.Format(time.RFC3339Nano)}
	for id, doc := range c.notes {
		if c.writtenAt["note:"+id].After(since) {
			res.Notes = append(res.Notes, doc)
		}
	}
	for id, doc := range c.folders {
		if c.writtenAt["folder:"+id].After(since) {
			res.Folders = append(res.Folders, doc)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

func newEngineFor(t *testing.T, f *fixture, cloud *fakeCloud) *Engine {
	t.Helper()
	return NewEngine(f.conn, cloud.server.URL, time.Hour)
}

func TestPassPushesLocalWorkAndAdvancesBothCursors(t *testing.T) {
	f := newFixture(t)
	cloud := newFakeCloud(t)
	engine := newEngineFor(t, f, cloud)

	if _, err := f.notes.NewNote("CS341", nil); err != nil {
		t.Fatalf("create note: %v", err)
	}

	// The cursor is inclusive to the millisecond, so a note written in the same millisecond as
	// the scan is deliberately re-sent. Settling is only observable once the clock has moved past it.
	time.Sleep(2 * time.Millisecond)

	if err := engine.Pass(context.Background()); err != nil {
		t.Fatalf("pass: %v", err)
	}

	if len(cloud.notes) != 1 {
		t.Fatalf("cloud holds %d notes, want 1", len(cloud.notes))
	}

	cursors, err := f.store.Cursors()
	if err != nil {
		t.Fatalf("read cursors: %v", err)
	}
	if cursors.LastPushedLocal == nil {
		t.Error("LastPushedLocal did not advance")
	}
	if cursors.LastPulledServer == "" {
		t.Error("LastPulledServer did not advance")
	}
}

func TestASettledDeviceStopsSendingWork(t *testing.T) {
	f := newFixture(t)
	cloud := newFakeCloud(t)
	engine := newEngineFor(t, f, cloud)

	if _, err := f.notes.NewNote("CS341", nil); err != nil {
		t.Fatalf("create note: %v", err)
	}

	// The cursor compares milliseconds and is inclusive, so a note written in the same millisecond
	// as the scan is deliberately re-sent. Settling is only observable once the clock moves past it.
	time.Sleep(2 * time.Millisecond)

	if err := engine.Pass(context.Background()); err != nil {
		t.Fatalf("first pass: %v", err)
	}
	if err := engine.Pass(context.Background()); err != nil {
		t.Fatalf("second pass: %v", err)
	}

	changes, err := f.store.ChangedSince(mustCursor(t, f))
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}
	if !changes.IsEmpty() {
		t.Errorf("device still has %d notes to push after syncing twice", len(changes.Notes))
	}
}

// The trap: if a pulled record is written with a fresh local updated_at it looks newer than
// the server's copy, gets pushed back, wins, and the two devices bounce it forever.
func TestPulledRecordsKeepTheirIncomingTimestamp(t *testing.T) {
	f := newFixture(t)
	cloud := newFakeCloud(t)
	engine := newEngineFor(t, f, cloud)

	remoteUpdatedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Millisecond)
	cloud.notes["remote-1"] = NoteDocument{
		ID:        "remote-1",
		Title:     "From the other device",
		FolderID:  nil,
		UserID:    model.LocalUserID,
		UpdatedAt: remoteUpdatedAt,
		Blocks:    []BlockDocument{},
	}
	cloud.writtenAt["note:remote-1"] = cloud.clock.Add(time.Second)

	if err := engine.Pass(context.Background()); err != nil {
		t.Fatalf("pass: %v", err)
	}

	var stored model.Note
	if err := f.conn.First(&stored, "id = ?", "remote-1").Error; err != nil {
		t.Fatalf("pulled note missing: %v", err)
	}
	if !stored.UpdatedAt.UTC().Truncate(time.Millisecond).Equal(remoteUpdatedAt) {
		t.Errorf("updated_at = %v, want the incoming %v", stored.UpdatedAt.UTC(), remoteUpdatedAt)
	}

	before := cloud.requests
	if err := engine.Pass(context.Background()); err != nil {
		t.Fatalf("second pass: %v", err)
	}
	changes, err := f.store.ChangedSince(mustCursor(t, f))
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}
	if !changes.IsEmpty() {
		t.Errorf("pulled record was queued straight back for push: %+v", changes.Notes)
	}
	if cloud.requests == before {
		t.Log("no second request was made, which is also fine")
	}
}

func TestPulledNoteArrivesWithItsBlocks(t *testing.T) {
	f := newFixture(t)
	cloud := newFakeCloud(t)
	engine := newEngineFor(t, f, cloud)

	cloud.notes["remote-1"] = NoteDocument{
		ID:        "remote-1",
		Title:     "Lecture",
		FolderID:  nil,
		UserID:    model.LocalUserID,
		UpdatedAt: time.Now().UTC(),
		Blocks: []BlockDocument{
			{ID: "b1", Type: "text", Index: 0, Content: json.RawMessage(`{"text":"one"}`)},
			{ID: "b2", Type: "text", Index: 1, Content: json.RawMessage(`{"text":"two"}`)},
		},
	}
	cloud.writtenAt["note:remote-1"] = cloud.clock.Add(time.Second)

	if err := engine.Pass(context.Background()); err != nil {
		t.Fatalf("pass: %v", err)
	}

	var blocks []model.Block
	if err := f.conn.Where("note_id = ?", "remote-1").Order("`index`").Find(&blocks).Error; err != nil {
		t.Fatalf("read blocks: %v", err)
	}
	if len(blocks) != 2 {
		t.Fatalf("block count = %d, want 2", len(blocks))
	}
	if blocks[0].Content != `{"text":"one"}` {
		t.Errorf("block content = %s, want it verbatim", blocks[0].Content)
	}
	if blocks[0].ID != "b1" {
		t.Errorf("block id = %q, want the id the other device generated", blocks[0].ID)
	}
}

func TestAPulledNoteReplacesItsWholeBlockSet(t *testing.T) {
	f := newFixture(t)
	cloud := newFakeCloud(t)
	engine := newEngineFor(t, f, cloud)

	note, err := f.notes.NewNote("Shared", nil)
	if err != nil {
		t.Fatalf("create note: %v", err)
	}
	for i := range 3 {
		raw := json.RawMessage(`{"text":"local"}`)
		if _, err := f.blocks.CreateNewBlock(note.ID, "text", i, &raw); err != nil {
			t.Fatalf("create block: %v", err)
		}
	}

	cloud.notes[note.ID] = NoteDocument{
		ID:        note.ID,
		Title:     "Shared",
		FolderID:  nil,
		UserID:    model.LocalUserID,
		UpdatedAt: time.Now().Add(time.Hour).UTC(),
		Blocks:    []BlockDocument{{ID: "only", Type: "text", Index: 0, Content: json.RawMessage(`{"text":"remote"}`)}},
	}
	cloud.writtenAt["note:"+note.ID] = cloud.clock.Add(time.Second)

	if err := engine.Pass(context.Background()); err != nil {
		t.Fatalf("pass: %v", err)
	}

	var blocks []model.Block
	if err := f.conn.Where("note_id = ?", note.ID).Find(&blocks).Error; err != nil {
		t.Fatalf("read blocks: %v", err)
	}
	if len(blocks) != 1 {
		t.Fatalf("block count = %d, want 1; the block set must be replaced wholesale", len(blocks))
	}
	if blocks[0].ID != "only" {
		t.Errorf("surviving block = %q, want the remote one", blocks[0].ID)
	}
}

func TestAnOlderRemoteRecordDoesNotOverwriteNewerLocalWork(t *testing.T) {
	f := newFixture(t)
	cloud := newFakeCloud(t)
	engine := newEngineFor(t, f, cloud)

	note, err := f.notes.NewNote("Local wins", nil)
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	cloud.notes[note.ID] = NoteDocument{
		ID:        note.ID,
		Title:     "Stale remote",
		FolderID:  nil,
		UserID:    model.LocalUserID,
		UpdatedAt: time.Now().Add(-time.Hour).UTC(),
		Blocks:    []BlockDocument{},
	}
	cloud.writtenAt["note:"+note.ID] = cloud.clock.Add(time.Second)

	if err := engine.Pass(context.Background()); err != nil {
		t.Fatalf("pass: %v", err)
	}

	var stored model.Note
	if err := f.conn.First(&stored, "id = ?", note.ID).Error; err != nil {
		t.Fatalf("read note: %v", err)
	}
	if stored.Title != "Local wins" {
		t.Errorf("title = %q, want the newer local value", stored.Title)
	}
}

func TestAFailedPassLeavesTheCursorsAlone(t *testing.T) {
	f := newFixture(t)
	engine := NewEngine(f.conn, "http://127.0.0.1:1", time.Hour)

	if _, err := f.notes.NewNote("CS341", nil); err != nil {
		t.Fatalf("create note: %v", err)
	}

	if err := engine.Pass(context.Background()); err == nil {
		t.Fatal("expected the pass to fail against a dead address")
	}

	cursors, err := f.store.Cursors()
	if err != nil {
		t.Fatalf("read cursors: %v", err)
	}
	if cursors.LastPushedLocal != nil || cursors.LastPulledServer != "" {
		t.Error("cursors advanced despite a failed pass; that work would be skipped forever")
	}
}

func TestATombstonePropagatesAndHidesTheNote(t *testing.T) {
	f := newFixture(t)
	cloud := newFakeCloud(t)
	engine := newEngineFor(t, f, cloud)

	deletedAt := time.Now().UTC()
	cloud.notes["gone"] = NoteDocument{
		ID:        "gone",
		Title:     "Deleted elsewhere",
		FolderID:  nil,
		UserID:    model.LocalUserID,
		UpdatedAt: deletedAt,
		DeletedAt: &deletedAt,
		Blocks:    []BlockDocument{},
	}
	cloud.writtenAt["note:gone"] = cloud.clock.Add(time.Second)

	if err := engine.Pass(context.Background()); err != nil {
		t.Fatalf("pass: %v", err)
	}

	if err := f.conn.First(&model.Note{}, "id = ?", "gone").Error; err == nil {
		t.Error("a note deleted on the other device is visible here")
	}

	var tombstones int64
	if err := f.conn.Unscoped().Model(&model.Note{}).Where("id = ? AND deleted_at IS NOT NULL", "gone").Count(&tombstones).Error; err != nil {
		t.Fatalf("count tombstones: %v", err)
	}
	if tombstones != 1 {
		t.Error("the tombstone was not recorded locally")
	}
}

func mustCursor(t *testing.T, f *fixture) *time.Time {
	t.Helper()

	cursors, err := f.store.Cursors()
	if err != nil {
		t.Fatalf("read cursors: %v", err)
	}

	return cursors.LastPushedLocal
}
