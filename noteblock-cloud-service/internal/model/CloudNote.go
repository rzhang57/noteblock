package model

import "time"

// ServerUpdatedAt drives the pull cursor and is written from the database clock; ClientUpdatedAt is
// the device's own clock and is the only value LWW compares. Naming it ServerUpdatedAt rather than
// UpdatedAt keeps GORM from overwriting it with the process clock.
// Ids are opaque strings, not uuids: they are chosen by the client and the server never parses them.
type CloudNote struct {
	ID              string  `gorm:"type:text;primaryKey"`
	UserID          string  `gorm:"type:text;not null;index"`
	FolderID        *string `gorm:"type:text;index"`
	Data            JSONB   `gorm:"type:jsonb;not null"`
	ClientUpdatedAt time.Time
	CreatedAt       time.Time
	ServerUpdatedAt time.Time `gorm:"column:updated_at;index"`
}
