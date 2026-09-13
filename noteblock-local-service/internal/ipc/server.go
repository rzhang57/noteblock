package ipc

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"server/internal/service"
)

// Flusher is the sync engine, kept as an interface so the ipc package does not depend on it
// and so a build with sync switched off simply has none.
type Flusher interface {
	Flush(ctx context.Context) error
	Focus(ctx context.Context, noteID string)
}

type Server struct {
	noteSvc   *service.NoteService
	folderSvc *service.FolderService
	blockSvc  *service.BlockService
	flusher   Flusher
	handlers  map[string]handlerFn
}

func (s *Server) SetFlusher(f Flusher) {
	s.flusher = f
}

func NewServer(noteSvc *service.NoteService, folderSvc *service.FolderService, blockSvc *service.BlockService) *Server {
	s := &Server{
		noteSvc:   noteSvc,
		folderSvc: folderSvc,
		blockSvc:  blockSvc,
	}
	s.handlers = s.buildHandlers()
	return s
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
