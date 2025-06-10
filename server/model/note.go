package model

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
	"time"
)

type Note struct {
	ID        string `gorm:"type:uuid;primaryKey"`
	Title     string
	Path      string
	FolderID  string // no longer uint
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (n *Note) BeforeCreate(tx *gorm.DB) (err error) {
	n.ID = uuid.New().String()
	return
}
