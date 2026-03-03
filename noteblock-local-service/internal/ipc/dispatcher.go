package ipc

type handlerFn func(Request) Response

func (s *Server) buildHandlers() map[string]handlerFn {
	return map[string]handlerFn{
		"folder.create":     s.folderCreate,
		"folder.get":        s.folderGet,
		"folder.update":     s.folderUpdate,
		"folder.delete":     s.folderDelete,
		"note.create":       s.noteCreate,
		"note.get":          s.noteGet,
		"note.update":       s.noteUpdate,
		"note.delete":       s.noteDelete,
		"block.create":      s.blockCreate,
		"block.update":      s.blockUpdate,
		"block.delete":      s.blockDelete,
		"asset.uploadImage": s.assetUpload,
	}
}

func (s *Server) handle(req Request) Response {
	if handler, ok := s.handlers[req.Method]; ok {
		return handler(req)
	}
	return rpcErr(req.ID, "METHOD_NOT_FOUND", "Unknown method: "+req.Method)
}
