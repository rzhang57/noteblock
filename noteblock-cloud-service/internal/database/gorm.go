package database

import (
	"fmt"
	"net"
	"net/url"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"noteblock-cloud-service/internal/model"
)

// Built through url.URL rather than by concatenation: pgx reads query parameters after the
// authority and lets them override it, so an "&host=" inside any single value would silently
// redirect the whole connection. Resolved at call time so a .env loaded in main is still seen.
func ConnString() string {
	query := url.Values{}
	query.Set("sslmode", sslMode())
	query.Set("search_path", os.Getenv("BLUEPRINT_DB_SCHEMA"))

	dsn := url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(os.Getenv("BLUEPRINT_DB_USERNAME"), os.Getenv("BLUEPRINT_DB_PASSWORD")),
		Host:     net.JoinHostPort(os.Getenv("BLUEPRINT_DB_HOST"), os.Getenv("BLUEPRINT_DB_PORT")),
		Path:     "/" + os.Getenv("BLUEPRINT_DB_DATABASE"),
		RawQuery: query.Encode(),
	}

	return dsn.String()
}

func OpenGorm() (*gorm.DB, error) {
	if path := os.Getenv("BLUEPRINT_DB_SQLITE_PATH"); path != "" {
		return openSqlite(path)
	}

	connStr := ConnString()

	db, err := gorm.Open(postgres.Open(connStr), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open gorm: %w", err)
	}

	if err := Migrate(db); err != nil {
		return nil, err
	}

	return db, nil
}

// Lets the whole sync path run end to end on a laptop with no Postgres and no Docker.
// Production always takes the connection-string branch above.
func openSqlite(path string) (*gorm.DB, error) {
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
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

	return "require"
}
