package dto

import (
	"encoding/json"
	"time"
)

type BlockDTO struct {
	ID        string          `json:"id"`
	Type      string          `json:"type"`
	Index     int             `json:"index"`
	Content   json.RawMessage `json:"content"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

type NoteDTO struct {
	ID       string     `json:"id"`
	Title    string     `json:"title"`
	FolderID string     `json:"folder_id"`
	Blocks   []BlockDTO `json:"blocks"`
}
