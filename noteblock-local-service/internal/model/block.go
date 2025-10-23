package model

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
	"time"
)

type Block struct {
	ID        string `gorm:"type:uuid;primaryKey"`
	NoteID    string `gorm:"type:uuid;not null;index"`
	Type      string
	Index     int
	CreatedAt time.Time
	UpdatedAt time.Time
	Content   string `gorm:"type:text"`
}

func (b *Block) BeforeCreate(*gorm.DB) (err error) {
	b.ID = uuid.New().String()
	return
}
