package service

import (
	"server/internal/storage"
)

type FolderService struct{ Repo *storage.FolderRepository }

func (s *FolderService) NewFolder(name string, parentID *string) (string, error) {
	folder, err := s.Repo.Create(name, parentID)
	if err != nil {
		return "", err
	}
	return folder.ID, nil
}
