package ipc

import (
	"context"
	"errors"
	"testing"
)

type stubFlusher struct {
	calls int
	err   error
}

func (f *stubFlusher) Pass(context.Context) error {
	f.calls++
	return f.err
}

func TestSyncFlushRunsAPass(t *testing.T) {
	srv := setupTestServer(t)
	flusher := &stubFlusher{}
	srv.SetFlusher(flusher)

	res := srv.handle(Request{ID: "1", Method: "sync.flush", Params: mustRaw(t, map[string]any{})})

	if res.Error != nil {
		t.Fatalf("sync.flush failed: %+v", res.Error)
	}
	if flusher.calls != 1 {
		t.Errorf("pass ran %d times, want 1", flusher.calls)
	}
	if res.Result.(map[string]any)["synced"] != true {
		t.Errorf("result = %v, want synced true", res.Result)
	}
}

// Shutdown must not be blocked by a cloud service that is unreachable.
func TestSyncFlushReportsFailureWithoutHanging(t *testing.T) {
	srv := setupTestServer(t)
	srv.SetFlusher(&stubFlusher{err: errors.New("dial tcp: refused")})

	res := srv.handle(Request{ID: "1", Method: "sync.flush", Params: mustRaw(t, map[string]any{})})

	if res.Error == nil {
		t.Fatal("expected an error when the pass fails")
	}
}

func TestSyncFlushIsHarmlessWhenSyncIsOff(t *testing.T) {
	srv := setupTestServer(t)

	res := srv.handle(Request{ID: "1", Method: "sync.flush", Params: mustRaw(t, map[string]any{})})

	if res.Error != nil {
		t.Fatalf("sync.flush errored with no engine configured: %+v", res.Error)
	}
	if res.Result.(map[string]any)["synced"] != false {
		t.Errorf("result = %v, want synced false", res.Result)
	}
}
