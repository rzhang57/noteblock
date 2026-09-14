package ipc

import (
	"encoding/json"
	"testing"

	"server/internal/model/dto"
)

// The renderer types both responses as a whole Block and renders the returned object directly, so a
// response without content puts an empty block on screen until something else refetches the note.
// That is what "Image is missing its source" was: a pasted image block created, then rendered from
// a create response that never carried the url.
func TestBlockCreateAndUpdateEchoTheContentBack(t *testing.T) {
	srv := setupTestServer(t)
	noteID := seedNote(t, srv, "Pasted")

	created := srv.handle(Request{
		ID:     "create",
		Method: "block.create",
		Params: mustRaw(t, map[string]any{
			"note_id": noteID,
			"type":    "image",
			"index":   0,
			"content": map[string]any{"url": "noteblock-image:///abc_image.png", "strokes": []any{}},
		}),
	})
	if created.Error != nil {
		t.Fatalf("block.create failed: %+v", created.Error)
	}

	createdBlock, isDTO := created.Result.(dto.BlockDTO)
	if !isDTO {
		t.Fatalf("block.create returned %T, want dto.BlockDTO", created.Result)
	}
	if url := contentURL(t, createdBlock.Content); url != "noteblock-image:///abc_image.png" {
		t.Fatalf("block.create content url = %q, want the url that was written", url)
	}

	updated := srv.handle(Request{
		ID:     "update",
		Method: "block.update",
		Params: mustRaw(t, map[string]any{
			"note_id":  noteID,
			"block_id": createdBlock.ID,
			"type":     "image",
			"content":  map[string]any{"url": "noteblock-image:///def_image.png", "strokes": []any{}},
		}),
	})
	if updated.Error != nil {
		t.Fatalf("block.update failed: %+v", updated.Error)
	}

	updatedBlock, isDTO := updated.Result.(dto.BlockDTO)
	if !isDTO {
		t.Fatalf("block.update returned %T, want dto.BlockDTO", updated.Result)
	}
	if url := contentURL(t, updatedBlock.Content); url != "noteblock-image:///def_image.png" {
		t.Fatalf("block.update content url = %q, want the url that was written", url)
	}
}

// Responses are JSON before the renderer ever sees them, so the wire form is what has to carry it.
func TestBlockCreateContentSurvivesTheWire(t *testing.T) {
	srv := setupTestServer(t)
	noteID := seedNote(t, srv, "Pasted")

	created := srv.handle(Request{
		ID:     "create",
		Method: "block.create",
		Params: mustRaw(t, map[string]any{
			"note_id": noteID,
			"type":    "image",
			"index":   0,
			"content": map[string]any{"url": "noteblock-image:///wire_image.png"},
		}),
	})

	encoded, err := json.Marshal(created.Result)
	if err != nil {
		t.Fatalf("marshal result: %v", err)
	}

	var onTheWire struct {
		ID      string `json:"id"`
		Content struct {
			URL string `json:"url"`
		} `json:"content"`
	}
	if err := json.Unmarshal(encoded, &onTheWire); err != nil {
		t.Fatalf("unmarshal result: %v", err)
	}
	if onTheWire.ID == "" {
		t.Error("id missing from the json the renderer receives")
	}
	if onTheWire.Content.URL != "noteblock-image:///wire_image.png" {
		t.Fatalf("content.url on the wire = %q, want the url that was written", onTheWire.Content.URL)
	}
}

func contentURL(t *testing.T, raw json.RawMessage) string {
	t.Helper()

	var content struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(raw, &content); err != nil {
		t.Fatalf("block content is not an object: %v (%s)", err, raw)
	}
	return content.URL
}
