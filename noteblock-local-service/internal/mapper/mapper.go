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

// Every block that crosses the IPC boundary goes through here, so a caller cannot be handed one
// without its content - the renderer types the response as a whole Block and renders it directly.
func ToBlockDTO(b model.Block) (dto.BlockDTO, error) {
	var raw json.RawMessage
	if err := json.Unmarshal([]byte(b.Content), &raw); err != nil {
		return dto.BlockDTO{}, err
	}

	return dto.BlockDTO{
		ID:        b.ID,
		Type:      b.Type,
		Index:     b.Index,
		Content:   raw,
		CreatedAt: b.CreatedAt,
		UpdatedAt: b.UpdatedAt,
	}, nil
}

func ToNoteDTO(note *model.Note) (*dto.NoteDTO, error) {
	var blocks []dto.BlockDTO

	if len(note.Blocks) == 0 || note.Blocks == nil {
		blocks = []dto.BlockDTO{}
	} else {
		for _, b := range note.Blocks {
			blockDTO, err := ToBlockDTO(b)
			if err != nil {
				return nil, err
			}

			blocks = append(blocks, blockDTO)
		}
	}

	return &dto.NoteDTO{
		ID:       note.ID,
		Title:    note.Title,
		FolderID: note.FolderID,
		Blocks:   blocks,
	}, nil
}
