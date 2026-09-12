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

func NewServer() *http.Server {
	port, _ := strconv.Atoi(os.Getenv("PORT"))
	gormDB, err := database.OpenGorm()
	if err != nil {
		log.Fatalf("cloud database unavailable: %v", err)
	}

	NewServer := &Server{
		port: port,

		db:   database.New(),
		gorm: gormDB,
	}

	// Declare Server config
	server := &http.Server{
		// default localhost 8080
		Addr:         fmt.Sprintf(":%d", NewServer.port),
		Handler:      NewServer.RegisterRoutes(),
		IdleTimeout:  time.Minute,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	return server
}
