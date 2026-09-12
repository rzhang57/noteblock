package db

import (
	"log"
	"os"
	"path/filepath"
	"server/internal/model"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// SQLite compares datetimes lexically, so a local-offset timestamp and a UTC one for the same
// instant do not order correctly. Everything is stored UTC.
func utcNow() time.Time {
	return time.Now().UTC()
}

// Open is the single place the connection is configured, so tests cannot drift from production.
func Open(dbPath string) (*gorm.DB, error) {
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{NowFunc: utcNow})
	if err != nil {
		return nil, err
	}

	db.Exec("PRAGMA foreign_keys = ON")

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

	var count int64
	if err := db.Model(&model.Folder{}).Where("id = ?", "root").Count(&count).Error; err != nil {
		log.Fatalf("failed to check for root folder: %v", err)
	}
	if count == 0 {
		if err := db.Create(&model.Folder{
			ID:   "root",
			Name: "Root",
		}).Error; err != nil {
			log.Fatalf("failed to create root folder: %v", err)
		}
		log.Println("Created root folder with ID 'root'")
	}

	return db
}
