package service

import (
	"gorm.io/gorm"
	"server/internal/model"
)

type FolderService struct {
	DB *gorm.DB
}

func (s *FolderService) CreateNewFolder(name string, parentID *string) (model.Folder, error) {
	f := &model.Folder{Name: name, ParentID: parentID}
	return *f, s.DB.Create(f).Error
}

func (s *FolderService) UpdateFolder(id string, name string, parentId *string) (*model.Folder, error) {
	var folder *model.Folder
	err := s.DB.First(&folder, "id = ?", id).Error
	if err != nil {
		return folder, err
	}

	folder.Name = name
	folder.ParentID = parentId

	err = s.DB.Save(&folder).Error
	if err != nil {
		return folder, err
	}

	s.DB.Save(&folder)
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
