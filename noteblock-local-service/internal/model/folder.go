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
	UserID    string `gorm:"type:uuid;index"`
	CreatedAt time.Time
	UpdatedAt time.Time

	Parent          *Folder  `gorm:"foreignKey:ParentID"`
	ChildrenFolders []Folder `gorm:"foreignKey:ParentID"`
	Notes           []Note   `gorm:"foreignKey:FolderID"`
}

func (f *Folder) BeforeCreate(*gorm.DB) (err error) {
	if f.ID == "" {
		f.ID = uuid.New().String()
	}
	if f.UserID == "" {
		f.UserID = LocalUserID
	}
	return
}
