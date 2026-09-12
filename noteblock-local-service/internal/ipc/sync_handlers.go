package ipc

import (
	"context"
	"time"
)

// The shutdown flush has to finish well inside Electron's own quit timeout, and a pass that
// cannot beat it is a non-event: the cursors stay put and the next launch picks the work up.
const flushTimeout = 3 * time.Second

// Queuing through the sequential ipc loop is what makes this correct: by the time it runs,
// every pending autosave has already committed.
func (s *Server) syncFlush(req Request) Response {
	if s.flusher == nil {
		return Response{ID: req.ID, Result: map[string]any{"synced": false, "reason": "sync is not configured"}}
	}

	ctx, cancel := context.WithTimeout(context.Background(), flushTimeout)
	defer cancel()

	if err := s.flusher.Pass(ctx); err != nil {
		return rpcErr(req.ID, "INTERNAL", "Sync flush failed: "+err.Error())
	}

	return Response{ID: req.ID, Result: map[string]any{"synced": true}}
}

// Returns immediately. Blocking here would stall the sequential loop, so a slow network would
// freeze editing — the opposite of what local-first is for.
func (s *Server) syncFocus(req Request) Response {
	var body struct {
		NoteID string `json:"note_id"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}

	if s.flusher != nil {
		s.flusher.Focus(context.Background(), body.NoteID)
	}

	return Response{ID: req.ID, Result: map[string]any{"note_id": body.NoteID}}
}
