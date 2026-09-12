package server

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	_ "github.com/joho/godotenv/autoload"

	"gorm.io/gorm"

	"noteblock-cloud-service/internal/blob"
	"noteblock-cloud-service/internal/database"
)

type Server struct {
	port int

	db    database.Service
	gorm  *gorm.DB
	blobs blob.Store
}

// The raw database/sql handle only knows how to reach Postgres, so in local sqlite mode
// there is nothing for it to connect to and health reports on the gorm connection instead.
func maybeLegacyDB() database.Service {
	if os.Getenv("BLUEPRINT_DB_SQLITE_PATH") != "" {
		return nil
	}

	return database.New()
}

// S3 when a bucket is configured, otherwise files next to the database, so images work
// with nothing provisioned.
func mustBlobStore() blob.Store {
	if os.Getenv("BLOB_S3_BUCKET") != "" {
		store, err := blob.NewS3(context.Background())
		if err != nil {
			log.Fatalf("blob storage unavailable: %v", err)
		}
		return store
	}

	store, err := blob.NewFile(blobDir())
	if err != nil {
		log.Fatalf("blob storage unavailable: %v", err)
	}

	return store
}

func blobDir() string {
	if dir := os.Getenv("BLOB_FILE_DIR"); dir != "" {
		return dir
	}

	return filepath.Join(filepath.Dir(os.Getenv("BLUEPRINT_DB_SQLITE_PATH")), "cloud-images")
}

func NewServer() *http.Server {
	port, _ := strconv.Atoi(os.Getenv("PORT"))
	gormDB, err := database.OpenGorm()
	if err != nil {
		log.Fatalf("cloud database unavailable: %v", err)
	}

	NewServer := &Server{
		port: port,

		db:    maybeLegacyDB(),
		blobs: mustBlobStore(),
		gorm:  gormDB,
	}

	// Declare Server config
	server := &http.Server{
		// Loopback until the endpoint authenticates: an empty request body returns the whole corpus.
		Addr:         fmt.Sprintf("127.0.0.1:%d", NewServer.port),
		Handler:      NewServer.RegisterRoutes(),
		IdleTimeout:  time.Minute,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	return server
}
