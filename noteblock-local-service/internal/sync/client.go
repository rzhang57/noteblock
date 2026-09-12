package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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
		BaseURL: baseURL,
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
