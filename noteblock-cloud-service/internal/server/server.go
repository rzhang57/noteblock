package server

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	_ "github.com/joho/godotenv/autoload"

	"gorm.io/gorm"

	"noteblock-cloud-service/internal/database"
)

type Server struct {
	port int

	db   database.Service
	gorm *gorm.DB
}

// The raw database/sql handle only knows how to reach Postgres, so in local sqlite mode
// there is nothing for it to connect to and health reports on the gorm connection instead.
func maybeLegacyDB() database.Service {
	if os.Getenv("BLUEPRINT_DB_SQLITE_PATH") != "" {
		return nil
	}

	return database.New()
}

func NewServer() *http.Server {
	port, _ := strconv.Atoi(os.Getenv("PORT"))
	gormDB, err := database.OpenGorm()
	if err != nil {
		log.Fatalf("cloud database unavailable: %v", err)
	}

	NewServer := &Server{
		port: port,

		db:   maybeLegacyDB(),
		gorm: gormDB,
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
