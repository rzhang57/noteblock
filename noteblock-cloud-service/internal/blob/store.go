package blob

import (
	"context"
	"errors"
	"io"
)

var ErrNotFound = errors.New("blob not found")

// Keys are the sidecar's own filenames (<uuid>_<original>), which are already unique across
// devices, so nothing here allocates identifiers or needs to know what a note is.
type Store interface {
	Put(ctx context.Context, key string, r io.Reader, contentType string) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Exists(ctx context.Context, key string) (bool, error)
}
