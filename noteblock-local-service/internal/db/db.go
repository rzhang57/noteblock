package db

import (
	"log"
	"os"
	"path/filepath"

	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// SQLite compares datetimes lexically, so a local-offset timestamp and a UTC one for the same
// instant do not order correctly. Everything is stored UTC.
func utcNow() time.Time {
	return time.Now().UTC()
}

// Open is the single place the connection is configured, so tests cannot drift from production.
// GORM logs to stdout by default, which is the IPC protocol stream. A slow-query warning there
// would be parsed as a response.
func stderrLogger() logger.Interface {
	return logger.New(log.New(os.Stderr, "", log.LstdFlags), logger.Config{
		SlowThreshold: 200 * time.Millisecond,
		LogLevel:      logger.Warn,
	})
}

func Open(dbPath string) (*gorm.DB, error) {
	// Pragmas belong in the DSN, not an Exec: they are per-connection, and an Exec only
	// configures whichever pooled connection happened to serve it.
	dsn := dbPath + "?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000"

	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{NowFunc: utcNow, Logger: stderrLogger()})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	// SQLite takes one writer at a time, and the sync goroutine now writes alongside the
	// IPC loop. One connection serialises them instead of letting them race to SQLITE_BUSY.
	sqlDB.SetMaxOpenConns(1)

	if err := Migrate(db, Migrations); err != nil {
		return nil, err
	}

	return db, nil
}

func InitDb() *gorm.DB {
	// Check if Electron gave us a NOTE_DB_PATH
	basePath := os.Getenv("NOTE_DB_PATH")
	if basePath == "" {
		// Fallback for dev: use local "data" folder
		basePath = "data"
	}

	// Ensure folder exists
	if err := os.MkdirAll(basePath, os.ModePerm); err != nil {
		log.Fatalf("failed to create db directory: %v", err)
	}

	dbPath := filepath.Join(basePath, "noteblock.sqlite")
	log.Println("Using database at:", dbPath)

	db, err := Open(dbPath)
	if err != nil {
		log.Fatalf("failed to open DB: %v", err)
	}

	return db
}
