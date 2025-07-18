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

func (s *BlockService) CreateNewBlock(noteID string, blockType string, index int, content *json.RawMessage) (*model.Block, error) { // should this somehow handle both creation and update of blocks?
	var block *model.Block

	err := s.DB.Transaction(func(tx *gorm.DB) error {
		block = &model.Block{
			NoteID: noteID,
			Type:   blockType,
			Index:  index,
		}

		if err := tx.Create(block).Error; err != nil {
			return err
		}
		if err := s.createBlockContent(block.ID, block.Type, content, tx.Create); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return block, nil
}

func (s *BlockService) UpdateBlockContent(noteID string, blockID string, blockType string, content *json.RawMessage) (*model.Block, error) {
	var block model.Block

	err := s.DB.Transaction(func(tx *gorm.DB) error {
		// find existing block to update
		err := tx.First(&block, "id = ? AND note_id = ?", blockID, noteID).Error
		if err != nil {
			return err
		}

		if block.Type != blockType {
			err := tx.Where("id = ?", blockID).Delete(model.BlockTypeToModel[block.Type]).Error
			if err != nil {
				return err
			}
			// update block metadata type
			block.Type = blockType
			if err := tx.Save(&block).Error; err != nil {
				return err
			}
			if err := s.createBlockContent(block.ID, block.Type, content, tx.Create); err != nil {
				return err
			}
		} else {
			if content != nil {
				if err := s.createBlockContent(block.ID, block.Type, content, tx.Save); err != nil {
					return err
				}
			}
		}

		return nil
	})

	return &block, err
}

// TODO: for image and canvas blocks, we need to be able to handle a request that holds a json object and store that json object as a string in the database.
// When we fetch the block, we should be able to convert it back from a string to a json object when returning to the client
// essentially, encode and decode the json object as a string in the database
func (s *BlockService) createBlockContent(blockID string, blockType string, content *json.RawMessage, operation func(interface{}) *gorm.DB) error {
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
			return errors.New("Content for text block cannot be nil (missing text field)")
		}
		textBlock := &model.TextBlock{
			ID:   blockID,
			Text: textContent.Text,
		}
		if err := operation(textBlock).Error; err != nil {
			return err
		}
	case model.BlockTypeCanvas:
		var canvasContent struct {
			Data *json.RawMessage `json:"data"`
		}
		if content != nil {
			if err := json.Unmarshal(*content, &canvasContent); err != nil {
				return err
			}
		} else {
			return errors.New("Content for canvas block cannot be nil")
		}
		jsonString, err := EncodeJsonToString(canvasContent.Data)
		if err != nil {
			return err
		}
		canvasBlock := &model.CanvasBlock{
			ID:   blockID,
			Data: jsonString,
		}
		if err := operation(canvasBlock).Error; err != nil {
			return err
		}
	case model.BlockTypeImage:
		var imageContent struct {
			Path string           `json:"path"`
			Data *json.RawMessage `json:"data"`
		}
		if content != nil {
			if err := json.Unmarshal(*content, &imageContent); err != nil {
				return err
			}
		} else {
			return errors.New("Content for image block cannot be nil")
		}
		jsonString, err := EncodeJsonToString(imageContent.Data)
		if err != nil {
			return err
		}
		imageBlock := &model.ImageBlock{
			ID:   blockID,
			Path: imageContent.Path,
			Data: jsonString,
		}
		if err := operation(imageBlock).Error; err != nil {
			return err
		}
	default:
		return errors.New("Unsupported block type")
	}
	return nil
}
