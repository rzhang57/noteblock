package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

type stubDB struct{ status string }

func (s stubDB) Health() map[string]string { return map[string]string{"status": s.status} }
func (s stubDB) Close() error              { return nil }

// The Electron setup probe reports "Connected" on any 2xx, so a body that says "down" behind a 200
// is the same thing as no check at all.
func TestHealthReportsADownDatabaseWithAFailingStatusCode(t *testing.T) {
	for _, tc := range []struct {
		status string
		want   int
	}{
		{"up", http.StatusOK},
		{"down", http.StatusServiceUnavailable},
	} {
		t.Run(tc.status, func(t *testing.T) {
			server := &Server{db: stubDB{status: tc.status}}
			recorder := httptest.NewRecorder()

			server.RegisterRoutes().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/health", nil))

			if recorder.Code != tc.want {
				t.Fatalf("GET /health with status=%q returned %d, want %d", tc.status, recorder.Code, tc.want)
			}
		})
	}
}
