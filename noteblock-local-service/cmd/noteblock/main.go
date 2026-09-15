package main

import (
	"context"
	"log"
	"os"
	"strconv"
	"time"

	"gorm.io/gorm"

	"server/internal/db"
	"server/internal/ipc"
	"server/internal/service"
	"server/internal/sync"
)

func main() {
	dbConn := db.InitDb()

	// services
	nSvc := &service.NoteService{DB: dbConn}
	fSvc := &service.FolderService{DB: dbConn, NoteService: nSvc}
	bSvc := &service.BlockService{DB: dbConn}

	server := ipc.NewServer(nSvc, fSvc, bSvc)

	// Before the engine exists: a cursor reset delivered to a running engine is silently undone
	// by whichever pass was already in flight.
	if err := sync.ResetCursorsIfRequested(dbConn, os.Getenv(sync.ResetEnv)); err != nil {
		log.Fatalf("could not reset sync cursors: %v", err)
	}

	if engine := newSyncEngine(dbConn); engine != nil {
		ctx, stop := context.WithCancel(context.Background())
		defer stop()

		server.SetFlusher(engine)
		go engine.Run(ctx)
	}

	if err := server.Run(os.Stdin, os.Stdout); err != nil {
		// stderr: stdout is the IPC protocol.
		log.Fatalf("ipc server terminated: %v", err)
	}
}

// Sync stays off unless a cloud URL is configured, so the app is fully usable with no
// cloud service running at all.
func newSyncEngine(dbConn *gorm.DB) *sync.Engine {
	baseURL := os.Getenv("NOTEBLOCK_CLOUD_URL")
	if baseURL == "" {
		log.Println("sync disabled: NOTEBLOCK_CLOUD_URL is not set")
		return nil
	}

	interval := sync.DefaultInterval
	if raw := os.Getenv("NOTEBLOCK_SYNC_INTERVAL_SECONDS"); raw != "" {
		if seconds, err := strconv.Atoi(raw); err == nil && seconds > 0 {
			interval = time.Duration(seconds) * time.Second
		}
	}

	log.Printf("sync enabled: %s every %s", baseURL, interval)

	return sync.NewEngine(dbConn, baseURL, interval)
}
