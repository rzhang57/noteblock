package db

import (
	"os"
	"path/filepath"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"server/model"
)

func InitDb() *gorm.DB {
	_ = os.MkdirAll("data", os.ModePerm)
	dbPath := filepath.Join("data", "noteblock.sqlite")

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		panic("failed to open DB: " + err.Error())
	}

	// TODO: fix auto migrations so that tables are dropped if schemas change
	db.AutoMigrate(&model.Folder{}, &model.Note{})
	return db
}
