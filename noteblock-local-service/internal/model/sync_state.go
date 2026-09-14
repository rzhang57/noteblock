package model

import "time"

const SyncStateID = 1

type SyncState struct {
	ID               int `gorm:"primaryKey"`
	LastPushedLocal  *time.Time
	LastPulledServer string
}
