package db

import (
	"os"
	"path/filepath"
	model2 "server/internal/model"

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

	// TODO: fix auto migrations so that tables are dropped if schemas change
	db.AutoMigrate(&model2.Folder{}, &model2.Note{})
	return db
}
