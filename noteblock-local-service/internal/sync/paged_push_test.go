package sync

import (
	"context"
	"fmt"
	"testing"
	"time"

	"server/internal/model"
)

func seedNotesAt(t *testing.T, f *fixture, count int, at func(i int) time.Time) {
	t.Helper()

	for i := range count {
		stamp := at(i)
		if err := f.conn.Exec(
			"INSERT INTO notes (id, title, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			fmt.Sprintf("n%04d", i), fmt.Sprintf("Note %04d", i), model.LocalUserID, stamp, stamp,
		).Error; err != nil {
			t.Fatalf("seed note %d: %v", i, err)
		}
	}
}

func drainFully(t *testing.T, engine *Engine, passes int) {
	t.Helper()

	for range passes {
		if err := engine.Pass(context.Background()); err != nil {
			t.Fatalf("pass: %v", err)
		}
	}
}

// The focused note is normally the newest one pending. Taking the batch's high-water mark as the
// cursor strands every older note behind it, permanently.
func TestAPagedPushWithANoteOnScreenStillDeliversTheBacklog(t *testing.T) {
	f := newFixture(t)
	cloud := newFakeCloud(t)
	engine := newEngineFor(t, f, cloud)

	base := time.Now().UTC().Add(-time.Hour)
	const total = 130
	seedNotesAt(t, f, total, func(i int) time.Time { return base.Add(time.Duration(i) * time.Second) })

	engine.Focus(context.Background(), fmt.Sprintf("n%04d", total-1))
	drainFully(t, engine, 8)

	if len(cloud.notes) != total {
		var missing []string
		for i := range total {
			id := fmt.Sprintf("n%04d", i)
			if _, ok := cloud.notes[id]; !ok {
				missing = append(missing, id)
			}
		}
		t.Fatalf("cloud has %d of %d notes; %d never arrived and sit below the cursor: %v",
			len(cloud.notes), total, len(missing), missing[:min(5, len(missing))])
	}
}

// Migration 0005 stamps every root-level note with one identical updated_at, because SQLite
// evaluates 'now' once per statement. More than one page of those must still converge.
func TestMoreThanOnePageSharingOneInstantAllArrive(t *testing.T) {
	f := newFixture(t)
	cloud := newFakeCloud(t)
	engine := newEngineFor(t, f, cloud)

	at := time.Now().UTC().Add(-time.Hour).Truncate(time.Millisecond)
	const total = 130
	seedNotesAt(t, f, total, func(int) time.Time { return at })

	before := cloud.requests
	drainFully(t, engine, 3)

	if len(cloud.notes) != total {
		t.Fatalf("cloud has %d of %d notes sharing one instant; the cursor cannot split them", len(cloud.notes), total)
	}
	if cloud.requests-before > 30 {
		t.Errorf("%d round trips for %d notes; the pass is looping on an instant it cannot advance past",
			cloud.requests-before, total)
	}
}
