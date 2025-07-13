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
	_ = os.MkdirAll("data", os.ModePerm)
	dbPath := filepath.Join("data", "noteblock.sqlite")

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		panic("failed to open DB: " + err.Error())
	}
	db.Exec("PRAGMA foreign_keys = ON")

	// TODO: remove in production
	// db.Migrator().DropTable(&model.Note{}, &model.Folder{}, &model.Block{}) // order matters
	db.AutoMigrate(&model.Folder{}, &model.Note{}, &model.Block{}, &model.TextBlock{}, &model.CanvasBlock{}, &model.ImageBlock{})

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
