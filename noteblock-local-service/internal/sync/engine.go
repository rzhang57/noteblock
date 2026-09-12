package sync

import (
	"context"
	"log"
	"sync"
	"time"

	"gorm.io/gorm"
)

const DefaultInterval = 30 * time.Second

type Engine struct {
	DB       *gorm.DB
	Store    *Store
	Client   *Client
	Interval time.Duration

	// One pass at a time: concurrent passes would race on both cursors and on the
	// single SQLite writer, and one could advance a cursor past records the other has not applied.
	running sync.Mutex
}

func NewEngine(db *gorm.DB, baseURL string, interval time.Duration) *Engine {
	if interval <= 0 {
		interval = DefaultInterval
	}

	return &Engine{
		DB:       db,
		Store:    &Store{DB: db},
		Client:   NewClient(baseURL),
		Interval: interval,
	}
}

// Run ticks until ctx is cancelled. A failed pass is a non-event: the cursors do not move,
// so the next tick re-scans the same window and converges anyway.
func (e *Engine) Run(ctx context.Context) {
	ticker := time.NewTicker(e.Interval)
	defer ticker.Stop()

	if err := e.Pass(ctx); err != nil {
		log.Printf("sync: %v", err)
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := e.Pass(ctx); err != nil {
				log.Printf("sync: %v", err)
			}
		}
	}
}

func (e *Engine) Pass(ctx context.Context) error {
	if !e.running.TryLock() {
		return nil
	}
	defer e.running.Unlock()

	cursors, err := e.Store.Cursors()
	if err != nil {
		return err
	}

	// Captured before the scan so anything written during the round trip is caught next pass
	// rather than falling into the gap between scanning and committing.
	scanStart := time.Now().UTC()

	outgoing, err := e.Store.ChangedSince(cursors.LastPushedLocal)
	if err != nil {
		return err
	}

	if outgoing.IsEmpty() && cursors.LastPulledServer != "" {
		return e.pull(ctx, cursors, scanStart)
	}

	return e.exchange(ctx, cursors, outgoing, scanStart)
}

func (e *Engine) pull(ctx context.Context, cursors Cursors, scanStart time.Time) error {
	return e.exchange(ctx, cursors, Changes{}, scanStart)
}

func (e *Engine) exchange(ctx context.Context, cursors Cursors, outgoing Changes, scanStart time.Time) error {
	res, err := e.Client.Sync(ctx, cursors.LastPulledServer, outgoing)
	if err != nil {
		return err
	}

	incoming := Changes{Notes: res.Notes, Folders: res.Folders}

	// Both cursors advance in the same transaction that applies the pull. Advancing either
	// one early loses data silently; advancing late costs one redundant round trip.
	return e.DB.Transaction(func(tx *gorm.DB) error {
		if err := Apply(tx, incoming); err != nil {
			return err
		}

		return SaveCursors(tx, Cursors{
			LastPushedLocal:  &scanStart,
			LastPulledServer: res.ServerTime,
		})
	})
}
