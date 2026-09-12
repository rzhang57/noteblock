package model

import "time"

type CloudFolder struct {
	ID              string `gorm:"type:text;primaryKey"`
	UserID          string `gorm:"type:text;not null;index"`
	Data            JSONB  `gorm:"type:jsonb;not null"`
	ClientUpdatedAt time.Time
	CreatedAt       time.Time
	ServerUpdatedAt time.Time `gorm:"column:updated_at;index"`
}
