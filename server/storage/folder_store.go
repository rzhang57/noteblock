package storage

import (
	"gorm.io/gorm"
	"server/model"
)

type FolderRepository struct {
	DB *gorm.DB
}

func (r *FolderRepository) Create(name string, parentID *string) (*model.Folder, error) {
	f := &model.Folder{Name: name, ParentID: parentID}
	return f, r.DB.Create(f).Error
}

func (r *FolderRepository) ListChildren(parentID *string) ([]model.Folder, error) {
	var folders []model.Folder
	err := r.DB.Where("parent_id = ?", parentID).Find(&folders).Error
	return folders, err
}
