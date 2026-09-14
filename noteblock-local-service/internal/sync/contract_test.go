package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"gorm.io/gorm"
	"server/internal/model"
	"server/internal/service"
)

// The cursor is captured before the scan, so work committed while the exchange is in flight is
// still pending afterwards. Capturing it later marks that work pushed and it is never scanned again.
func TestAWriteDuringTheExchangeIsNotSkipped(t *testing.T) {
	f := newFixture(t)

	var once sync.Once
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		once.Do(func() {
			if _, err := f.notes.NewNote("mid-flight", RootFolderID); err != nil {
				t.Errorf("write during exchange: %v", err)
			}
		})
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response{
			Notes:      []NoteDocument{},
			Folders:    []FolderDocument{},
			ServerTime: time.Now().UTC().Format(time.RFC3339Nano),
		})
	}))
	t.Cleanup(server.Close)

	engine := NewEngine(f.conn, server.URL, time.Hour)
	if err := engine.Pass(context.Background()); err != nil {
		t.Fatalf("pass: %v", err)
	}

	cursors, err := f.store.Cursors()
	if err != nil {
		t.Fatalf("read cursors: %v", err)
	}
	changes, err := f.store.ChangedSince(cursors.LastPushedLocal)
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}

	for _, doc := range changes.Notes {
		if doc.Title == "mid-flight" {
			return
		}
	}
	t.Fatal("a note written during the exchange is not pending afterwards; it will never be pushed")
}

// A server that says no has not stored anything, so the work must stay pending.
func TestServerRejectionDoesNotMarkWorkPushed(t *testing.T) {
	f := newFixture(t)

	if _, err := f.notes.NewNote("unsent", RootFolderID); err != nil {
		t.Fatalf("create note: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "sync failed"})
	}))
	t.Cleanup(server.Close)

	engine := NewEngine(f.conn, server.URL, time.Hour)
	if err := engine.Pass(context.Background()); err == nil {
		t.Fatal("a 500 response was treated as a successful exchange")
	}

	cursors, err := f.store.Cursors()
	if err != nil {
		t.Fatalf("read cursors: %v", err)
	}
	if cursors.LastPushedLocal != nil {
		t.Errorf("LastPushedLocal = %v, want nil; rejected work was marked pushed", cursors.LastPushedLocal)
	}

	changes, err := f.store.ChangedSince(cursors.LastPushedLocal)
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}
	if len(changes.Notes) != 1 {
		t.Errorf("got %d pending notes, want the rejected one still pending", len(changes.Notes))
	}
}

// Apply and both cursors share one transaction, so a pull that cannot be applied advances neither.
func TestAnUnapplicablePullLeavesTheCursorsAlone(t *testing.T) {
	f := newFixture(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response{
			Notes: []NoteDocument{{
				ID:        "orphan",
				Title:     "Points nowhere",
				FolderID:  "no-such-folder",
				UserID:    model.LocalUserID,
				UpdatedAt: time.Now().UTC(),
				Blocks:    []BlockDocument{},
			}},
			Folders:    []FolderDocument{},
			ServerTime: time.Now().UTC().Format(time.RFC3339Nano),
		})
	}))
	t.Cleanup(server.Close)

	engine := NewEngine(f.conn, server.URL, time.Hour)
	if err := engine.Pass(context.Background()); err == nil {
		t.Fatal("a pull referencing a missing folder was accepted")
	}

	cursors, err := f.store.Cursors()
	if err != nil {
		t.Fatalf("read cursors: %v", err)
	}
	if cursors.LastPushedLocal != nil || cursors.LastPulledServer != "" {
		t.Errorf("cursors advanced past a pull that was never applied: %+v", cursors)
	}
}

// Folders are the container for every note: if they stop travelling, notes arrive pointing at a
// folder the peer lacks and the exchange wedges.
func TestAFolderRoundTripsAndItsDeleteFollows(t *testing.T) {
	f := newFixture(t)
	cloud := newFakeCloud(t)
	engine := newEngineFor(t, f, cloud)
	folders := &service.FolderService{DB: f.conn, NoteService: f.notes}

	created, err := folders.CreateNewFolder("Term", ptr(RootFolderID))
	if err != nil {
		t.Fatalf("create folder: %v", err)
	}

	if err := engine.Pass(context.Background()); err != nil {
		t.Fatalf("push pass: %v", err)
	}
	pushed, ok := cloud.folders[created.ID]
	if !ok {
		t.Fatal("the folder never reached the cloud")
	}
	if pushed.Name != "Term" {
		t.Errorf("pushed name = %q, want Term", pushed.Name)
	}

	deletedAt := time.Now().UTC().Add(time.Hour)
	cloud.notes = map[string]NoteDocument{}
	cloud.folders[created.ID] = FolderDocument{
		ID:        created.ID,
		Name:      "Term",
		ParentID:  ptr(RootFolderID),
		UserID:    model.LocalUserID,
		UpdatedAt: deletedAt,
		DeletedAt: &deletedAt,
	}
	cloud.writtenAt["folder:"+created.ID] = cloud.clock.Add(time.Hour)

	if err := engine.Pass(context.Background()); err != nil {
		t.Fatalf("pull pass: %v", err)
	}

	var live int64
	if err := f.conn.Model(&model.Folder{}).Where("id = ?", created.ID).Count(&live).Error; err != nil {
		t.Fatalf("count folder: %v", err)
	}
	if live != 0 {
		t.Error("a pulled folder tombstone did not hide the folder locally")
	}
}

// The sync goroutine is the first second writer this database has had; SetMaxOpenConns(1) is what
// keeps it from colliding with the IPC loop.
func TestSyncPassesRunAlongsideLocalWrites(t *testing.T) {
	f := newFixture(t)
	cloud := newFakeCloud(t)
	engine := newEngineFor(t, f, cloud)

	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	errs := make(chan error, 64)

	for w := range 3 {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			for i := range 15 {
				select {
				case <-ctx.Done():
					return
				default:
				}
				if _, err := f.notes.NewNote(fmt.Sprintf("w%d-n%d", w, i), RootFolderID); err != nil {
					errs <- err
					return
				}
			}
		}(w)
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		for range 10 {
			if err := engine.Pass(ctx); err != nil {
				errs <- err
				return
			}
		}
	}()

	wg.Wait()
	cancel()
	close(errs)
	for err := range errs {
		t.Fatalf("concurrent local write and sync pass: %v", err)
	}

	for range 3 {
		if err := engine.Pass(context.Background()); err != nil {
			t.Fatalf("settling pass: %v", err)
		}
	}

	var local int64
	if err := f.conn.Model(&model.Note{}).Count(&local).Error; err != nil {
		t.Fatalf("count notes: %v", err)
	}
	if int64(len(cloud.notes)) != local {
		t.Errorf("cloud has %d notes, local has %d; a write was lost between the two writers", len(cloud.notes), local)
	}
}

// The deleting device keeps its blocks so a restored note comes back intact; a pulled tombstone
// must not be the thing that destroys them everywhere else.
func TestAPulledTombstoneKeepsTheBlocksOnDisk(t *testing.T) {
	f := newFixture(t)

	note, err := f.notes.NewNote("Doomed", RootFolderID)
	if err != nil {
		t.Fatalf("create note: %v", err)
	}
	content := json.RawMessage(`{"text":"keep me"}`)
	if _, err := f.blocks.CreateNewBlock(note.ID, "text", 0, &content); err != nil {
		t.Fatalf("create block: %v", err)
	}

	deletedAt := time.Now().UTC().Add(time.Hour)
	err = f.conn.Transaction(func(tx *gorm.DB) error {
		return Apply(tx, Changes{Notes: []NoteDocument{{
			ID:        note.ID,
			Title:     "Doomed",
			FolderID:  RootFolderID,
			UserID:    model.LocalUserID,
			UpdatedAt: deletedAt,
			DeletedAt: &deletedAt,
			Blocks:    []BlockDocument{},
		}}})
	})
	if err != nil {
		t.Fatalf("apply tombstone: %v", err)
	}

	var blocks int64
	if err := f.conn.Model(&model.Block{}).Where("note_id = ?", note.ID).Count(&blocks).Error; err != nil {
		t.Fatalf("count blocks: %v", err)
	}
	if blocks != 1 {
		t.Errorf("%d blocks survived the tombstone, want 1; a restore would return an empty note", blocks)
	}
}

// An absent content field stored as "" is not valid JSON and fails to marshal on the next scan,
// which kills sync permanently and makes the note unopenable.
func TestABlockWithNoContentDoesNotPoisonTheNextScan(t *testing.T) {
	f := newFixture(t)

	stamp := time.Now().UTC()
	err := f.conn.Transaction(func(tx *gorm.DB) error {
		return Apply(tx, Changes{Notes: []NoteDocument{{
			ID:        "n-poison",
			Title:     "From the other device",
			FolderID:  RootFolderID,
			UserID:    model.LocalUserID,
			UpdatedAt: stamp,
			Blocks:    []BlockDocument{{ID: "b1", Type: "text", Index: 0}},
		}}})
	})
	if err != nil {
		t.Fatalf("apply: %v", err)
	}

	changes, err := f.store.ChangedSince(nil)
	if err != nil {
		t.Fatalf("changed since: %v", err)
	}
	if _, err := json.Marshal(request{Notes: changes.Notes, Folders: changes.Folders}); err != nil {
		t.Fatalf("the next scan cannot be encoded, so sync is dead: %v", err)
	}
}
