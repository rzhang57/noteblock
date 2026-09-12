package database

import (
	"fmt"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"noteblock-cloud-service/internal/model"
)

func OpenGorm() (*gorm.DB, error) {
	connStr := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s&search_path=%s",
		os.Getenv("BLUEPRINT_DB_USERNAME"),
		os.Getenv("BLUEPRINT_DB_PASSWORD"),
		os.Getenv("BLUEPRINT_DB_HOST"),
		os.Getenv("BLUEPRINT_DB_PORT"),
		os.Getenv("BLUEPRINT_DB_DATABASE"),
		sslMode(),
		os.Getenv("BLUEPRINT_DB_SCHEMA"),
	)

	db, err := gorm.Open(postgres.Open(connStr), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open gorm: %w", err)
	}

	if err := Migrate(db); err != nil {
		return nil, err
	}

	return db, nil
}

func Migrate(db *gorm.DB) error {
	if err := db.AutoMigrate(&model.CloudFolder{}, &model.CloudNote{}); err != nil {
		return fmt.Errorf("migrate cloud schema: %w", err)
	}

	return nil
}

// Supabase requires TLS; a local Postgres in a container usually has none.
func sslMode() string {
	if mode := os.Getenv("BLUEPRINT_DB_SSLMODE"); mode != "" {
		return mode
	}

	return "disable"
}
