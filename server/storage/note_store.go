package storage

import (
	"gorm.io/gorm"
	"server/model"
)

type NoteRepository struct{ DB *gorm.DB }

func (r *NoteRepository) Create(title, path string, folderID string) (*model.Note, error) {
	n := &model.Note{Title: title, Path: path, FolderID: folderID}
	return n, r.DB.Create(n).Error
}

func (r *NoteRepository) Get(id string) (*model.Note, error) {
	var note model.Note
	err := r.DB.First(&note, id).Error
	return &note, err
}
