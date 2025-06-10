package service

import "server/storage"

type FolderService struct{ Repo *storage.FolderRepository }

func (s *FolderService) NewFolder(name string, parentID *uint) (uint, error) {
	folder, err := s.Repo.Create(name, parentID)
	if err != nil {
		return 0, err
	}
	return folder.ID, nil
}
