package service

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"server/model"

	"server/storage"
)

type NoteService struct{ Repo *storage.NoteRepository }

// Saves markdown file to data/notes/<uuid>.md then persists metadata.
func (s *NoteService) NewNote(title string, md string, folderID string) (string, error) {
	noteDir := filepath.Join("data", "notes")
	if err := os.MkdirAll(noteDir, os.ModePerm); err != nil {
		return "", err
	}

	tmpPath := filepath.Join(noteDir, fmt.Sprintf("%s.md", title)) // naive name – refine later
	if err := os.WriteFile(tmpPath, []byte(md), 0644); err != nil {
		return "", err
	}

	note, err := s.Repo.Create(title, tmpPath, folderID)
	if err != nil {
		return "", err
	}
	return note.ID, nil
}

func (s *NoteService) GetNote(id string) (*model.Note, error) {
	note, err := s.Repo.Get(id)
	if err != nil {
		log.Default().Println("Error fetching note:", err)
		return nil, fmt.Errorf("failed to get note %d: %w", id, err)
	} else {
		return note, nil
	}
}
