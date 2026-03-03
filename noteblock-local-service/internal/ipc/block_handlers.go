package ipc

import "encoding/base64"

func (s *Server) blockCreate(req Request) Response {
	var body struct {
		NoteID  string `json:"note_id"`
		Type    string `json:"type"`
		Index   int    `json:"index"`
		Content any    `json:"content"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}
	if body.NoteID == "" {
		return rpcErr(req.ID, "BAD_REQUEST", "Missing note ID")
	}

	raw, err := toRawMessage(body.Content)
	if err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid block content")
	}
	block, err := s.blockSvc.CreateNewBlock(body.NoteID, body.Type, body.Index, raw)
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
		NoteID  string `json:"note_id"`
		BlockID string `json:"block_id"`
		Type    string `json:"type"`
		Content any    `json:"content"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}
	if body.NoteID == "" || body.BlockID == "" {
		return rpcErr(req.ID, "BAD_REQUEST", "Missing note ID or block ID")
	}

	raw, err := toRawMessage(body.Content)
	if err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid block content")
	}
	block, err := s.blockSvc.UpdateBlockContent(body.NoteID, body.BlockID, body.Type, raw)
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
