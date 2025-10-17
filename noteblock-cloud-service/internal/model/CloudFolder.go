package model

import (
	"time"
)

type CloudFolder struct {
	ID        string `gorm:"type:uuid;primaryKey"`
	UserID    string `gorm:"type:uuid;not null;index"`
	Data      JSONB  `gorm:"type:jsonb;not null"` // stores all folder data
	CreatedAt time.Time
	UpdatedAt time.Time
}
