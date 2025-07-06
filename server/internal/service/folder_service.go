package service

import (
	"gorm.io/gorm"
	"server/internal/model"
)

type FolderService struct {
	DB *gorm.DB
}

func (s *FolderService) NewFolder(name string, parentID *string) (string, error) {
	f := &model.Folder{Name: name, ParentID: parentID}
	return f.ID, s.DB.Create(f).Error
}

func (s *FolderService) ListChildren(parentID *string) ([]model.Folder, error) {
	var folders []model.Folder
	err := s.DB.Where("parent_id = ?", parentID).Find(&folders).Error
	return folders, err
}
