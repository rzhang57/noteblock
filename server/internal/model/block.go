package model

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
	"time"
)

const (
	BlockTypeText   = "text"
	BlockTypeCanvas = "canvas"
	BlockTypeImage  = "image"
)

var BlockTypeToModel = map[string]interface{}{
	BlockTypeText:   &TextBlock{},
	BlockTypeCanvas: &CanvasBlock{},
	BlockTypeImage:  &ImageBlock{},
}

type Block struct {
	ID        string `gorm:"type:uuid;primaryKey"`
	NoteID    string `gorm:"type:uuid;not null;index"`
	Type      string
	Index     int
	CreatedAt time.Time
	UpdatedAt time.Time
	Note      Note `gorm:"foreignKey:NoteID;constraint:OnDelete:CASCADE"`
}

type TextBlock struct {
	ID   string `gorm:"type:uuid;primaryKey"`
	Text string `gorm:"type:text"`
}

type CanvasBlock struct {
	ID   string `gorm:"type:uuid;primaryKey"`
	Data string `gorm:"type:text"`
}

type ImageBlock struct {
	ID   string `gorm:"type:uuid;primaryKey"`
	Path string
	Data string `gorm:"type:text"`
}

func (b *Block) BeforeCreate(*gorm.DB) (err error) {
	b.ID = uuid.New().String()
	return
}
