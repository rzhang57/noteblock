package database

import (
	"os"
	"testing"
	"time"

	"gorm.io/gorm"

	"noteblock-cloud-service/internal/model"
)

func openAgainstContainer(t *testing.T) *gorm.DB {
	t.Helper()
	requirePostgres(t)

	// TestMain put the container's details in the environment already; only the schema differs.
	t.Setenv("BLUEPRINT_DB_SCHEMA", "public")
	os.Unsetenv("BLUEPRINT_DB_SQLITE_PATH")

	db, err := OpenGorm()
	if err != nil {
		t.Fatalf("open gorm against postgres: %v", err)
	}

	return db
}

// Ids are opaque strings chosen by the client. Declaring those columns as uuid makes Postgres
// reject them outright, which the SQLite suites cannot see because SQLite ignores declared types.
func TestRecordsWithNonUuidIdsArePersistable(t *testing.T) {
	db := openAgainstContainer(t)

	note := model.CloudNote{
		ID:              "9564241e-b8c1-4179-b525-debbb5e09b7a",
		UserID:          model.LocalUserID,
		FolderID:        nil,
		Data:            model.JSONB{"id": "9564241e-b8c1-4179-b525-debbb5e09b7a", "folder_id": nil},
		ClientUpdatedAt: time.Now().UTC(),
		ServerUpdatedAt: time.Now().UTC(),
	}

	if err := db.Create(&note).Error; err != nil {
		t.Fatalf("a top-level note could not be stored: %v", err)
	}

	folder := model.CloudFolder{
		ID:              "not-a-uuid-either",
		UserID:          model.LocalUserID,
		Data:            model.JSONB{"id": "not-a-uuid-either"},
		ClientUpdatedAt: time.Now().UTC(),
		ServerUpdatedAt: time.Now().UTC(),
	}

	if err := db.Create(&folder).Error; err != nil {
		t.Fatalf("a folder with a non-uuid id could not be stored: %v", err)
	}
}

func TestJsonbRoundTripsThroughPostgres(t *testing.T) {
	db := openAgainstContainer(t)

	stored := model.CloudNote{
		ID:              "jsonb-round-trip",
		UserID:          model.LocalUserID,
		FolderID:        nil,
		Data:            model.JSONB{"title": "CS341", "blocks": []any{map[string]any{"content": map[string]any{"text": "hello"}}}},
		ClientUpdatedAt: time.Now().UTC(),
		ServerUpdatedAt: time.Now().UTC(),
	}
	if err := db.Create(&stored).Error; err != nil {
		t.Fatalf("create: %v", err)
	}

	var read model.CloudNote
	if err := db.First(&read, "id = ?", stored.ID).Error; err != nil {
		t.Fatalf("read back: %v", err)
	}
	if read.Data["title"] != "CS341" {
		t.Errorf("Data = %v, want the stored document", read.Data)
	}
}
