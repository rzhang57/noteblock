package service

import (
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"server/internal/db"
	"server/internal/model"
)

func newServiceTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	conn, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "test.sqlite")), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() {
		if sqlDB, err := conn.DB(); err == nil {
			sqlDB.Close()
		}
	})

	// Match InitDb, or foreign keys go unenforced here and the tests are laxer than production.
	conn.Exec("PRAGMA foreign_keys = ON")

	if err := db.Migrate(conn, db.Migrations); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	return conn
}

func seedNote(t *testing.T, conn *gorm.DB) *model.Note {
	t.Helper()

	folder := model.Folder{ID: "root", Name: "Root"}
	if err := conn.Create(&folder).Error; err != nil {
		t.Fatalf("seed folder: %v", err)
	}
	note := model.Note{Title: "Notes", FolderID: folder.ID}
	if err := conn.Create(&note).Error; err != nil {
		t.Fatalf("seed note: %v", err)
	}

	return &note
}

func noteUpdatedAt(t *testing.T, conn *gorm.DB, noteID string) time.Time {
	t.Helper()

	var note model.Note
	if err := conn.First(&note, "id = ?", noteID).Error; err != nil {
		t.Fatalf("read note: %v", err)
	}

	return note.UpdatedAt
}

func rawJSON(s string) *json.RawMessage {
	raw := json.RawMessage(s)
	return &raw
}

// Without this, the sync scan silently skips every note whose only change was a block edit.
func TestBlockWritesTouchTheParentNote(t *testing.T) {
	tests := map[string]func(t *testing.T, svc *BlockService, note *model.Note, blockID string){
		"create": func(t *testing.T, svc *BlockService, note *model.Note, _ string) {
			if _, err := svc.CreateNewBlock(note.ID, "text", 1, rawJSON(`{"text":"second"}`)); err != nil {
				t.Fatalf("create block: %v", err)
			}
		},
		"update": func(t *testing.T, svc *BlockService, note *model.Note, blockID string) {
			if _, err := svc.UpdateBlockContent(note.ID, blockID, "text", rawJSON(`{"text":"edited"}`)); err != nil {
				t.Fatalf("update block: %v", err)
			}
		},
		"delete": func(t *testing.T, svc *BlockService, note *model.Note, blockID string) {
			if err := svc.DeleteBlock(note.ID, blockID); err != nil {
				t.Fatalf("delete block: %v", err)
			}
		},
	}

	for name, write := range tests {
		t.Run(name, func(t *testing.T) {
			conn := newServiceTestDB(t)
			svc := &BlockService{DB: conn}
			note := seedNote(t, conn)

			block, err := svc.CreateNewBlock(note.ID, "text", 0, rawJSON(`{"text":"first"}`))
			if err != nil {
				t.Fatalf("seed block: %v", err)
			}

			before := noteUpdatedAt(t, conn, note.ID)
			time.Sleep(10 * time.Millisecond)
			write(t, svc, note, block.ID)
			after := noteUpdatedAt(t, conn, note.ID)

			if !after.After(before) {
				t.Errorf("note.UpdatedAt did not advance on block %s: before=%v after=%v", name, before, after)
			}
		})
	}
}

func TestAFailedBlockCreateLeavesNothingBehind(t *testing.T) {
	conn := newServiceTestDB(t)
	svc := &BlockService{DB: conn}
	seedNote(t, conn)

	if _, err := svc.CreateNewBlock("no-such-note", "text", 0, rawJSON(`{"text":"x"}`)); err == nil {
		t.Fatal("expected a foreign key violation for an unknown note")
	}

	var blocks int64
	if err := conn.Model(&model.Block{}).Count(&blocks).Error; err != nil {
		t.Fatalf("count blocks: %v", err)
	}
	if blocks != 0 {
		t.Errorf("block count = %d, want 0; the failed create was not rolled back", blocks)
	}
}

// Overwriting a pulled record's id would re-push it as a new row on every sync pass.
func TestCreatePreservesAProvidedID(t *testing.T) {
	conn := newServiceTestDB(t)

	folder := model.Folder{ID: "root", Name: "Root"}
	if err := conn.Create(&folder).Error; err != nil {
		t.Fatalf("create folder: %v", err)
	}

	note := model.Note{ID: "note-from-another-device", Title: "Pulled", FolderID: folder.ID}
	if err := conn.Create(&note).Error; err != nil {
		t.Fatalf("create note: %v", err)
	}
	if note.ID != "note-from-another-device" {
		t.Errorf("note.ID = %q, want the provided id", note.ID)
	}

	block := model.Block{ID: "block-from-another-device", NoteID: note.ID, Type: "text", Content: "{}"}
	if err := conn.Create(&block).Error; err != nil {
		t.Fatalf("create block: %v", err)
	}
	if block.ID != "block-from-another-device" {
		t.Errorf("block.ID = %q, want the provided id", block.ID)
	}
}

func TestCreateStillGeneratesAnIDWhenNoneIsGiven(t *testing.T) {
	conn := newServiceTestDB(t)
	note := seedNote(t, conn)

	if note.ID == "" {
		t.Fatal("note.ID is empty; local creates must still get a generated id")
	}

	block := model.Block{NoteID: note.ID, Type: "text", Content: "{}"}
	if err := conn.Create(&block).Error; err != nil {
		t.Fatalf("create block: %v", err)
	}
	if block.ID == "" {
		t.Error("block.ID is empty; local creates must still get a generated id")
	}
}
