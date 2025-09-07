package service

import (
	"encoding/json"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"io"
	"mime/multipart"
	"os"
	"server/internal/model"
)

type BlockService struct {
	DB *gorm.DB
}

func (s *BlockService) SaveImage(file *multipart.FileHeader) (string, error) {
	newImageUuid := uuid.NewString()
	imageName := newImageUuid + "_" + file.Filename

	fsPath := "uploads/images/" + imageName
	publicPath := "/uploads/images/" + imageName

	if err := os.MkdirAll("uploads/images", os.ModePerm); err != nil {
		return "", err
	}

	dst, err := os.Create(fsPath)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	src, err := file.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()

	if _, err = io.Copy(dst, src); err != nil {
		return "", err
	}

	return publicPath, nil
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
