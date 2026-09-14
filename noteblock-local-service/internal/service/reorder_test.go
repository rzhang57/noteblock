package service

import (
	"encoding/json"
	"testing"

	"server/internal/model"
	"server/internal/model/dto"
)

func TestReorderBlocksAdvancesTheNote(t *testing.T) {
	conn := newServiceTestDB(t)
	note := seedNote(t, conn)
	blocks := &BlockService{DB: conn}

	content := json.RawMessage(`{"text":"body"}`)
	first, err := blocks.CreateNewBlock(note.ID, "text", 0, &content)
	if err != nil {
		t.Fatalf("create first block: %v", err)
	}
	second, err := blocks.CreateNewBlock(note.ID, "text", 1, &content)
	if err != nil {
		t.Fatalf("create second block: %v", err)
	}

	var before string
	conn.Raw("SELECT updated_at FROM notes WHERE id = ?", note.ID).Scan(&before)

	if err := blocks.ReorderBlocks(note.ID, []dto.BlockDTO{
		{ID: first.ID, Index: 1},
		{ID: second.ID, Index: 0},
	}); err != nil {
		t.Fatalf("reorder: %v", err)
	}

	var after string
	conn.Raw("SELECT updated_at FROM notes WHERE id = ?", note.ID).Scan(&after)
	if after == before {
		t.Error("reordering blocks did not advance notes.updated_at; sync will never see it")
	}
}

func TestBlockWritesFailAgainstATombstonedNote(t *testing.T) {
	conn := newServiceTestDB(t)
	note := seedNote(t, conn)
	notes := &NoteService{DB: conn}
	blocks := &BlockService{DB: conn}

	content := json.RawMessage(`{"text":"body"}`)
	if err := notes.DeleteNote(note.ID); err != nil {
		t.Fatalf("delete note: %v", err)
	}

	if _, err := blocks.CreateNewBlock(note.ID, "text", 0, &content); err == nil {
		t.Error("a block was created against a deleted note")
	}

	var orphans int64
	conn.Model(&model.Block{}).Where("note_id = ?", note.ID).Count(&orphans)
	if orphans != 0 {
		t.Errorf("%d blocks attached to a tombstoned note, want 0", orphans)
	}
}
