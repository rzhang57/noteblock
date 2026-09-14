package service

import (
	"encoding/json"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"os"
	"path/filepath"
	"server/internal/model"
	"server/internal/model/dto"
	"time"
)

type BlockService struct {
	DB *gorm.DB
}

func (s *BlockService) SaveImageBytes(fileName string, data []byte) (string, error) {
	newImageUuid := uuid.NewString()
	// The name reaches here from the renderer; without Base a "../.." escapes the images directory,
	// which sync now also writes into.
	imageName := newImageUuid + "_" + filepath.Base(fileName)

	basePath := os.Getenv("NOTE_DB_PATH")
	if basePath == "" {
		basePath = "data"
	}
	imagesDir := filepath.Join(basePath, "uploads", "images")
	if err := os.MkdirAll(imagesDir, os.ModePerm); err != nil {
		return "", err
	}

	fsPath := filepath.Join(imagesDir, imageName)
	if err := os.WriteFile(fsPath, data, 0o644); err != nil {
		return "", err
	}

	return "noteblock-image:///" + imageName, nil
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

	if err := s.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(block).Error; err != nil {
			return err
		}
		return touchNote(tx, noteID)
	}); err != nil {
		return nil, err
	}

	return block, nil
}

// Reordering is a block write like any other, so it belongs in one transaction with the note touch
// rather than in the handler, where it silently bypassed both.
func (s *BlockService) ReorderBlocks(noteID string, blocks []dto.BlockDTO) error {
	return s.DB.Transaction(func(tx *gorm.DB) error {
		for _, block := range blocks {
			if err := tx.Model(&model.Block{}).
				Where("id = ? AND note_id = ?", block.ID, noteID).
				Update("index", block.Index).Error; err != nil {
				return err
			}
		}

		return touchNote(tx, noteID)
	})
}

// The sync scan reads notes.updated_at, so block writes have to advance it too.
func touchNote(tx *gorm.DB, noteID string) error {
	result := tx.Model(&model.Note{}).Where("id = ?", noteID).Update("updated_at", time.Now().UTC())
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// TODO: for non-plugin blocks, we can assert type and json content fields by unmarshalling before storing
func (s *BlockService) UpdateBlockContent(noteID string, blockID string, blockType string, content *json.RawMessage) (*model.Block, error) {
	jsonString, err := EncodeJsonToString(content)
	if err != nil {
		return nil, err
	}

	// Read and write in one transaction: the sync goroutine is a second writer, and a pull landing
	// between them deletes the row, leaving Save to update nothing and report success.
	var block model.Block
	if err := s.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&block, "id = ? AND note_id = ?", blockID, noteID).Error; err != nil {
			return err
		}

		block.Type = blockType
		block.Content = jsonString

		result := tx.Save(&block)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}

		return touchNote(tx, noteID)
	}); err != nil {
		return nil, err
	}

	return &block, nil
}

func (s *BlockService) DeleteBlock(noteID string, blockID string) error {
	return s.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&model.Block{}, "id = ? AND note_id = ?", blockID, noteID).Error; err != nil {
			return err
		}
		return touchNote(tx, noteID)
	})
}
