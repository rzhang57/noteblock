package service

import (
	"gorm.io/gorm"
	"server/internal/model"
)

type FolderService struct {
	DB *gorm.DB
}

func (s *FolderService) NewFolder(name string, parentID *string) (model.Folder, error) {
	f := &model.Folder{Name: name, ParentID: parentID}
	return *f, s.DB.Create(f).Error
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
