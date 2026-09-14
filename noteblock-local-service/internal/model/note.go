package model

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
	"time"
)

type Note struct {
	ID        string `gorm:"type:uuid;primaryKey"`
	Title     string
	FolderID  *string `gorm:"type:uuid;index"`
	UserID    string  `gorm:"type:uuid;index"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`

	// A null FolderID means top level, and a null foreign key skips the constraint entirely.
	Folder *Folder `gorm:"foreignKey:FolderID;constraint:OnDelete:CASCADE"`

	// 1:N relationship with Block - uses NoteID as foreign key in Block table to match primary key in this table
	// slice = foreign key in other table -> primary key in this table
	Blocks []Block `gorm:"foreignKey:NoteID"`
}

func (n *Note) BeforeCreate(*gorm.DB) (err error) {
	if n.ID == "" {
		n.ID = uuid.New().String()
	}
	if n.UserID == "" {
		n.UserID = LocalUserID
	}
	return
}
