package service

import (
	"gorm.io/gorm"
	"server/internal/model"
	"server/internal/model/dto"
)

type FolderService struct {
	DB          *gorm.DB
	NoteService *NoteService
}

func (s *FolderService) CreateNewFolder(name string, parentID *string) (*model.Folder, error) {
	f := &model.Folder{Name: name, ParentID: parentID}
	return f, s.DB.Create(f).Error
}

func (s *FolderService) UpdateFolder(id string, name string, parentId *string) (*model.Folder, error) {
	var folder *model.Folder

	if err := s.DB.Transaction(func(tx *gorm.DB) error {
		err := tx.First(&folder, "id = ?", id).Error
		if err != nil {
			return err
		}

		folder.Name = name
		folder.ParentID = parentId

		err = tx.Save(&folder).Error
		if err != nil {
			return err
		}

		return nil
	}); err != nil {
		return nil, err
	}

	return folder, nil
}

func (s *FolderService) GetFolderByID(id string) (*model.Folder, error) {
	var folder model.Folder
	err := s.DB.First(&folder, "id = ?", id).Error
	return &folder, err
}

func (s *FolderService) ListChildrenByParentId(parentID *string) ([]model.Folder, error) {
	var folders []model.Folder
	var err error

	if parentID == nil {
		err = s.DB.Where("parent_id IS NULL").Find(&folders).Error
	} else {
		err = s.DB.Where("parent_id = ?", parentID).Find(&folders).Error
	}

	return folders, err
}

func (s *FolderService) GetFolderDtoById(id string) (*dto.FolderResponse, error) {
	var folder model.Folder

	err := s.DB.
		Where("id = ?", id).
		First(&folder).Error
	if err != nil {
		return nil, err
	}

	return s.buildFolderResponseRecursive(folder.ID)
}

func (s *FolderService) buildFolderResponseRecursive(folderID string) (*dto.FolderResponse, error) {
	var folder model.Folder
	if err := s.DB.Where("id = ?", folderID).First(&folder).Error; err != nil {
		return nil, err
	}

	var children []model.Folder
	if err := s.DB.Where("parent_id = ?", folderID).Find(&children).Error; err != nil {
		return nil, err
	}

	var notes []model.Note
	if err := s.DB.Select("id", "title").Where("folder_id = ?", folderID).Find(&notes).Error; err != nil {
		return nil, err
	}

	// Recursively build child folder responses
	childResponses := make([]dto.FolderResponse, 0, len(children))
	for _, child := range children {
		childResponse, err := s.buildFolderResponseRecursive(child.ID)
		if err != nil {
			return nil, err
		}
		childResponses = append(childResponses, *childResponse)
	}

	noteResponses := make([]dto.NoteResponse, 0, len(notes))
	for _, note := range notes {
		noteResponses = append(noteResponses, dto.NoteResponse{
			ID:    note.ID,
			Title: note.Title,
		})
	}

	return &dto.FolderResponse{
		ID:       folder.ID,
		Name:     folder.Name,
		ParentID: folder.ParentID,
		Children: childResponses,
		Notes:    noteResponses,
	}, nil
}

// TODO: delete folder, all children folders, notes in folder, and blocks associated with notes
func (s *FolderService) DeleteFolderAndContents(folderID string) error {
	return s.DB.Transaction(func(tx *gorm.DB) error {
		return deleteFolderRecursive(tx, folderID, s.NoteService)
	})
}

func deleteFolderRecursive(db *gorm.DB, folderID string, service *NoteService) error {
	var folder model.Folder
	if err := db.Preload("ChildrenFolders").Preload("Notes").First(&folder, "id = ?", folderID).Error; err != nil {
		return err
	}

	// Recursively delete child folders
	for _, child := range folder.ChildrenFolders {
		if err := deleteFolderRecursive(db, child.ID, service); err != nil {
			return err
		}
	}

	// Delete notes in this folder
	for _, note := range folder.Notes {
		if err := service.DeleteNoteTx(db, note.ID); err != nil {
			return err
		}
	}

	// Delete this folder
	if err := db.Delete(&folder).Error; err != nil {
		return err
	}

	return nil
}
