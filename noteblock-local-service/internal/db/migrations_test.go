package db

import (
	"path/filepath"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"server/internal/model"
)

func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "test.sqlite")), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}

	// Windows cannot delete the TempDir while the connection still holds the file open.
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			sqlDB.Close()
		}
	})

	return db
}

func appliedIDs(t *testing.T, db *gorm.DB) []string {
	t.Helper()

	var ids []string
	if err := db.Table("schema_migrations").Order("id").Pluck("id", &ids).Error; err != nil {
		t.Fatalf("read ledger: %v", err)
	}

	return ids
}

func TestMigrateAppliesEachMigrationOnce(t *testing.T) {
	db := newTestDB(t)

	runs := 0
	migrations := []Migration{
		{ID: "0001_a", Up: func(tx *gorm.DB) error {
			runs++
			return tx.Exec("CREATE TABLE a (id TEXT)").Error
		}},
	}

	if err := Migrate(db, migrations); err != nil {
		t.Fatalf("first migrate: %v", err)
	}
	if err := Migrate(db, migrations); err != nil {
		t.Fatalf("second migrate: %v", err)
	}

	if runs != 1 {
		t.Errorf("migration ran %d times, want 1", runs)
	}
	if got := appliedIDs(t, db); len(got) != 1 || got[0] != "0001_a" {
		t.Errorf("ledger = %v, want [0001_a]", got)
	}
}

func TestMigrateAppliesOnlyNewMigrations(t *testing.T) {
	db := newTestDB(t)

	first := []Migration{
		{ID: "0001_a", Up: func(tx *gorm.DB) error { return tx.Exec("CREATE TABLE a (id TEXT)").Error }},
	}
	if err := Migrate(db, first); err != nil {
		t.Fatalf("first migrate: %v", err)
	}

	secondRan := false
	second := append(first, Migration{ID: "0002_b", Up: func(tx *gorm.DB) error {
		secondRan = true
		return tx.Exec("CREATE TABLE b (id TEXT)").Error
	}})
	if err := Migrate(db, second); err != nil {
		t.Fatalf("second migrate: %v", err)
	}

	if !secondRan {
		t.Error("0002_b did not run")
	}
	if got := appliedIDs(t, db); len(got) != 2 {
		t.Errorf("ledger = %v, want both migrations", got)
	}
}

func TestMigrateRollsBackAndDoesNotRecordOnFailure(t *testing.T) {
	db := newTestDB(t)

	migrations := []Migration{
		{ID: "0001_a", Up: func(tx *gorm.DB) error {
			if err := tx.Exec("CREATE TABLE a (id TEXT)").Error; err != nil {
				return err
			}
			return tx.Exec("THIS IS NOT SQL").Error
		}},
	}

	if err := Migrate(db, migrations); err == nil {
		t.Fatal("expected migrate to fail")
	}

	if got := appliedIDs(t, db); len(got) != 0 {
		t.Errorf("ledger = %v, want empty after failure", got)
	}
	if db.Migrator().HasTable("a") {
		t.Error("table a survived a failed migration; DDL was not rolled back")
	}
}

func TestMigrateRejectsDuplicateAndUnorderedIDs(t *testing.T) {
	noop := func(tx *gorm.DB) error { return nil }

	tests := map[string][]Migration{
		"duplicate": {{ID: "0001_a", Up: noop}, {ID: "0001_a", Up: noop}},
		"unordered": {{ID: "0002_b", Up: noop}, {ID: "0001_a", Up: noop}},
		"empty ID":  {{ID: "", Up: noop}},
	}

	for name, migrations := range tests {
		t.Run(name, func(t *testing.T) {
			if err := Migrate(newTestDB(t), migrations); err == nil {
				t.Error("expected an error")
			}
		})
	}
}

func TestBaselineAdoptsAnExistingAutoMigratedDatabase(t *testing.T) {
	db := newTestDB(t)

	if err := db.AutoMigrate(&model.Block{}, &model.Note{}, &model.Folder{}); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	folder := model.Folder{ID: "root", Name: "Root"}
	if err := db.Create(&folder).Error; err != nil {
		t.Fatalf("seed folder: %v", err)
	}
	note := model.Note{Title: "Existing", FolderID: "root"}
	if err := db.Create(&note).Error; err != nil {
		t.Fatalf("seed note: %v", err)
	}

	if err := Migrate(db, Migrations); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	var count int64
	if err := db.Model(&model.Note{}).Count(&count).Error; err != nil {
		t.Fatalf("count notes: %v", err)
	}
	if count != 1 {
		t.Errorf("note count = %d, want 1; baseline destroyed existing data", count)
	}
}

func TestBaselineCreatesSchemaOnAFreshDatabase(t *testing.T) {
	db := newTestDB(t)

	if err := Migrate(db, Migrations); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	for _, table := range []string{"folders", "notes", "blocks"} {
		if !db.Migrator().HasTable(table) {
			t.Errorf("table %s missing after baseline", table)
		}
	}

	// The models must round-trip against the hand-written baseline DDL.
	if err := db.Create(&model.Folder{ID: "root", Name: "Root"}).Error; err != nil {
		t.Fatalf("create folder: %v", err)
	}
	note := model.Note{Title: "Fresh", FolderID: "root"}
	if err := db.Create(&note).Error; err != nil {
		t.Fatalf("create note: %v", err)
	}
	if err := db.Create(&model.Block{NoteID: note.ID, Type: "text", Content: "{}"}).Error; err != nil {
		t.Fatalf("create block: %v", err)
	}
}
