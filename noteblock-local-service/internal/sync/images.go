package sync

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"server/internal/model"
)

const imageURLPrefix = "noteblock-image:///"

// ImagesDir mirrors SaveImageBytes and the Electron protocol handler. All three must resolve
// to the same place or images written on one path cannot be read back on another.
func ImagesDir() string {
	base := os.Getenv("NOTE_DB_PATH")
	if base == "" {
		base = "data"
	}

	return filepath.Join(base, "uploads", "images")
}

// Filenames are already <uuid>_<original>, unique across devices, so they are the storage key.
func imageFilenames(docs []NoteDocument) []string {
	seen := map[string]bool{}
	var names []string

	for _, doc := range docs {
		for _, block := range doc.Blocks {
			if block.Type != "image" {
				continue
			}

			var content struct {
				URL string `json:"url"`
			}
			if err := json.Unmarshal(block.Content, &content); err != nil {
				continue
			}
			name := strings.TrimPrefix(content.URL, imageURLPrefix)
			if name == "" || name == content.URL || name != filepath.Base(name) || seen[name] {
				continue
			}

			seen[name] = true
			names = append(names, name)
		}
	}

	return names
}

// Images ride their own requests, never the note payload, so one large paste cannot push a
// sync body past the point where it stops fitting in a single round trip.
func (e *Engine) pushImages(ctx context.Context, outgoing Changes) {
	for _, name := range imageFilenames(outgoing.Notes) {
		var uploaded []model.ImageUpload
		if err := e.DB.Where("filename = ?", name).Limit(1).Find(&uploaded).Error; err != nil {
			log.Printf("sync images: %v", err)
			continue
		}
		if len(uploaded) == 1 {
			continue
		}

		file, err := os.Open(filepath.Join(ImagesDir(), name))
		if err != nil {
			// A note can reference a file this device never had, which is normal mid-pull.
			continue
		}

		err = e.Client.PutImage(ctx, name, file)
		file.Close()
		if err != nil {
			log.Printf("sync images: upload %s: %v", name, err)
			continue
		}

		record := model.ImageUpload{Filename: name, UploadedAt: time.Now().UTC()}
		if err := e.DB.Save(&record).Error; err != nil {
			log.Printf("sync images: record %s: %v", name, err)
		}
	}
}

// Fetched eagerly so the Electron protocol handler needs no changes: by the time the renderer
// resolves the url, the file is already on disk.
func (e *Engine) fetchImages(ctx context.Context, incoming Changes) {
	dir := ImagesDir()

	for _, name := range imageFilenames(incoming.Notes) {
		path := filepath.Join(dir, name)
		if _, err := os.Stat(path); err == nil {
			continue
		}

		if err := os.MkdirAll(dir, os.ModePerm); err != nil {
			log.Printf("sync images: %v", err)
			return
		}
		if err := e.Client.GetImage(ctx, name, path); err != nil {
			log.Printf("sync images: fetch %s: %v", name, err)
			continue
		}

		// Already on the server, so it never needs uploading from here.
		record := model.ImageUpload{Filename: name, UploadedAt: time.Now().UTC()}
		if err := e.DB.Save(&record).Error; err != nil {
			log.Printf("sync images: record %s: %v", name, err)
		}
	}
}
