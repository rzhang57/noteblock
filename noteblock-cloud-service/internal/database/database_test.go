package database

import (
	"context"
	"fmt"
	"log"
	"os"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func mustStartPostgresContainer() (func(context.Context, ...testcontainers.TerminateOption) error, error) {
	var (
		dbName = "database"
		dbPwd  = "password"
		dbUser = "user"
	)

	dbContainer, err := postgres.Run(
		context.Background(),
		"postgres:latest",
		postgres.WithDatabase(dbName),
		postgres.WithUsername(dbUser),
		postgres.WithPassword(dbPwd),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(5*time.Second)),
	)
	if err != nil {
		return nil, err
	}

	os.Setenv("BLUEPRINT_DB_DATABASE", dbName)
	os.Setenv("BLUEPRINT_DB_PASSWORD", dbPwd)
	os.Setenv("BLUEPRINT_DB_USERNAME", dbUser)
	// The container serves plaintext; production defaults to require.
	os.Setenv("BLUEPRINT_DB_SSLMODE", "disable")

	dbHost, err := dbContainer.Host(context.Background())
	if err != nil {
		return dbContainer.Terminate, err
	}

	dbPort, err := dbContainer.MappedPort(context.Background(), "5432/tcp")
	if err != nil {
		return dbContainer.Terminate, err
	}

	os.Setenv("BLUEPRINT_DB_HOST", dbHost)
	os.Setenv("BLUEPRINT_DB_PORT", dbPort.Port())

	return dbContainer.Terminate, err
}

// Without a container the Postgres-backed tests skip rather than taking the whole package down,
// so the pure unit tests in here stay runnable on a machine with no Docker.
var postgresAvailable bool

func requirePostgres(t *testing.T) {
	t.Helper()

	if !postgresAvailable {
		t.Skip("no Postgres container available")
	}
}

// testcontainers panics rather than returning an error when there is no Docker host, which would
// take the whole package down on a machine that only wants the unit tests.
func startPostgresContainerIfPossible() (teardown func(context.Context, ...testcontainers.TerminateOption) error, err error) {
	defer func() {
		if r := recover(); r != nil {
			teardown, err = nil, fmt.Errorf("%v", r)
		}
	}()

	return mustStartPostgresContainer()
}

func TestMain(m *testing.M) {
	teardown, err := startPostgresContainerIfPossible()
	if err != nil {
		// Docker is always present on CI, so a container that will not start there is a real
		// failure rather than a machine without Docker.
		if os.Getenv("CI") != "" {
			log.Fatalf("postgres container unavailable on CI: %v", err)
		}
		log.Printf("postgres container unavailable, skipping database-backed tests: %v", err)
	} else {
		postgresAvailable = true
	}

	m.Run()

	if teardown != nil && teardown(context.Background()) != nil {
		log.Fatalf("could not teardown postgres container: %v", err)
	}
}

func TestNew(t *testing.T) {
	requirePostgres(t)

	srv := New()
	if srv == nil {
		t.Fatal("New() returned nil")
	}
}

func TestHealth(t *testing.T) {
	requirePostgres(t)

	srv := New()

	stats := srv.Health()

	if stats["status"] != "up" {
		t.Fatalf("expected status to be up, got %s", stats["status"])
	}

	if _, ok := stats["error"]; ok {
		t.Fatalf("expected error not to be present")
	}

	if stats["message"] != "It's healthy" {
		t.Fatalf("expected message to be 'It's healthy', got %s", stats["message"])
	}
}

func TestClose(t *testing.T) {
	requirePostgres(t)

	srv := New()

	if srv.Close() != nil {
		t.Fatalf("expected Close() to return nil")
	}
}
