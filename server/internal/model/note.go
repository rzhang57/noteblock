package model

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
	"time"
)

type Note struct {
	ID        string `gorm:"type:uuid;primaryKey"`
	Title     string
	FolderID  string `gorm:"type:uuid;not null;index"`
	CreatedAt time.Time
	UpdatedAt time.Time

	// 1:1 relationship w Folder - uses FolderID as foreign key to match primary key in Folder table
	// struct = foreign key in this table -> primary key in other table
	Folder Folder `gorm:"foreignKey:FolderID;constraint:OnDelete:CASCADE"`

	// 1:N relationship with Block - uses NoteID as foreign key in Block table to match primary key in this table
	// slice = foreign key in other table -> primary key in this table
	Blocks []Block `gorm:"foreignKey:NoteID"`
}

func (n *Note) BeforeCreate(*gorm.DB) (err error) {
	n.ID = uuid.New().String()
	return
}
