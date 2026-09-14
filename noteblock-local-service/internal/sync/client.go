package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type request struct {
	Since   *string          `json:"since"`
	Notes   []NoteDocument   `json:"notes"`
	Folders []FolderDocument `json:"folders"`
}

type response struct {
	Notes      []NoteDocument   `json:"notes"`
	Folders    []FolderDocument `json:"folders"`
	ServerTime string           `json:"server_time"`
}

type Client struct {
	BaseURL string
	HTTP    *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		// A trailing slash would build "//sync", which Gin does not route, and the only
		// symptom is a bare 404 that points nowhere near the env var at fault.
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) Sync(ctx context.Context, since string, changes Changes) (response, error) {
	body := request{Notes: changes.Notes, Folders: changes.Folders}
	if since != "" {
		body.Since = &since
	}
	if body.Notes == nil {
		body.Notes = []NoteDocument{}
	}
	if body.Folders == nil {
		body.Folders = []FolderDocument{}
	}

	encoded, err := json.Marshal(body)
	if err != nil {
		return response{}, fmt.Errorf("encode sync request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/sync", bytes.NewReader(encoded))
	if err != nil {
		return response{}, fmt.Errorf("build sync request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := c.HTTP.Do(req)
	if err != nil {
		return response{}, fmt.Errorf("sync request: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return response{}, fmt.Errorf("sync returned %s", res.Status)
	}

	var decoded response
	if err := json.NewDecoder(res.Body).Decode(&decoded); err != nil {
		return response{}, fmt.Errorf("decode sync response: %w", err)
	}

	return decoded, nil
}

func (c *Client) PutImage(ctx context.Context, key string, body io.Reader) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, c.imageURL(key), body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/octet-stream")

	res, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("image upload returned %s", res.Status)
	}

	return nil
}

// Written aside and renamed so a failed fetch cannot leave a truncated image where the
// protocol handler would happily serve it.
const maxImageBytes = 25 << 20

func (c *Client) GetImage(ctx context.Context, key string, dest string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.imageURL(key), nil)
	if err != nil {
		return err
	}

	res, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("image fetch returned %s", res.Status)
	}

	tmp, err := os.CreateTemp(filepath.Dir(dest), ".partial-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())

	// The server chooses these bytes, so the write is capped the same way the upload is; without
	// it a peer can fill the disk of every device that pulls.
	written, err := io.Copy(tmp, io.LimitReader(res.Body, maxImageBytes+1))
	if err != nil {
		tmp.Close()
		return err
	}
	if written > maxImageBytes {
		tmp.Close()
		return fmt.Errorf("image %s exceeds %d bytes", key, maxImageBytes)
	}
	if err := tmp.Close(); err != nil {
		return err
	}

	return os.Rename(tmp.Name(), dest)
}

func (c *Client) imageURL(key string) string {
	return c.BaseURL + "/images/" + url.PathEscape(key)
}
