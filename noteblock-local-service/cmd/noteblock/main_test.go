package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"server/internal/db"
	"server/internal/sync"
)

// The reset is requested by the process Electron spawns, so the only honest proof is a spawn.
// Nothing else would notice the entrypoint losing the call: Go does not flag an unused function.
func TestSpawningWithAResetRequestClearsTheCursors(t *testing.T) {
	if testing.Short() {
		t.Skip("builds and runs the sidecar binary")
	}

	dir := t.TempDir()
	binary := filepath.Join(t.TempDir(), "noteblock-server.exe")
	if out, err := exec.Command("go", "build", "-o", binary, ".").CombinedOutput(); err != nil {
		t.Fatalf("build sidecar: %v\n%s", err, out)
	}

	seed := func() {
		conn, err := db.Open(filepath.Join(dir, "noteblock.sqlite"))
		if err != nil {
			t.Fatalf("open db: %v", err)
		}
		defer func() {
			if sqlDB, err := conn.DB(); err == nil {
				sqlDB.Close()
			}
		}()

		pushed := time.Now().UTC().Add(time.Hour)
		if err := sync.SaveCursors(conn, sync.Cursors{LastPushedLocal: &pushed, LastPulledServer: "srv-token-old"}); err != nil {
			t.Fatalf("save cursors: %v", err)
		}
	}

	// Stdin closed, so the IPC loop reaches EOF and the process exits on its own.
	spawn := func(env ...string) {
		cmd := exec.Command(binary)
		cmd.Env = append(os.Environ(), append([]string{"NOTE_DB_PATH=" + dir}, env...)...)
		cmd.Stdin = nil
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("run sidecar: %v\n%s", err, out)
		}
	}

	read := func() sync.Cursors {
		conn, err := db.Open(filepath.Join(dir, "noteblock.sqlite"))
		if err != nil {
			t.Fatalf("open db: %v", err)
		}
		defer func() {
			if sqlDB, err := conn.DB(); err == nil {
				sqlDB.Close()
			}
		}()

		got, err := (&sync.Store{DB: conn}).Cursors()
		if err != nil {
			t.Fatalf("read cursors: %v", err)
		}
		return got
	}

	seed()
	spawn()
	if got := read(); got.LastPushedLocal == nil || got.LastPulledServer != "srv-token-old" {
		t.Fatalf("an ordinary launch must leave the cursors alone, got %+v", got)
	}

	spawn(sync.ResetEnv + "=1")
	if got := read(); got.LastPushedLocal != nil || got.LastPulledServer != "" {
		t.Fatalf("a launch with %s set must clear the cursors, got %+v", sync.ResetEnv, got)
	}
}
