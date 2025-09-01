package service

import (
	"gorm.io/gorm"
	"server/internal/model"
)

type NoteService struct{ DB *gorm.DB }

func (s *NoteService) NewNote(title string, folderID string) (*model.Note, error) {
	note := &model.Note{
		Title:    title,
		FolderID: folderID,
	}
	return note, s.DB.Create(note).Error
}

func (s *NoteService) GetNote(id string) (*model.Note, error) {
	note := &model.Note{}
	err := s.DB.Preload("Blocks").First(note, "id = ?", id).Error
	if err != nil {
		return nil, err
	}

	return note, nil
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

func (s *NoteService) DeleteNoteTx(tx *gorm.DB, id string) error {
	if err := tx.Where("note_id = ?", id).Delete(&model.Block{}).Error; err != nil {
		return err
	}
	return tx.Where("id = ?", id).Delete(&model.Note{}).Error
}

// TODO: NB-32 - implement DeleteNote to remove a note and its blocks from DB only if it's already in "trash" folder, otherwise, move to "trash" folder first
func (s *NoteService) DeleteNote(id string) error {
	var note model.Note
	if err := s.DB.First(&note, "id = ?", id).Error; err != nil {
		return err
	}
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("note_id = ?", id).Delete(&model.Block{}).Error; err != nil {
			return err
		}
		return tx.Delete(&note).Error
	})

	return err
}
