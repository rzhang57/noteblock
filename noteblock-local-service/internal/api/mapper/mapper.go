package mapper

import (
	"encoding/json"
	"server/internal/model"
	"server/internal/model/dto"
)

func ToBlockModel(blockDTO dto.BlockDTO, noteID string) (*model.Block, error) {
	contentBytes, err := json.Marshal(blockDTO.Content)
	if err != nil {
		return nil, err
	}

	return &model.Block{
		ID:        blockDTO.ID,
		NoteID:    noteID,
		Type:      blockDTO.Type,
		Index:     blockDTO.Index,
		Content:   string(contentBytes),
		CreatedAt: blockDTO.CreatedAt,
		UpdatedAt: blockDTO.UpdatedAt,
	}, nil
}

func ToNoteDTO(note *model.Note) (*dto.NoteDTO, error) {
	var blocks []dto.BlockDTO

	if len(note.Blocks) == 0 || note.Blocks == nil {
		blocks = []dto.BlockDTO{}
	} else {
		for _, b := range note.Blocks {
			var raw json.RawMessage
			if err := json.Unmarshal([]byte(b.Content), &raw); err != nil {
				return nil, err
			}

			blocks = append(blocks, dto.BlockDTO{
				ID:        b.ID,
				Type:      b.Type,
				Index:     b.Index,
				Content:   raw,
				CreatedAt: b.CreatedAt,
				UpdatedAt: b.UpdatedAt,
			})
		}
	}

	return &dto.NoteDTO{
		ID:       note.ID,
		Title:    note.Title,
		FolderID: note.FolderID,
		Blocks:   blocks,
	}, nil
}
