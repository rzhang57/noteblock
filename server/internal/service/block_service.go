package service

import (
	"gorm.io/gorm"
	"server/internal/model"
)

type BlockService struct {
	DB *gorm.DB
}

func (s *BlockService) CreateNewBlock(noteID string, blockType string, index int) (*model.Block, error) {
	block := &model.Block{
		NoteID: noteID,
		Type:   blockType,
		Index:  index,
	}
	if err := s.DB.Create(block).Error; err != nil {
		return nil, err
	}

	switch blockType {
	case model.BlockTypeText:
		textBlock := &model.TextBlock{ID: block.ID, Text: ""}
		s.DB.Create(textBlock)
	}

	return block, nil
}
