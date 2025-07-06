package service

import (
	"gorm.io/gorm"
	"server/internal/model"
)

type NoteService struct{ DB *gorm.DB }

// Saves markdown file to data/notes/<uuid>.md then persists metadata.
func (s *NoteService) NewNote(title string, md string, folderID string) (string, error) {
	// stub
	return "", nil
}

func (s *NoteService) GetNote(id string) (*model.Note, error) {
	return nil, nil
}

//func (r *NoteRepository) Create(title, folderID string) (*model.Note, error) {
//	n := &model.Note{Title: title, FolderID: folderID}
//	return n, r.DB.Create(n).Error
//}
//
//func (r *NoteRepository) Get(id string) (*model.Note, error) {
//	var note model.Note
//	err := r.DB.First(&note, id).Error
//	return &note, err
//}
