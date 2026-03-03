package ipc

import (
	"server/internal/api/mapper"
	"server/internal/model"
	"server/internal/model/dto"

	"gorm.io/gorm"
)

func (s *Server) noteCreate(req Request) Response {
	var body struct {
		Title    *string `json:"title"`
		FolderID *string `json:"folder_id"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}

	if body.FolderID == nil || *body.FolderID == "" {
		root := "root"
		body.FolderID = &root
	}

	existingNotesInFolder, err := s.noteSvc.ListNotesByFolderId(body.FolderID)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to query notes in current folder")
	}

	if body.Title == nil || *body.Title == "" {
		newName := generateUniqueNoteName(existingNotesInFolder)
		body.Title = &newName
	} else {
		for _, n := range existingNotesInFolder {
			if n.Title == *body.Title {
				return rpcErr(req.ID, "CONFLICT", "Note with that title already exists in this folder")
			}
		}
	}

	note, err := s.noteSvc.NewNote(*body.Title, *body.FolderID)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to create new note")
	}
	return Response{
		ID: req.ID,
		Result: map[string]any{
			"id":        note.ID,
			"title":     note.Title,
			"folder_id": note.FolderID,
		},
	}
}

func (s *Server) noteGet(req Request) Response {
	var body struct {
		ID string `json:"id"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}
	if body.ID == "" {
		return rpcErr(req.ID, "BAD_REQUEST", "Missing note ID")
	}

	note, err := s.noteSvc.GetNote(body.ID)
	if err != nil {
		return dbErrToRPC(req.ID, err, "Failed to retrieve note")
	}
	dtoNote, err := mapper.ToNoteDTO(note)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to map note to DTO")
	}

	return Response{
		ID:     req.ID,
		Result: dtoNote,
	}
}

func (s *Server) noteUpdate(req Request) Response {
	var body struct {
		ID       string          `json:"id"`
		Title    *string         `json:"title"`
		FolderID *string         `json:"folder_id"`
		Blocks   *[]dto.BlockDTO `json:"blocks"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}
	if body.ID == "" {
		return rpcErr(req.ID, "BAD_REQUEST", "Missing note ID")
	}

	existingNote, err := s.noteSvc.GetNoteMetaData(body.ID)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to retrieve note metadata")
	}

	targetTitle := existingNote.Title
	if body.Title != nil && *body.Title != "" {
		targetTitle = *body.Title
	}

	targetFolderID := existingNote.FolderID
	if body.FolderID != nil && *body.FolderID != "" {
		targetFolderID = *body.FolderID
	}

	if body.Blocks != nil {
		err = s.blockSvc.DB.Transaction(func(tx *gorm.DB) error {
			for _, block := range *body.Blocks {
				if err := tx.Model(&model.Block{}).
					Where("id = ? AND note_id = ?", block.ID, body.ID).
					Update("index", block.Index).Error; err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return rpcErr(req.ID, "INTERNAL", "Failed to update blocks")
		}
	}

	notesInFolder, err := s.noteSvc.ListNotesByFolderId(&targetFolderID)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to retrieve notes in new folder")
	}
	for _, n := range notesInFolder {
		if n.Title == targetTitle && n.ID != body.ID {
			return rpcErr(req.ID, "CONFLICT", "Note with that title already exists in the destination folder")
		}
	}

	data, err := s.noteSvc.UpdateNoteMetaData(body.ID, targetTitle, targetFolderID)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to update note metadata")
	}

	return Response{
		ID: req.ID,
		Result: map[string]any{
			"id":        data.ID,
			"title":     data.Title,
			"folder_id": data.FolderID,
			"message":   "Note and blocks updated successfully",
		},
	}
}

func (s *Server) noteDelete(req Request) Response {
	var body struct {
		ID string `json:"id"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}
	if body.ID == "" {
		return rpcErr(req.ID, "BAD_REQUEST", "Missing note ID")
	}
	if err := s.noteSvc.DeleteNote(body.ID); err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to delete note")
	}

	return Response{
		ID: req.ID,
		Result: map[string]any{
			"message": "Note deleted successfully",
		},
	}
}
