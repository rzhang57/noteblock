package ipc

import (
	"testing"
)

// A reorder that the handler later rejects must not survive, or it is a local edit sync never sees.
func TestNoteUpdateNeverLeavesARejectedReorderBehind(t *testing.T) {
	srv := setupTestServer(t)

	noteID, blockIDs := seedNoteWithTwoBlocks(t, srv, "Alpha")
	seedNote(t, srv, "Beta")

	before := blockIndexes(t, srv, noteID)
	beforeUpdatedAt := noteUpdatedAt(t, srv, noteID)

	res := srv.handle(Request{
		ID:     "reorder-conflict",
		Method: "note.update",
		Params: mustRaw(t, map[string]any{
			"id":    noteID,
			"title": "Beta",
			"blocks": []map[string]any{
				{"id": blockIDs[0], "index": 1},
				{"id": blockIDs[1], "index": 0},
			},
		}),
	})

	if res.Error == nil || res.Error.Code != "CONFLICT" {
		t.Fatalf("expected CONFLICT on a duplicate title, got %+v / %+v", res.Result, res.Error)
	}

	after := blockIndexes(t, srv, noteID)
	for id, index := range before {
		if after[id] != index {
			t.Errorf("block %s moved from index %d to %d on a rejected update", id, index, after[id])
		}
	}
	if noteUpdatedAt(t, srv, noteID) != beforeUpdatedAt {
		t.Error("a rejected note.update advanced notes.updated_at")
	}
}

func TestNoteUpdateReorderAdvancesTheNoteTimestamp(t *testing.T) {
	srv := setupTestServer(t)

	noteID, blockIDs := seedNoteWithTwoBlocks(t, srv, "Alpha")
	beforeUpdatedAt := noteUpdatedAt(t, srv, noteID)

	res := srv.handle(Request{
		ID:     "reorder",
		Method: "note.update",
		Params: mustRaw(t, map[string]any{
			"id": noteID,
			"blocks": []map[string]any{
				{"id": blockIDs[0], "index": 1},
				{"id": blockIDs[1], "index": 0},
			},
		}),
	})
	if res.Error != nil {
		t.Fatalf("note.update failed: %+v", res.Error)
	}

	indexes := blockIndexes(t, srv, noteID)
	if indexes[blockIDs[0]] != 1 || indexes[blockIDs[1]] != 0 {
		t.Fatalf("blocks were not reordered: %v", indexes)
	}
	if noteUpdatedAt(t, srv, noteID) == beforeUpdatedAt {
		t.Error("a block reorder did not advance notes.updated_at; sync will never see it")
	}
}

func seedNote(t *testing.T, srv *Server, title string) string {
	t.Helper()

	res := srv.handle(Request{
		ID:     "seed-note-" + title,
		Method: "note.create",
		Params: mustRaw(t, map[string]any{"title": title}),
	})
	if res.Error != nil {
		t.Fatalf("note.create failed: %+v", res.Error)
	}

	return res.Result.(map[string]any)["id"].(string)
}

func seedNoteWithTwoBlocks(t *testing.T, srv *Server, title string) (string, []string) {
	t.Helper()

	noteID := seedNote(t, srv, title)
	ids := make([]string, 0, 2)
	for i := range 2 {
		res := srv.handle(Request{
			ID:     "seed-block",
			Method: "block.create",
			Params: mustRaw(t, map[string]any{
				"note_id": noteID,
				"type":    "text",
				"index":   i,
				"content": map[string]any{"text": "body"},
			}),
		})
		if res.Error != nil {
			t.Fatalf("block.create failed: %+v", res.Error)
		}
		ids = append(ids, res.Result.(map[string]any)["id"].(string))
	}

	return noteID, ids
}

func blockIndexes(t *testing.T, srv *Server, noteID string) map[string]int {
	t.Helper()

	type row struct {
		ID    string
		Index int
	}
	var rows []row
	if err := srv.blockSvc.DB.Raw("SELECT id, `index` FROM blocks WHERE note_id = ?", noteID).Scan(&rows).Error; err != nil {
		t.Fatalf("read block indexes: %v", err)
	}

	indexes := make(map[string]int, len(rows))
	for _, r := range rows {
		indexes[r.ID] = r.Index
	}

	return indexes
}

func noteUpdatedAt(t *testing.T, srv *Server, noteID string) string {
	t.Helper()

	var updatedAt string
	if err := srv.blockSvc.DB.Raw("SELECT updated_at FROM notes WHERE id = ?", noteID).Scan(&updatedAt).Error; err != nil {
		t.Fatalf("read note updated_at: %v", err)
	}

	return updatedAt
}
