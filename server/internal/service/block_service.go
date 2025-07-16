package service

import (
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"server/internal/model"
)

type BlockService struct {
	DB *gorm.DB
}

func (s *BlockService) CreateNewBlock(noteID string, blockType string, index int, content *json.RawMessage) (*model.Block, error) {
	var block *model.Block

	err := s.DB.Transaction(func(tx *gorm.DB) error {
		block = &model.Block{
			NoteID: noteID,
			Type:   blockType,
			Index:  index,
		}

		if err := s.DB.Create(block).Error; err != nil {
			return err
		}

		switch blockType {
		case model.BlockTypeText:
			var textContent struct {
				Text string `json:"text"`
			}
			if content != nil {
				if err := json.Unmarshal(*content, &textContent); err != nil {
					return err
				}
			} else {
				return errors.New("Content for text block cannot be nil")
			}
			textBlock := &model.TextBlock{
				ID:   block.ID,
				Text: textContent.Text,
			}
			if err := s.DB.Create(textBlock).Error; err != nil {
				return err
			}

		case model.BlockTypeCanvas:
			var canvasContent struct {
				Data string `json:"data"`
			}
			if content != nil {
				if err := json.Unmarshal(*content, &canvasContent); err != nil {
					return err
				}
			} else {
				return errors.New("Content for canvas block cannot be nil")
			}
			canvasBlock := &model.CanvasBlock{
				ID:   block.ID,
				Data: canvasContent.Data,
			}
			if err := s.DB.Create(canvasBlock).Error; err != nil {
				return err
			}

		case model.BlockTypeImage:
			var imageContent struct {
				Path string `json:"path"`
				Data string `json:"data"`
			}
			if content != nil {
				if err := json.Unmarshal(*content, &imageContent); err != nil {
					return err
				}
			} else {
				return errors.New("Content for image block cannot be nil")
			}
			imageBlock := &model.ImageBlock{
				ID:   block.ID,
				Path: imageContent.Path,
				Data: imageContent.Data,
			}
			if err := s.DB.Create(imageBlock).Error; err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		return nil, err
	}

	return block, nil
}
