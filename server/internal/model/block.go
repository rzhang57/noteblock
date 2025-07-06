package model

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
	"time"
)

type Block struct {
	ID        string `gorm:"type:uuid;primaryKey"`
	NoteID    string `gorm:"type:uuid;not null;index"`
	Type      string // "text", "canvas", "image" make enum?
	Order     int
	CreatedAt time.Time
	UpdatedAt time.Time
	Note      Note `gorm:"foreignKey:NoteID;constraint:OnDelete:CASCADE"`
}

func (b *Block) BeforeCreate(*gorm.DB) (err error) {
	b.ID = uuid.New().String()
	return
}
