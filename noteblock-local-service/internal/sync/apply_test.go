package sync

import (
	"testing"
	"time"

	"gorm.io/gorm"
	"server/internal/model"
)

func ptr(s string) *string { return &s }

// The server orders by its own write time, which says nothing about parentage. A payload
// that arrives child-first must still apply, or the transaction rolls back, the cursors
// never advance, and every later pass replays the same failure forever.
func TestFoldersApplyRegardlessOfOrder(t *testing.T) {
	f := newFixture(t)
	now := time.Now().UTC()

	incoming := Changes{Folders: []FolderDocument{
		{ID: "child", Name: "CS341", ParentID: ptr("parent"), UserID: model.LocalUserID, UpdatedAt: now},
		{ID: "parent", Name: "Term", ParentID: nil, UserID: model.LocalUserID, UpdatedAt: now},
	}}

	if err := f.conn.Transaction(func(tx *gorm.DB) error { return Apply(tx, incoming) }); err != nil {
		t.Fatalf("child-before-parent payload failed to apply: %v", err)
	}

	var child model.Folder
	if err := f.conn.First(&child, "id = ?", "child").Error; err != nil {
		t.Fatalf("child folder missing: %v", err)
	}
	if child.ParentID == nil || *child.ParentID != "parent" {
		t.Errorf("child.ParentID = %v, want parent", child.ParentID)
	}
}

func TestNotesApplyBeforeTheFolderTheyPointAt(t *testing.T) {
	f := newFixture(t)
	now := time.Now().UTC()

	incoming := Changes{
		Notes: []NoteDocument{
			{ID: "n1", Title: "Lecture", FolderID: ptr("late-folder"), UserID: model.LocalUserID, UpdatedAt: now, Blocks: []BlockDocument{}},
		},
		Folders: []FolderDocument{
			{ID: "late-folder", Name: "CS341", ParentID: nil, UserID: model.LocalUserID, UpdatedAt: now},
		},
	}

	if err := f.conn.Transaction(func(tx *gorm.DB) error { return Apply(tx, incoming) }); err != nil {
		t.Fatalf("note referencing a folder later in the payload failed: %v", err)
	}

	var note model.Note
	if err := f.conn.First(&note, "id = ?", "n1").Error; err != nil {
		t.Fatalf("note missing: %v", err)
	}
}

// A reference to a folder that is in neither the payload nor the database is a genuinely
// broken document and must still fail rather than land a dangling row.
func TestAnOrphanedReferenceStillFails(t *testing.T) {
	f := newFixture(t)
	now := time.Now().UTC()

	incoming := Changes{Folders: []FolderDocument{
		{ID: "orphan", Name: "Nowhere", ParentID: ptr("does-not-exist"), UserID: model.LocalUserID, UpdatedAt: now},
	}}

	if err := f.conn.Transaction(func(tx *gorm.DB) error { return Apply(tx, incoming) }); err == nil {
		t.Error("an orphaned parent reference was accepted")
	}

	var count int64
	if err := f.conn.Unscoped().Model(&model.Folder{}).Where("id = ?", "orphan").Count(&count).Error; err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 0 {
		t.Error("the dangling folder was committed anyway")
	}
}

// A database that synced before the root folder was dropped still has documents in the cloud
// pointing at it. Left intact they fail the deferred foreign key at commit, and because the cursors
// move inside that transaction every later pass replays the same payload.
func TestAPulledLegacyRootReferenceDoesNotWedgeSync(t *testing.T) {
	f := newFixture(t)

	stamp := time.Now().UTC()
	err := f.conn.Transaction(func(tx *gorm.DB) error {
		return Apply(tx, Changes{
			Folders: []FolderDocument{{
				ID:        "legacy-folder",
				Name:      "CS341",
				ParentID:  ptr("root"),
				UserID:    model.LocalUserID,
				UpdatedAt: stamp,
			}},
			Notes: []NoteDocument{{
				ID:        "legacy-note",
				Title:     "Top level",
				FolderID:  ptr("root"),
				UserID:    model.LocalUserID,
				UpdatedAt: stamp,
				Blocks:    []BlockDocument{},
			}},
		})
	})
	if err != nil {
		t.Fatalf("a legacy root reference wedged the pull: %v", err)
	}

	var folder model.Folder
	if err := f.conn.First(&folder, "id = ?", "legacy-folder").Error; err != nil {
		t.Fatalf("folder not applied: %v", err)
	}
	if folder.ParentID != nil {
		t.Errorf("folder parent = %v, want nil", *folder.ParentID)
	}

	var note model.Note
	if err := f.conn.First(&note, "id = ?", "legacy-note").Error; err != nil {
		t.Fatalf("note not applied: %v", err)
	}
	if note.FolderID != nil {
		t.Errorf("note folder = %v, want nil", *note.FolderID)
	}
}
