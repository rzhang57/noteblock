package server

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"noteblock-cloud-service/internal/blob"
)

func newImageServer(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)

	s := &Server{blobs: blob.NewMemory()}
	r := gin.New()
	r.PUT("/images/:key", s.imagePut)
	r.GET("/images/:key", s.imageGet)
	r.HEAD("/images/:key", s.imageHead)

	return r
}

func do(t *testing.T, r *gin.Engine, method, path string, body []byte) *httptest.ResponseRecorder {
	t.Helper()

	var reader *bytes.Reader
	if body == nil {
		reader = bytes.NewReader(nil)
	} else {
		reader = bytes.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reader)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	return rec
}

func TestAnImageRoundTripsByItsKey(t *testing.T) {
	r := newImageServer(t)
	key := "4f0c2a1e_screenshot.png"
	payload := []byte("\x89PNG not really but bytes are bytes")

	if rec := do(t, r, http.MethodPut, "/images/"+key, payload); rec.Code != http.StatusOK {
		t.Fatalf("put status = %d, body = %s", rec.Code, rec.Body.String())
	}

	rec := do(t, r, http.MethodGet, "/images/"+key, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get status = %d", rec.Code)
	}
	if !bytes.Equal(rec.Body.Bytes(), payload) {
		t.Error("bytes did not survive the round trip")
	}
}

func TestReUploadingTheSameKeyIsANoOp(t *testing.T) {
	r := newImageServer(t)
	key := "abc_pic.png"

	first := do(t, r, http.MethodPut, "/images/"+key, []byte("original"))
	second := do(t, r, http.MethodPut, "/images/"+key, []byte("ignored"))

	if first.Code != http.StatusOK || second.Code != http.StatusOK {
		t.Fatalf("statuses = %d, %d", first.Code, second.Code)
	}
	if got := do(t, r, http.MethodGet, "/images/"+key, nil).Body.String(); got != "original" {
		t.Errorf("stored bytes = %q; a retry overwrote a key whose bytes never change", got)
	}
}

func TestAMissingImageIsNotFoundRatherThanAnError(t *testing.T) {
	r := newImageServer(t)

	if rec := do(t, r, http.MethodGet, "/images/nothing.png", nil); rec.Code != http.StatusNotFound {
		t.Errorf("get status = %d, want 404", rec.Code)
	}
	if rec := do(t, r, http.MethodHead, "/images/nothing.png", nil); rec.Code != http.StatusNotFound {
		t.Errorf("head status = %d, want 404", rec.Code)
	}
}

// Keys come off the wire, so a traversal attempt must be refused rather than sanitised.
func TestKeysContainingAPathAreRejected(t *testing.T) {
	r := newImageServer(t)

	for _, key := range []string{"..%2f..%2fnoteblock.sqlite", "%2eetc%2fpasswd"} {
		if rec := do(t, r, http.MethodPut, "/images/"+key, []byte("x")); rec.Code == http.StatusOK {
			t.Errorf("key %q was accepted", key)
		}
	}
}
