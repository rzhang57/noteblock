package model

import (
	"database/sql/driver"
	"encoding/json"
	"time"
)

type CloudBlock struct {
	ID        string `gorm:"type:uuid;primaryKey"`
	UserID    string `gorm:"type:uuid;not null;index"`
	NoteID    string `gorm:"type:uuid;not null;index"`
	Data      JSONB  `gorm:"type:jsonb;not null"` // stores all block data no matter the format
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (j JSONB) Value() (driver.Value, error) {
	return json.Marshal(j)
}

func (j *JSONB) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, j)
}
