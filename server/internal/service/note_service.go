package service

import (
	"gorm.io/gorm"
	"server/internal/model"
)

type NoteService struct{ DB *gorm.DB }

// NewNote creates a new note with the given title and folder ID
func (s *NoteService) NewNote(title string, folderID string) (*model.Note, error) {
	note := &model.Note{
		Title:    title,
		FolderID: folderID,
	}
	return note, s.DB.Create(note).Error
}

// TODO: NB-31 - implement GetNote to retrieve a note by its ID, preloading blocks and returning them
func (s *NoteService) GetNote(id string) (*model.Note, error) {
	return nil, nil
}

func (s *NoteService) GetNoteMetaData(id string) (*model.Note, error) {
	var note model.Note
	err := s.DB.Preload("Folder").First(&note, "id = ?", id).Error
	if err != nil {
		return nil, err
	}

	return &note, nil
}

func (s *NoteService) ListNotesByFolderId(folderId *string) ([]model.Note, error) {
	var notes []model.Note
	var err error

	if folderId == nil {
		err = s.DB.Where("folder_id IS NULL").Find(&notes).Error
	} else {
		err = s.DB.Where("folder_id = ?", folderId).Find(&notes).Error
	}

	return notes, err
}

func (s *NoteService) UpdateNoteMetaData(id string, title string, folderId string) (*model.Note, error) {
	var note model.Note
	if err := s.DB.Transaction(func(tx *gorm.DB) error {
		err := tx.First(&note, "id = ?", id).Error
		if err != nil {
			return err
		}

		note.Title = title
		note.FolderID = folderId

		return tx.Save(&note).Error
	}); err != nil {
		return nil, err
	}

	return &note, nil
}

// TODO: NB-31 - implement UpdateNoteContents to update a note's title, block content, and folder ID
// for this, we might just be editing the individual blocks so this might not be necessary?
func (s *NoteService) UpdateNoteContents(id string, title string, md string, folderID string) error {
	// stub
	return nil
}

// DeleteNote removes a note by its ID as well as all associated blocks
// TODO: NB-32 - implement DeleteNote to remove a note and its blocks from DB only if it's already in "trash" folder, otherwise, move to "trash" folder first
func (s *NoteService) DeleteNote(id string) error {
	// stub
	return nil
}
