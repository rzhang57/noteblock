package blob

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// What the bundled service actually uses while dogfooding, so images work with no bucket.
type File struct {
	Dir string
}

func NewFile(dir string) (*File, error) {
	if err := os.MkdirAll(dir, os.ModePerm); err != nil {
		return nil, fmt.Errorf("create blob dir: %w", err)
	}

	return &File{Dir: dir}, nil
}

// Keys arrive over HTTP, so anything with a path in it is rejected rather than sanitised.
func (f *File) path(key string) (string, error) {
	if key == "" || key != filepath.Base(key) {
		return "", fmt.Errorf("invalid blob key %q", key)
	}

	return filepath.Join(f.Dir, key), nil
}

func (f *File) Put(_ context.Context, key string, r io.Reader, _ string) error {
	path, err := f.path(key)
	if err != nil {
		return err
	}

	// Written aside and renamed so a failed upload cannot leave a truncated image behind.
	tmp, err := os.CreateTemp(f.Dir, ".partial-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())

	if _, err := io.Copy(tmp, r); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}

	return os.Rename(tmp.Name(), path)
}

func (f *File) Get(_ context.Context, key string) (io.ReadCloser, error) {
	path, err := f.path(key)
	if err != nil {
		return nil, err
	}

	file, err := os.Open(path)
	if os.IsNotExist(err) {
		return nil, ErrNotFound
	}

	return file, err
}

func (f *File) Exists(_ context.Context, key string) (bool, error) {
	path, err := f.path(key)
	if err != nil {
		return false, err
	}

	_, err = os.Stat(path)
	if os.IsNotExist(err) {
		return false, nil
	}

	return err == nil, err
}
