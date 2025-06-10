package model

import "gorm.io/gorm"

type Folder struct {
	gorm.Model //already includes ID, CreatedAt, UpdatedAt
	Name       string
	ParentID   *uint
}
