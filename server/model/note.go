package model

import "gorm.io/gorm"

type Note struct {
	gorm.Model
	Title    string
	Path     string // absolute/relative path to markdown file
	FolderID uint
}
