package model

import (
	"time"
)

type CloudNote struct {
	ID        string `gorm:"type:uuid;primaryKey"`
	UserID    string `gorm:"type:uuid;not null;index"`
	FolderID  string `gorm:"type:uuid;not null;index"` // for querying notes by folder
	Data      JSONB  `gorm:"type:jsonb;not null"`      // stores all note data
	CreatedAt time.Time
	UpdatedAt time.Time
}

type JSONB map[string]interface{}
