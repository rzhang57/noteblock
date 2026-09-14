package ipc

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"server/internal/db"
	"server/internal/model"
	"server/internal/model/dto"
	"server/internal/service"
)

func setupTestServer(t *testing.T) *Server {
	t.Helper()

	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "ipc_test.sqlite")
	database, err := db.Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open test sqlite db: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("failed to get sql db handle: %v", err)
	}
	t.Cleanup(func() {
		_ = sqlDB.Close()
	})

	if err := database.Create(&model.Folder{ID: "f-top", Name: "Coursework"}).Error; err != nil {
		t.Fatalf("failed to seed folder: %v", err)
	}

	_ = os.Setenv("NOTE_DB_PATH", tmpDir)
	t.Cleanup(func() {
		_ = os.Unsetenv("NOTE_DB_PATH")
	})

	noteSvc := &service.NoteService{DB: database}
	folderSvc := &service.FolderService{DB: database, NoteService: noteSvc}
	blockSvc := &service.BlockService{DB: database}
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
		Params: mustRaw(t, map[string]any{"name": "Projects", "parent_id": "f-top"}),
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

func TestIPCServer_HandlerPanicIsContainedAndServerKeepsServing(t *testing.T) {
	s := setupTestServer(t)
	s.handlers["test.panic"] = func(Request) Response {
		panic("boom")
	}

	in := strings.NewReader(
		`{"id":"1","method":"test.panic","params":{}}` + "\n" +
			`{"id":"2","method":"folder.get","params":{"id":"f-top"}}` + "\n")
	var out bytes.Buffer

	if err := s.Run(in, &out); err != nil {
		t.Fatalf("Run returned error after handler panic: %v", err)
	}

	dec := json.NewDecoder(&out)
	var panicRes, nextRes Response
	if err := dec.Decode(&panicRes); err != nil {
		t.Fatalf("failed to decode panic response: %v", err)
	}
	if err := dec.Decode(&nextRes); err != nil {
		t.Fatalf("no response to the request after the panic: %v", err)
	}

	if panicRes.ID != "1" || panicRes.Error == nil || panicRes.Error.Code != "INTERNAL" {
		t.Fatalf("expected INTERNAL error for id=1, got %+v", panicRes)
	}
	if nextRes.ID != "2" || nextRes.Error != nil {
		t.Fatalf("expected the request after the panic to succeed, got %+v", nextRes)
	}
}

// folder.tree is now the sidebar's only load path, and a new IPC method has to be exercised at the
// dispatcher, not just at the service wrapper.
func TestIPCServer_FolderTreeSynthesizesTheTopLevel(t *testing.T) {
	srv := setupTestServer(t)

	topRes := srv.handle(Request{
		ID: "1", Method: "folder.create",
		Params: mustRaw(t, map[string]any{"name": "Term", "parent_id": ""}),
	})
	if topRes.Error != nil {
		t.Fatalf("folder.create failed: %+v", topRes.Error)
	}
	topID := topRes.Result.(map[string]any)["id"].(string)

	nestedRes := srv.handle(Request{
		ID: "2", Method: "folder.create",
		Params: mustRaw(t, map[string]any{"name": "Week 1", "parent_id": topID}),
	})
	if nestedRes.Error != nil {
		t.Fatalf("nested folder.create failed: %+v", nestedRes.Error)
	}
	nestedID := nestedRes.Result.(map[string]any)["id"].(string)

	noteRes := srv.handle(Request{
		ID: "3", Method: "note.create",
		Params: mustRaw(t, map[string]any{"title": "Loose note", "folder_id": ""}),
	})
	if noteRes.Error != nil {
		t.Fatalf("top-level note.create failed: %+v", noteRes.Error)
	}

	treeRes := srv.handle(Request{ID: "4", Method: "folder.tree", Params: mustRaw(t, map[string]any{})})
	if treeRes.Error != nil {
		t.Fatalf("folder.tree failed: %+v", treeRes.Error)
	}

	tree, err := json.Marshal(treeRes.Result)
	if err != nil {
		t.Fatalf("marshal tree: %v", err)
	}
	var got struct {
		ID       string  `json:"id"`
		ParentID *string `json:"parent_id"`
		Children []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"children"`
		Notes []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		} `json:"notes"`
	}
	if err := json.Unmarshal(tree, &got); err != nil {
		t.Fatalf("decode tree: %v", err)
	}

	if got.ParentID != nil {
		t.Errorf("tree parent_id = %v, want null", *got.ParentID)
	}
	var sawTop, sawNested bool
	for _, c := range got.Children {
		sawTop = sawTop || c.ID == topID
		sawNested = sawNested || c.ID == nestedID
	}
	if !sawTop {
		t.Errorf("children = %+v, want the top-level folder among them", got.Children)
	}
	if sawNested {
		t.Error("a nested folder was reported at the top level")
	}
	if len(got.Notes) != 1 || got.Notes[0].Title != "Loose note" {
		t.Errorf("notes = %+v, want the top-level note", got.Notes)
	}
}

func TestIPCServer_EmptyParentMeansTopLevelAndOmittedMeansUnchanged(t *testing.T) {
	srv := setupTestServer(t)

	parent := srv.handle(Request{
		ID: "1", Method: "folder.create",
		Params: mustRaw(t, map[string]any{"name": "Parent", "parent_id": ""}),
	})
	parentID := parent.Result.(map[string]any)["id"].(string)

	child := srv.handle(Request{
		ID: "2", Method: "folder.create",
		Params: mustRaw(t, map[string]any{"name": "Child", "parent_id": parentID}),
	})
	if child.Error != nil {
		t.Fatalf("folder.create failed: %+v", child.Error)
	}
	childID := child.Result.(map[string]any)["id"].(string)

	if got := folderParent(t, srv, childID); got == nil || *got != parentID {
		t.Fatalf("child parent = %v, want %s; a supplied parent was ignored", got, parentID)
	}

	if res := srv.handle(Request{
		ID: "3", Method: "folder.update",
		Params: mustRaw(t, map[string]any{"current_id": childID, "name": "Child"}),
	}); res.Error != nil {
		t.Fatalf("folder.update failed: %+v", res.Error)
	}
	if got := folderParent(t, srv, childID); got == nil || *got != parentID {
		t.Errorf("omitting parent_id moved the folder to %v, want it left under %s", got, parentID)
	}

	if res := srv.handle(Request{
		ID: "4", Method: "folder.update",
		Params: mustRaw(t, map[string]any{"current_id": childID, "name": "Child", "parent_id": ""}),
	}); res.Error != nil {
		t.Fatalf("folder.update to top level failed: %+v", res.Error)
	}
	if got := folderParent(t, srv, childID); got != nil {
		t.Errorf("an explicit empty parent left the folder under %v, want top level", *got)
	}
}

func folderParent(t *testing.T, srv *Server, id string) *string {
	t.Helper()

	var parent *string
	if err := srv.blockSvc.DB.Raw("SELECT parent_id FROM folders WHERE id = ?", id).Scan(&parent).Error; err != nil {
		t.Fatalf("read parent: %v", err)
	}

	return parent
}
