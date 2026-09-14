package sync

import (
	"encoding/json"
	"time"
)

// A note travels as one document: its metadata plus its whole block set. Whichever side
// wins LWW replaces the lot, so a block absent from Blocks is deleted by construction.
type NoteDocument struct {
	ID        string          `json:"id"`
	Title     string          `json:"title"`
	FolderID  *string         `json:"folder_id"`
	UserID    string          `json:"user_id"`
	UpdatedAt time.Time       `json:"updated_at"`
	DeletedAt *time.Time      `json:"deleted_at,omitempty"`
	Blocks    []BlockDocument `json:"blocks"`
}

type BlockDocument struct {
	ID      string          `json:"id"`
	Type    string          `json:"type"`
	Index   int             `json:"index"`
	Content json.RawMessage `json:"content"`
}

type FolderDocument struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	ParentID  *string    `json:"parent_id"`
	UserID    string     `json:"user_id"`
	UpdatedAt time.Time  `json:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty"`
}

type Changes struct {
	Notes   []NoteDocument   `json:"notes"`
	Folders []FolderDocument `json:"folders"`
}

func (c Changes) IsEmpty() bool {
	return len(c.Notes) == 0 && len(c.Folders) == 0
}

type Cursors struct {
	LastPushedLocal  *time.Time
	LastPulledServer string
}
