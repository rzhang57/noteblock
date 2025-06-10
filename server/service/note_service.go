package service

import (
	"fmt"
	"os"
	"path/filepath"

	"server/storage"
)

type NoteService struct{ Repo *storage.NoteRepository }

// Saves markdown file to data/notes/<uuid>.md then persists metadata.
func (s *NoteService) NewNote(title string, md string, folderID uint) (uint, error) {
	noteDir := filepath.Join("data", "notes")
	if err := os.MkdirAll(noteDir, os.ModePerm); err != nil {
		return 0, err
	}

	tmpPath := filepath.Join(noteDir, fmt.Sprintf("%s.md", title)) // naive name – refine later
	if err := os.WriteFile(tmpPath, []byte(md), 0644); err != nil {
		return 0, err
	}

	note, err := s.Repo.Create(title, tmpPath, folderID)
	if err != nil {
		return 0, err
	}
	return note.ID, nil
}
