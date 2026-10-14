package server

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"noteblock-cloud-service/internal/blob"
)

// Minimal valid headers: http.DetectContentType reads only the first bytes.
var (
	pngBytes  = append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 64)...)
	jpegBytes = append([]byte("\xff\xd8\xff\xe0"), make([]byte, 64)...)
	gifBytes  = append([]byte("GIF89a"), make([]byte, 64)...)
)

func TestImageContentType(t *testing.T) {
	for _, tc := range []struct {
		name     string
		declared string
		key      string
		head     []byte
		want     string
	}{
		{"a declared image type is trusted", "image/webp", "a.png", pngBytes, "image/webp"},
		// The sidecar sends this for every upload, and a bucket restricted to image/* refuses it.
		{"octet-stream is replaced by what the bytes say", "application/octet-stream", "a.png", pngBytes, "image/png"},
		{"a missing type is replaced too", "", "a.jpg", jpegBytes, "image/jpeg"},
		{"gif is recognised", "application/octet-stream", "a.gif", gifBytes, "image/gif"},
		// A filename is weaker evidence than the bytes, so it only decides when sniffing cannot.
		{"the extension decides when the bytes are unrecognisable", "", "a.png", []byte{0x00, 0x01, 0x02, 0x03}, "image/png"},
		{"an empty body falls back to the extension", "", "a.png", nil, "image/png"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := imageContentType(tc.declared, tc.key, tc.head); got != tc.want {
				t.Fatalf("imageContentType(%q, %q, %d bytes) = %q, want %q",
					tc.declared, tc.key, len(tc.head), got, tc.want)
			}
		})
	}
}

func TestImageContentTypeSniffsBeforeTrustingTheName(t *testing.T) {
	// A .png that is really a jpeg stores as what it is, not as what it claims.
	if got := imageContentType("application/octet-stream", "lying.png", jpegBytes); got != "image/jpeg" {
		t.Fatalf("content type = %q, want image/jpeg from the bytes", got)
	}
}

type recordingStore struct {
	blob.Store
	contentType string
	body        []byte
}

func (r *recordingStore) Put(ctx context.Context, key string, body io.Reader, contentType string) error {
	data, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	r.contentType = contentType
	r.body = data

	return r.Store.Put(ctx, key, bytes.NewReader(data), contentType)
}

// Go does not flag a function that is written but never called, so the handler has to be driven.
func TestImagePutStoresTheSniffedTypeAndTheWholeBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := &recordingStore{Store: blob.NewMemory()}
	r := gin.New()
	s := &Server{blobs: store}
	r.PUT("/images/:key", s.imagePut)

	req := httptest.NewRequest(http.MethodPut, "/images/photo.png", bytes.NewReader(pngBytes))
	req.Header.Set("Content-Type", "application/octet-stream")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("PUT returned %d, want 200", rec.Code)
	}
	if store.contentType != "image/png" {
		t.Errorf("stored content type = %q, want image/png", store.contentType)
	}
	// Peeking must not swallow the bytes it looked at.
	if !bytes.Equal(store.body, pngBytes) {
		t.Errorf("stored %d bytes, want the whole %d-byte body", len(store.body), len(pngBytes))
	}
}
