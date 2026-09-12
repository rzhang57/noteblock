package model

import "time"

// Placeholder until real accounts exist; the cloud service scopes by this same id.
const LocalUserID = "00000000-0000-0000-0000-000000000001"

type User struct {
	ID        string `gorm:"type:uuid;primaryKey"`
	Name      string
	CreatedAt time.Time
	UpdatedAt time.Time
}
