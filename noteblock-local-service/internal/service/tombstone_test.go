package service

import (
	"testing"

	"gorm.io/gorm"
	"server/internal/model"
)

func newFolderService(conn *gorm.DB) *FolderService {
	notes := &NoteService{DB: conn}
	return &FolderService{DB: conn, NoteService: notes}
}

func TestDeletedNoteIsHiddenFromReadsButKeptOnDisk(t *testing.T) {
	conn := newServiceTestDB(t)
	notes := &NoteService{DB: conn}
	note := seedNote(t, conn)

	if err := notes.DeleteNote(note.ID); err != nil {
		t.Fatalf("delete note: %v", err)
	}

	if _, err := notes.GetNote(note.ID); err == nil {
		t.Error("GetNote returned a deleted note")
	}

	var tombstoned int64
	if err := conn.Unscoped().Model(&model.Note{}).Where("id = ? AND deleted_at IS NOT NULL", note.ID).Count(&tombstoned).Error; err != nil {
		t.Fatalf("count tombstones: %v", err)
	}
	if tombstoned != 1 {
		t.Errorf("tombstone count = %d, want 1; sync cannot see the delete", tombstoned)
	}
}

func TestDeletedNoteKeepsItsBlocks(t *testing.T) {
	conn := newServiceTestDB(t)
	notes := &NoteService{DB: conn}
	blocks := &BlockService{DB: conn}
	note := seedNote(t, conn)

	if _, err := blocks.CreateNewBlock(note.ID, "text", 0, rawJSON(`{"text":"keep me"}`)); err != nil {
		t.Fatalf("create block: %v", err)
	}
	if err := notes.DeleteNote(note.ID); err != nil {
		t.Fatalf("delete note: %v", err)
	}

	var count int64
	if err := conn.Model(&model.Block{}).Where("note_id = ?", note.ID).Count(&count).Error; err != nil {
		t.Fatalf("count blocks: %v", err)
	}
	if count != 1 {
		t.Errorf("block count = %d, want 1; a restored note would come back empty", count)
	}
}

func TestDeletedNoteDisappearsFromItsFolderListing(t *testing.T) {
	conn := newServiceTestDB(t)
	notes := &NoteService{DB: conn}
	folders := newFolderService(conn)
	note := seedNote(t, conn)

	if err := notes.DeleteNote(note.ID); err != nil {
		t.Fatalf("delete note: %v", err)
	}

	tree, err := folders.GetFolderDtoById("f-top")
	if err != nil {
		t.Fatalf("get folder tree: %v", err)
	}
	if len(tree.Notes) != 0 {
		t.Errorf("folder still lists %d notes after delete", len(tree.Notes))
	}

	listed, err := notes.ListNotesByFolderId(&tree.ID)
	if err != nil {
		t.Fatalf("list notes: %v", err)
	}
	if len(listed) != 0 {
		t.Errorf("ListNotesByFolderId returned %d notes after delete", len(listed))
	}
}

func TestDeletingAFolderTombstonesEveryDescendant(t *testing.T) {
	conn := newServiceTestDB(t)
	folders := newFolderService(conn)
	notes := &NoteService{DB: conn}

	root := model.Folder{ID: "f-top", Name: "Coursework"}
	if err := conn.Create(&root).Error; err != nil {
		t.Fatalf("seed root: %v", err)
	}
	parent, err := folders.CreateNewFolder("Term", &root.ID)
	if err != nil {
		t.Fatalf("create parent: %v", err)
	}
	child, err := folders.CreateNewFolder("CS341", &parent.ID)
	if err != nil {
		t.Fatalf("create child: %v", err)
	}
	note, err := notes.NewNote("Midterm", &child.ID)
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	if err := folders.DeleteFolderAndContents(parent.ID); err != nil {
		t.Fatalf("delete folder: %v", err)
	}

	// Every descendant needs its own tombstone; another device merges each record on its own.
	for _, id := range []string{parent.ID, child.ID} {
		var count int64
		if err := conn.Unscoped().Model(&model.Folder{}).Where("id = ? AND deleted_at IS NOT NULL", id).Count(&count).Error; err != nil {
			t.Fatalf("count folder tombstone: %v", err)
		}
		if count != 1 {
			t.Errorf("folder %s has no tombstone", id)
		}
	}

	var noteTombstones int64
	if err := conn.Unscoped().Model(&model.Note{}).Where("id = ? AND deleted_at IS NOT NULL", note.ID).Count(&noteTombstones).Error; err != nil {
		t.Fatalf("count note tombstone: %v", err)
	}
	if noteTombstones != 1 {
		t.Error("note inside a deleted folder has no tombstone")
	}

	if _, err := folders.GetFolderByID(parent.ID); err == nil {
		t.Error("GetFolderByID returned a deleted folder")
	}
}

func TestRootTreeExcludesDeletedChildFolders(t *testing.T) {
	conn := newServiceTestDB(t)
	folders := newFolderService(conn)

	root := model.Folder{ID: "f-top", Name: "Coursework"}
	if err := conn.Create(&root).Error; err != nil {
		t.Fatalf("seed root: %v", err)
	}
	kept, err := folders.CreateNewFolder("Keep", &root.ID)
	if err != nil {
		t.Fatalf("create kept: %v", err)
	}
	removed, err := folders.CreateNewFolder("Remove", &root.ID)
	if err != nil {
		t.Fatalf("create removed: %v", err)
	}

	if err := folders.DeleteFolderAndContents(removed.ID); err != nil {
		t.Fatalf("delete folder: %v", err)
	}

	tree, err := folders.GetFolderDtoById("f-top")
	if err != nil {
		t.Fatalf("get tree: %v", err)
	}
	if len(tree.Children) != 1 {
		t.Fatalf("root has %d children, want 1", len(tree.Children))
	}
	if tree.Children[0].ID != kept.ID {
		t.Errorf("surviving child = %s, want %s", tree.Children[0].ID, kept.ID)
	}
}
