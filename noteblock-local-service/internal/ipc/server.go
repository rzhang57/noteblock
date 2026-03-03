package ipc

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"io"
	"regexp"
	"server/internal/api/mapper"
	"server/internal/model"
	"server/internal/model/dto"
	"server/internal/service"
	"strconv"
)

type Request struct {
	ID     string          `json:"id"`
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

type RPCError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type Response struct {
	ID     string    `json:"id"`
	Result any       `json:"result,omitempty"`
	Error  *RPCError `json:"error,omitempty"`
}

type Server struct {
	noteSvc   *service.NoteService
	folderSvc *service.FolderService
	blockSvc  *service.BlockService
}

func NewServer(noteSvc *service.NoteService, folderSvc *service.FolderService, blockSvc *service.BlockService) *Server {
	return &Server{
		noteSvc:   noteSvc,
		folderSvc: folderSvc,
		blockSvc:  blockSvc,
	}
}

func (s *Server) Run(r io.Reader, w io.Writer) error {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 20*1024*1024)
	encoder := json.NewEncoder(w)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var req Request
		if err := json.Unmarshal(line, &req); err != nil {
			if encErr := encoder.Encode(Response{
				ID: "",
				Error: &RPCError{
					Code:    "BAD_REQUEST",
					Message: "Invalid request JSON",
				},
			}); encErr != nil {
				return encErr
			}
			continue
		}

		res := s.handle(req)
		if err := encoder.Encode(res); err != nil {
			return err
		}
	}

	if err := scanner.Err(); err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	return nil
}

func (s *Server) handle(req Request) Response {
	switch req.Method {
	case "folder.create":
		return s.folderCreate(req)
	case "folder.get":
		return s.folderGet(req)
	case "folder.update":
		return s.folderUpdate(req)
	case "folder.delete":
		return s.folderDelete(req)
	case "note.create":
		return s.noteCreate(req)
	case "note.get":
		return s.noteGet(req)
	case "note.update":
		return s.noteUpdate(req)
	case "note.delete":
		return s.noteDelete(req)
	case "block.create":
		return s.blockCreate(req)
	case "block.update":
		return s.blockUpdate(req)
	case "block.delete":
		return s.blockDelete(req)
	case "asset.uploadImage":
		return s.assetUpload(req)
	default:
		return Response{
			ID: req.ID,
			Error: &RPCError{
				Code:    "METHOD_NOT_FOUND",
				Message: "Unknown method: " + req.Method,
			},
		}
	}
}

func parseParams(raw json.RawMessage, out any) error {
	if len(raw) == 0 {
		return nil
	}
	return json.Unmarshal(raw, out)
}

func rpcErr(reqID, code, message string) Response {
	return Response{
		ID: reqID,
		Error: &RPCError{
			Code:    code,
			Message: message,
		},
	}
}

func dbErrToRPC(reqID string, err error, fallback string) Response {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return rpcErr(reqID, "NOT_FOUND", "Record not found")
	}
	return rpcErr(reqID, "INTERNAL", fallback)
}

func (s *Server) folderCreate(req Request) Response {
	var body struct {
		Name     *string `json:"name"`
		ParentID *string `json:"parent_id"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}

	if body.ParentID == nil || *body.ParentID == "" {
		root := "root"
		body.ParentID = &root
	}

	if _, err := s.folderSvc.GetFolderByID(*body.ParentID); err != nil {
		return dbErrToRPC(req.ID, err, "Failed to query parent folder")
	}

	existingFolders, err := s.folderSvc.ListChildrenByParentId(body.ParentID)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to query folders")
	}

	if body.Name == nil || *body.Name == "" {
		newName := generateUniqueFolderName(existingFolders)
		body.Name = &newName
	} else {
		for _, f := range existingFolders {
			if f.Name == *body.Name {
				return rpcErr(req.ID, "CONFLICT", "Folder with that name already exists")
			}
		}
	}

	folder, err := s.folderSvc.CreateNewFolder(*body.Name, body.ParentID)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to create new folder")
	}

	return Response{
		ID: req.ID,
		Result: map[string]any{
			"id":        folder.ID,
			"name":      folder.Name,
			"parent_id": folder.ParentID,
		},
	}
}

func (s *Server) folderGet(req Request) Response {
	var body struct {
		ID string `json:"id"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}
	if body.ID == "" {
		return rpcErr(req.ID, "BAD_REQUEST", "Missing folder ID")
	}

	folder, err := s.folderSvc.GetFolderDtoById(body.ID)
	if err != nil {
		return dbErrToRPC(req.ID, err, "Failed to retrieve folder")
	}

	return Response{
		ID:     req.ID,
		Result: folder,
	}
}

func (s *Server) folderUpdate(req Request) Response {
	var body struct {
		CurrentID *string `json:"current_id"`
		Name      *string `json:"name"`
		ParentID  *string `json:"parent_id"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}
	if body.CurrentID == nil || *body.CurrentID == "" {
		return rpcErr(req.ID, "BAD_REQUEST", "Missing current folder ID")
	}

	currentFolder, err := s.folderSvc.GetFolderByID(*body.CurrentID)
	if err != nil {
		return dbErrToRPC(req.ID, err, "Failed to retrieve folder")
	}

	targetName := currentFolder.Name
	if body.Name != nil && *body.Name != "" {
		targetName = *body.Name
	}

	targetParentID := currentFolder.ParentID
	if body.ParentID != nil && *body.ParentID != "" {
		targetParentID = body.ParentID
	}
	if targetParentID == nil || *targetParentID == "" {
		root := "root"
		targetParentID = &root
	}

	if _, err := s.folderSvc.GetFolderByID(*targetParentID); err != nil {
		return dbErrToRPC(req.ID, err, "Parent folder does not exist")
	}

	siblings, err := s.folderSvc.ListChildrenByParentId(targetParentID)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to check sibling folders")
	}
	for _, f := range siblings {
		if f.Name == targetName && f.ID != currentFolder.ID {
			return rpcErr(req.ID, "CONFLICT", "Folder with that name already exists in the target parent")
		}
	}

	updated, err := s.folderSvc.UpdateFolder(currentFolder.ID, targetName, targetParentID)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to update folder")
	}

	return Response{
		ID: req.ID,
		Result: map[string]any{
			"id":        updated.ID,
			"name":      updated.Name,
			"parent_id": updated.ParentID,
		},
	}
}

func (s *Server) folderDelete(req Request) Response {
	var body struct {
		ID string `json:"id"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}
	if body.ID == "" {
		return rpcErr(req.ID, "BAD_REQUEST", "Missing folder ID")
	}
	if body.ID == "root" {
		return rpcErr(req.ID, "BAD_REQUEST", "Cannot delete root folder")
	}

	folder, err := s.folderSvc.GetFolderByID(body.ID)
	if err != nil {
		return dbErrToRPC(req.ID, err, "Folder was not found or does not exist")
	}
	if err := s.folderSvc.DeleteFolderAndContents(folder.ID); err != nil {
		return rpcErr(req.ID, "INTERNAL", "Something went wrong in the deletion process of the folder")
	}

	return Response{
		ID: req.ID,
		Result: map[string]any{
			"id":      folder.ID,
			"message": "Folder deleted successfully",
		},
	}
}

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

func (s *Server) blockCreate(req Request) Response {
	var body struct {
		NoteID  string           `json:"note_id"`
		Type    string           `json:"type"`
		Index   int              `json:"index"`
		Content *json.RawMessage `json:"content"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}
	if body.NoteID == "" {
		return rpcErr(req.ID, "BAD_REQUEST", "Missing note ID")
	}

	block, err := s.blockSvc.CreateNewBlock(body.NoteID, body.Type, body.Index, body.Content)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to create block")
	}
	return Response{
		ID: req.ID,
		Result: map[string]any{
			"id":      block.ID,
			"note_id": block.NoteID,
			"type":    block.Type,
			"index":   block.Index,
		},
	}
}

func (s *Server) blockUpdate(req Request) Response {
	var body struct {
		NoteID  string           `json:"note_id"`
		BlockID string           `json:"block_id"`
		Type    string           `json:"type"`
		Content *json.RawMessage `json:"content"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}
	if body.NoteID == "" || body.BlockID == "" {
		return rpcErr(req.ID, "BAD_REQUEST", "Missing note ID or block ID")
	}

	block, err := s.blockSvc.UpdateBlockContent(body.NoteID, body.BlockID, body.Type, body.Content)
	if err != nil {
		return dbErrToRPC(req.ID, err, "Failed to update block")
	}
	return Response{
		ID: req.ID,
		Result: map[string]any{
			"id":      block.ID,
			"note_id": block.NoteID,
			"type":    block.Type,
			"index":   block.Index,
		},
	}
}

func (s *Server) blockDelete(req Request) Response {
	var body struct {
		NoteID  string `json:"note_id"`
		BlockID string `json:"block_id"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}
	if body.NoteID == "" || body.BlockID == "" {
		return rpcErr(req.ID, "BAD_REQUEST", "Missing note ID or block ID")
	}
	if err := s.blockSvc.DeleteBlock(body.NoteID, body.BlockID); err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to delete block")
	}
	return Response{
		ID:     req.ID,
		Result: map[string]any{},
	}
}

func (s *Server) assetUpload(req Request) Response {
	var body struct {
		Filename   string `json:"filename"`
		DataBase64 string `json:"data_base64"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}
	if body.Filename == "" || body.DataBase64 == "" {
		return rpcErr(req.ID, "BAD_REQUEST", "Missing filename or image data")
	}

	data, err := base64.StdEncoding.DecodeString(body.DataBase64)
	if err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid base64 image data")
	}

	url, err := s.blockSvc.SaveImageBytes(body.Filename, data)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to save image")
	}

	return Response{
		ID: req.ID,
		Result: map[string]any{
			"url": url,
		},
	}
}

func generateUniqueFolderName(folders []model.Folder) string {
	base := "New Folder"
	maxIndex := 0
	pattern := regexp.MustCompile(`^New Folder(?: (\d+))?$`)

	for _, f := range folders {
		matches := pattern.FindStringSubmatch(f.Name)
		if len(matches) > 1 && matches[1] != "" {
			if idx, err := strconv.Atoi(matches[1]); err == nil {
				if idx > maxIndex {
					maxIndex = idx
				}
			}
		} else if f.Name == base && maxIndex == 0 {
			maxIndex = 1
		}
	}

	if maxIndex == 0 {
		return base
	}
	return fmt.Sprintf("%s %d", base, maxIndex+1)
}

func generateUniqueNoteName(notes []model.Note) string {
	base := "New Note"
	maxIndex := 0
	pattern := regexp.MustCompile(`^New Note(?: (\d+))?$`)

	for _, n := range notes {
		matches := pattern.FindStringSubmatch(n.Title)
		if len(matches) > 1 && matches[1] != "" {
			if idx, err := strconv.Atoi(matches[1]); err == nil {
				if idx > maxIndex {
					maxIndex = idx
				}
			}
		} else if n.Title == base && maxIndex == 0 {
			maxIndex = 1
		}
	}

	if maxIndex == 0 {
		return base
	}
	return fmt.Sprintf("%s %d", base, maxIndex+1)
}
