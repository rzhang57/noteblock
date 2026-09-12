package model

import "time"

// Placeholder until real accounts exist. Every local record is owned by this id, and the
// cloud service scopes by the same value, so wiring auth later is a no-op rather than a migration.
const LocalUserID = "00000000-0000-0000-0000-000000000001"

type User struct {
	ID        string `gorm:"type:uuid;primaryKey"`
	Name      string
	CreatedAt time.Time
	UpdatedAt time.Time
}
