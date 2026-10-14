package server

import (
	"bufio"
	"errors"
	"io"
	"mime"
	"net/http"
	"path/filepath"

	"github.com/gin-gonic/gin"

	"noteblock-cloud-service/internal/blob"
)

const maxImageBytes = 25 << 20

// What http.DetectContentType reads; more is wasted and less weakens the sniff.
const sniffLen = 512

// The sidecar announces every upload as application/octet-stream, and a storage bucket that
// restricts its allowed types rejects that outright - Supabase Storage does. The bytes are a better
// witness than the header anyway, so a declared type is only trusted when it says something.
func imageContentType(declared, key string, head []byte) string {
	if declared != "" && declared != "application/octet-stream" {
		return declared
	}

	if len(head) > 0 {
		if sniffed := http.DetectContentType(head); sniffed != "application/octet-stream" {
			return sniffed
		}
	}

	return mime.TypeByExtension(filepath.Ext(key))
}

// Keys are filenames the sidecar generated; anything carrying a path is a client bug or worse.
func imageKey(c *gin.Context) (string, bool) {
	key := c.Param("key")
	if key == "" || key != filepath.Base(key) || key == "." || key == ".." {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid image key"})
		return "", false
	}

	return key, true
}

func (s *Server) imagePut(c *gin.Context) {
	key, ok := imageKey(c)
	if !ok {
		return
	}

	// Re-uploading the same key is a no-op: the bytes behind a given uuid never change.
	exists, err := s.blobs.Exists(c.Request.Context(), key)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "storage unavailable"})
		return
	}
	if exists {
		c.JSON(http.StatusOK, gin.H{"key": key, "stored": false})
		return
	}

	// Peeked rather than read: bufio keeps the bytes for Put, so sniffing costs nothing.
	body := bufio.NewReader(http.MaxBytesReader(c.Writer, c.Request.Body, maxImageBytes))
	head, _ := body.Peek(sniffLen)

	if err := s.blobs.Put(c.Request.Context(), key, body, imageContentType(c.ContentType(), key, head)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store image"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"key": key, "stored": true})
}

func (s *Server) imageGet(c *gin.Context) {
	key, ok := imageKey(c)
	if !ok {
		return
	}

	reader, err := s.blobs.Get(c.Request.Context(), key)
	if errors.Is(err, blob.ErrNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "image not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read image"})
		return
	}
	defer reader.Close()

	c.Status(http.StatusOK)
	if _, err := io.Copy(c.Writer, reader); err != nil {
		c.Error(err)
	}
}

func (s *Server) imageHead(c *gin.Context) {
	key, ok := imageKey(c)
	if !ok {
		return
	}

	exists, err := s.blobs.Exists(c.Request.Context(), key)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	if !exists {
		c.Status(http.StatusNotFound)
		return
	}

	c.Status(http.StatusOK)
}
