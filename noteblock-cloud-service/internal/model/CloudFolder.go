package model

import "time"

type CloudFolder struct {
	ID              string `gorm:"type:uuid;primaryKey"`
	UserID          string `gorm:"type:uuid;not null;index"`
	Data            JSONB  `gorm:"type:jsonb;not null"`
	ClientUpdatedAt time.Time
	CreatedAt       time.Time
	ServerUpdatedAt time.Time `gorm:"column:updated_at;index"`
}
