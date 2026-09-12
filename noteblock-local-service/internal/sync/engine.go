package sync

import (
	"context"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"gorm.io/gorm"
)

const DefaultInterval = 30 * time.Second

// A bound rather than a target: a batch that somehow makes no progress must not spin.
const maxBatchesPerPass = 200

type Engine struct {
	DB       *gorm.DB
	Store    *Store
	Client   *Client
	Interval time.Duration

	// One pass at a time: concurrent passes would race on both cursors and on the
	// single SQLite writer, and one could advance a cursor past records the other has not applied.
	running sync.Mutex
	focus   atomic.Value
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

// Batches are drained inside the one lock rather than one per tick, so a first sync finishes
// in one go instead of taking interval × corpus/batch to catch up.
func (e *Engine) Pass(ctx context.Context) error {
	if !e.running.TryLock() {
		return nil
	}
	defer e.running.Unlock()

	for range maxBatchesPerPass {
		complete, err := e.pass(ctx)
		if err != nil {
			return err
		}
		if complete {
			return nil
		}
		if err := ctx.Err(); err != nil {
			return err
		}
	}

	// More still waiting, but the next tick can have it; looping forever would be worse.
	return nil
}

func (e *Engine) pass(ctx context.Context) (bool, error) {
	cursors, err := e.Store.Cursors()
	if err != nil {
		return false, err
	}

	// Captured before the scan so anything written during the round trip is caught next pass
	// rather than falling into the gap between scanning and committing.
	scanStart := time.Now().UTC()

	outgoing, err := e.Store.ChangedSince(cursors.LastPushedLocal)
	if err != nil {
		return false, err
	}

	page := paginate(outgoing, e.Focused(), MaxNotesPerPass)

	// A partial page has more waiting, so the cursor stops at the batch's high-water mark
	// and the next tick carries on from there rather than skipping the remainder.
	pushedThrough := scanStart
	if !page.Complete {
		pushedThrough = *page.Through
	}

	// Always exchange, even with nothing to push: the pull is how this device learns
	// whether the other one has news.
	if err := e.exchange(ctx, cursors, page.Changes, pushedThrough); err != nil {
		return false, err
	}

	return page.Complete, nil
}

// Focus names the note on screen so the next pass sends it first. Setting it kicks a pass,
// because the point is that the note you just opened reaches the other device quickly.
func (e *Engine) Focus(ctx context.Context, noteID string) {
	e.focus.Store(noteID)

	go func() {
		if err := e.Pass(context.WithoutCancel(ctx)); err != nil {
			log.Printf("sync: %v", err)
		}
	}()
}

func (e *Engine) Focused() string {
	focused, _ := e.focus.Load().(string)

	return focused
}

func (e *Engine) exchange(ctx context.Context, cursors Cursors, outgoing Changes, scanStart time.Time) error {
	// Before the push, so a note never lands on the server describing bytes that are not there.
	e.pushImages(ctx, outgoing)

	res, err := e.Client.Sync(ctx, cursors.LastPulledServer, outgoing)
	if err != nil {
		return err
	}

	incoming := Changes{Notes: res.Notes, Folders: res.Folders}
	e.fetchImages(ctx, incoming)

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
