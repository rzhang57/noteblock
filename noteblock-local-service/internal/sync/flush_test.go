package sync

import (
	"context"
	"errors"
	"testing"
	"time"
)

// Pass yields to an in-flight pass, which is right for a ticker. Flush must not: reporting
// success after skipping the work would be a lie told exactly when it matters.
func TestFlushWaitsForAnInFlightPassWhilePassYields(t *testing.T) {
	f := newFixture(t)
	cloud := newFakeCloud(t)
	engine := newEngineFor(t, f, cloud)

	engine.running <- struct{}{}

	if err := engine.Pass(context.Background()); err != nil {
		t.Fatalf("Pass should yield to the in-flight pass, not error: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()

	err := engine.Flush(ctx)
	if err == nil {
		t.Fatal("Flush reported success while another pass still held the slot")
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("err = %v, want a deadline while waiting for the slot", err)
	}

	<-engine.running

	if err := engine.Flush(context.Background()); err != nil {
		t.Errorf("Flush failed once the slot was free: %v", err)
	}
}
