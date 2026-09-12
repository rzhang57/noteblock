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
