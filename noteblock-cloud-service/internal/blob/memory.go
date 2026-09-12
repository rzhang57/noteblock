package blob

import (
	"bytes"
	"context"
	"io"
	"sync"
)

type Memory struct {
	mu    sync.RWMutex
	items map[string][]byte
}

func NewMemory() *Memory {
	return &Memory{items: map[string][]byte{}}
}

func (m *Memory) Put(_ context.Context, key string, r io.Reader, _ string) error {
	data, err := io.ReadAll(r)
	if err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.items[key] = data

	return nil
}

func (m *Memory) Get(_ context.Context, key string) (io.ReadCloser, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	data, ok := m.items[key]
	if !ok {
		return nil, ErrNotFound
	}

	return io.NopCloser(bytes.NewReader(data)), nil
}

func (m *Memory) Exists(_ context.Context, key string) (bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	_, ok := m.items[key]

	return ok, nil
}
