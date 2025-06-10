package model

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
	"time"
)

type Folder struct {
	ID        string `gorm:"type:uuid;primaryKey"`
	Name      string
	ParentID  *string
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (f *Folder) BeforeCreate(tx *gorm.DB) (err error) {
	f.ID = uuid.New().String()
	f.CreatedAt = time.Now()
	f.UpdatedAt = time.Now()
	return
}
