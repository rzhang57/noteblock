package sync

import (
	"encoding/json"
	"testing"
	"time"

	"server/internal/model"
)

// The cloud service reads these key names out of an untyped map, so a rename compiles and passes on
// both sides while every push is silently discarded. The literals below are the contract.
const goldenRequest = `{"since":"2026-01-02T03:04:05.123456789Z","notes":[{"id":"n1","title":"Lecture","folder_id":"f1","user_id":"00000000-0000-0000-0000-000000000001","updated_at":"2026-01-02T03:04:05.123456789Z","blocks":[{"id":"b1","type":"text","index":0,"content":{"text":"hello"}}]}],"folders":[{"id":"f1","name":"Term","parent_id":"root","user_id":"00000000-0000-0000-0000-000000000001","updated_at":"2026-01-02T03:04:05.123456789Z"}]}`

func TestRequestMarshalsToTheAgreedWireFormat(t *testing.T) {
	stamp := time.Date(2026, 1, 2, 3, 4, 5, 123456789, time.UTC)
	since := stamp.Format(time.RFC3339Nano)
	content := json.RawMessage(`{"text":"hello"}`)

	got, err := json.Marshal(request{
		Since: &since,
		Notes: []NoteDocument{{
			ID:        "n1",
			Title:     "Lecture",
			FolderID:  "f1",
			UserID:    model.LocalUserID,
			UpdatedAt: stamp,
			Blocks:    []BlockDocument{{ID: "b1", Type: "text", Index: 0, Content: content}},
		}},
		Folders: []FolderDocument{{
			ID:        "f1",
			Name:      "Term",
			ParentID:  ptr("root"),
			UserID:    model.LocalUserID,
			UpdatedAt: stamp,
		}},
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	if string(got) != goldenRequest {
		t.Errorf("the sync request wire format changed\n got: %s\nwant: %s", got, goldenRequest)
	}
}

func TestResponseUnmarshalsFromTheAgreedWireFormat(t *testing.T) {
	const golden = `{"notes":[{"id":"n1","title":"Lecture","folder_id":"f1","user_id":"u1","updated_at":"2026-01-02T03:04:05.123456789Z","deleted_at":null,"blocks":[{"id":"b1","type":"text","index":2,"content":{"text":"hi"}}]}],"folders":[{"id":"f1","name":"Term","parent_id":"root","user_id":"u1","updated_at":"2026-01-02T03:04:05.123456789Z"}],"server_time":"2026-01-02T03:04:06Z"}`

	var got response
	if err := json.Unmarshal([]byte(golden), &got); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	if got.ServerTime != "2026-01-02T03:04:06Z" {
		t.Errorf("server_time = %q; the pull cursor will never advance", got.ServerTime)
	}
	if len(got.Notes) != 1 || got.Notes[0].ID != "n1" || got.Notes[0].Title != "Lecture" {
		t.Fatalf("notes did not decode: %+v", got.Notes)
	}
	if len(got.Notes[0].Blocks) != 1 || got.Notes[0].Blocks[0].Index != 2 {
		t.Errorf("blocks did not decode: %+v", got.Notes[0].Blocks)
	}
	if string(got.Notes[0].Blocks[0].Content) != `{"text":"hi"}` {
		t.Errorf("block content = %s, want it passed through verbatim", got.Notes[0].Blocks[0].Content)
	}
	if len(got.Folders) != 1 || got.Folders[0].Name != "Term" {
		t.Errorf("folders did not decode: %+v", got.Folders)
	}
}
