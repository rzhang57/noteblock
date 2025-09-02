package service

import (
	"encoding/json"
	"gorm.io/gorm"
	"server/internal/model"
)

type BlockService struct {
	DB *gorm.DB
}

// TODO: for non-plugin blocks, we can assert type and json content fields by unmarshalling before storing
func (s *BlockService) CreateNewBlock(noteID string, blockType string, index int, content *json.RawMessage) (*model.Block, error) { // should this somehow handle both creation and update of blocks?
	jsonString, err := EncodeJsonToString(content)
	if err != nil {
		return nil, err
	}

	block := &model.Block{
		NoteID:  noteID,
		Type:    blockType,
		Index:   index,
		Content: jsonString,
	}

	if err := s.DB.Create(block).Error; err != nil {
		return nil, err
	}

	return block, nil
}

// TODO: for non-plugin blocks, we can assert type and json content fields by unmarshalling before storing
func (s *BlockService) UpdateBlockContent(noteID string, blockID string, blockType string, content *json.RawMessage) (*model.Block, error) {
	var block model.Block

	err := s.DB.First(&block, "id = ? AND note_id = ?", blockID, noteID).Error
	if err != nil {
		return nil, err
	}

	jsonString, err := EncodeJsonToString(content)
	if err != nil {
		return nil, err
	}

	block.Type = blockType
	block.Content = jsonString
	if err := s.DB.Save(&block).Error; err != nil {
		return nil, err
	}

	return &block, err
}

func (s *BlockService) DeleteBlock(noteID string, blockID string) error {
	return s.DB.Delete(&model.Block{}, "id = ? AND note_id = ?", blockID, noteID).Error
}
