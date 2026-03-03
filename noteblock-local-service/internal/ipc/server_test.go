package ipc

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"server/internal/model"
	"server/internal/model/dto"
	"server/internal/service"
)

func setupTestServer(t *testing.T) *Server {
	t.Helper()

	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "ipc_test.sqlite")
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open test sqlite db: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("failed to get sql db handle: %v", err)
	}
	t.Cleanup(func() {
		_ = sqlDB.Close()
	})

	if err := db.AutoMigrate(&model.Block{}, &model.Note{}, &model.Folder{}); err != nil {
		t.Fatalf("failed to migrate test schema: %v", err)
	}
	if err := db.Create(&model.Folder{ID: "root", Name: "Root"}).Error; err != nil {
		t.Fatalf("failed to create root folder: %v", err)
	}

	_ = os.Setenv("NOTE_DB_PATH", tmpDir)
	t.Cleanup(func() {
		_ = os.Unsetenv("NOTE_DB_PATH")
	})

	noteSvc := &service.NoteService{DB: db}
	folderSvc := &service.FolderService{DB: db, NoteService: noteSvc}
	blockSvc := &service.BlockService{DB: db}
	return NewServer(noteSvc, folderSvc, blockSvc)
}

func mustRaw(t *testing.T, v any) json.RawMessage {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("failed to marshal test payload: %v", err)
	}
	return b
}

func TestIPCServer_SmokeCRUDFlow(t *testing.T) {
	srv := setupTestServer(t)

	createFolderRes := srv.handle(Request{
		ID:     "1",
		Method: "folder.create",
		Params: mustRaw(t, map[string]any{"name": "Projects", "parent_id": "root"}),
	})
	if createFolderRes.Error != nil {
		t.Fatalf("folder.create failed: %+v", createFolderRes.Error)
	}
	folderMap := createFolderRes.Result.(map[string]any)
	folderID := folderMap["id"].(string)

	createNoteRes := srv.handle(Request{
		ID:     "2",
		Method: "note.create",
		Params: mustRaw(t, map[string]any{"title": "Spec", "folder_id": folderID}),
	})
	if createNoteRes.Error != nil {
		t.Fatalf("note.create failed: %+v", createNoteRes.Error)
	}
	noteID := createNoteRes.Result.(map[string]any)["id"].(string)

	createBlockRes := srv.handle(Request{
		ID:     "3",
		Method: "block.create",
		Params: mustRaw(t, map[string]any{
			"note_id": noteID,
			"type":    "text",
			"index":   0,
			"content": map[string]any{"text": "hello"},
		}),
	})
	if createBlockRes.Error != nil {
		t.Fatalf("block.create failed: %+v", createBlockRes.Error)
	}
	blockID := createBlockRes.Result.(map[string]any)["id"].(string)

	getNoteRes := srv.handle(Request{
		ID:     "4",
		Method: "note.get",
		Params: mustRaw(t, map[string]any{"id": noteID}),
	})
	if getNoteRes.Error != nil {
		t.Fatalf("note.get failed: %+v", getNoteRes.Error)
	}
	noteDTO, ok := getNoteRes.Result.(*dto.NoteDTO)
	if !ok {
		t.Fatalf("expected *dto.NoteDTO from note.get, got %T", getNoteRes.Result)
	}
	if len(noteDTO.Blocks) != 1 {
		t.Fatalf("expected one block, got %d", len(noteDTO.Blocks))
	}

	updateNoteRes := srv.handle(Request{
		ID:     "5",
		Method: "note.update",
		Params: mustRaw(t, map[string]any{
			"id":        noteID,
			"title":     "Spec v2",
			"folder_id": folderID,
			"blocks": []map[string]any{
				{"id": blockID, "index": 0},
			},
		}),
	})
	if updateNoteRes.Error != nil {
		t.Fatalf("note.update failed: %+v", updateNoteRes.Error)
	}

	deleteBlockRes := srv.handle(Request{
		ID:     "6",
		Method: "block.delete",
		Params: mustRaw(t, map[string]any{"note_id": noteID, "block_id": blockID}),
	})
	if deleteBlockRes.Error != nil {
		t.Fatalf("block.delete failed: %+v", deleteBlockRes.Error)
	}

	deleteNoteRes := srv.handle(Request{
		ID:     "7",
		Method: "note.delete",
		Params: mustRaw(t, map[string]any{"id": noteID}),
	})
	if deleteNoteRes.Error != nil {
		t.Fatalf("note.delete failed: %+v", deleteNoteRes.Error)
	}

	deleteFolderRes := srv.handle(Request{
		ID:     "8",
		Method: "folder.delete",
		Params: mustRaw(t, map[string]any{"id": folderID}),
	})
	if deleteFolderRes.Error != nil {
		t.Fatalf("folder.delete failed: %+v", deleteFolderRes.Error)
	}
}

func TestIPCServer_UnknownMethod(t *testing.T) {
	srv := setupTestServer(t)
	res := srv.handle(Request{
		ID:     "x",
		Method: "does.not.exist",
		Params: mustRaw(t, map[string]any{}),
	})
	if res.Error == nil || res.Error.Code != "METHOD_NOT_FOUND" {
		t.Fatalf("expected METHOD_NOT_FOUND, got: %+v", res.Error)
	}
}
