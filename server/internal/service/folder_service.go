package service

import (
	"gorm.io/gorm"
	"server/internal/model"
	"server/internal/model/dto"
)

type FolderService struct {
	DB *gorm.DB
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

	var children []model.Folder
	if err := s.DB.Select("id", "name").Where("parent_id = ?", id).Find(&children).Error; err != nil {
		return nil, err
	}

	var notes []model.Note
	if err := s.DB.Select("id", "title").Where("folder_id = ?", id).Find(&notes).Error; err != nil {
		return nil, err
	}

	childPreviews := make([]dto.FolderPreview, len(children))
	for i, c := range children {
		childPreviews[i] = dto.FolderPreview{ID: c.ID, Name: c.Name}
	}

	notePreviews := make([]dto.NoteResponse, len(notes))
	for i, n := range notes {
		notePreviews[i] = dto.NoteResponse{ID: n.ID, Title: n.Title}
	}

	return &dto.FolderResponse{
		ID:       folder.ID,
		Name:     folder.Name,
		ParentID: folder.ParentID,
		Children: childPreviews,
		Notes:    notePreviews,
	}, nil
}

// TODO: delete folder, all children folders, notes in folder, and blocks associated with notes
func (s *FolderService) DeleteFolderAndContents(folderID string) error {
	return s.DB.Transaction(func(tx *gorm.DB) error {
		return deleteFolderRecursive(tx, folderID)
	})
}

func deleteFolderRecursive(db *gorm.DB, folderID string) error {
	var folder model.Folder
	if err := db.Preload("ChildrenFolders").Preload("Notes").First(&folder, "id = ?", folderID).Error; err != nil {
		return err
	}

	// Recursively delete child folders
	for _, child := range folder.ChildrenFolders {
		if err := deleteFolderRecursive(db, child.ID); err != nil {
			return err
		}
	}

	// Delete notes in this folder
	if err := db.Where("folder_id = ?", folder.ID).Delete(&model.Note{}).Error; err != nil {
		return err
	}

	// Delete this folder
	if err := db.Delete(&folder).Error; err != nil {
		return err
	}

	return nil
}
