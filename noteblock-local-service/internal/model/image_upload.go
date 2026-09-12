package model

import "time"

type ImageUpload struct {
	Filename   string `gorm:"primaryKey"`
	UploadedAt time.Time
}
