package db

import (
	"log"
	"os"
	"path/filepath"
	"server/internal/model"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

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

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		panic("failed to open DB: " + err.Error())
	}
	db.Exec("PRAGMA foreign_keys = ON")

	//////TODO: remove in production
	//db.Migrator().DropTable(&model.Block{}, &model.Note{}, &model.Folder{})
	db.AutoMigrate(&model.Block{}, &model.Note{}, &model.Folder{})

	var count int64
	db.Model(&model.Folder{}).Where("id = root", "root").Count(&count)
	if count == 0 {
		db.Create(&model.Folder{
			ID:   "root",
			Name: "Root",
		})
		log.Println("Created root folder with ID 'root'")
	}

	return db
}
