package db

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
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

	// InitDb enables this, so without it every foreign key in the baseline is inert under test.
	if err := db.Exec("PRAGMA foreign_keys = ON").Error; err != nil {
		t.Fatalf("enable foreign keys: %v", err)
	}

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

func schemaFingerprint(t *testing.T, db *gorm.DB) string {
	t.Helper()

	var tables []string
	if err := db.Table("sqlite_master").
		Where("type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations'").
		Order("name").Pluck("name", &tables).Error; err != nil {
		t.Fatalf("read tables: %v", err)
	}

	var lines []string
	for _, table := range tables {
		var columns []struct {
			Name    string
			Type    string
			Notnull int
			Pk      int
		}
		if err := db.Raw("SELECT name, type, `notnull`, pk FROM pragma_table_info(?) ORDER BY name", table).
			Scan(&columns).Error; err != nil {
			t.Fatalf("read columns of %s: %v", table, err)
		}
		for _, c := range columns {
			lines = append(lines, fmt.Sprintf("%s.%s %s notnull=%d pk=%d", table, c.Name, c.Type, c.Notnull, c.Pk))
		}

		var keys []struct {
			Table string
			From  string
			To    string
		}
		if err := db.Raw("SELECT `table`, `from`, `to` FROM pragma_foreign_key_list(?) ORDER BY `from`", table).
			Scan(&keys).Error; err != nil {
			t.Fatalf("read foreign keys of %s: %v", table, err)
		}
		for _, k := range keys {
			lines = append(lines, fmt.Sprintf("%s.%s -> %s.%s", table, k.From, k.Table, k.To))
		}
	}

	var indexes []string
	if err := db.Table("sqlite_master").
		Where("type = 'index' AND sql IS NOT NULL").
		Order("name").Pluck("sql", &indexes).Error; err != nil {
		t.Fatalf("read indexes: %v", err)
	}

	return strings.Join(append(lines, indexes...), "\n")
}

func noop(*gorm.DB) error { return nil }

func ptr(s string) *string { return &s }

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
	second := []Migration{
		first[0],
		{ID: "0002_b", Up: func(tx *gorm.DB) error {
			secondRan = true
			return tx.Exec("CREATE TABLE b (id TEXT)").Error
		}},
	}
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

func TestMigrateAppliesAllPendingInOrder(t *testing.T) {
	db := newTestDB(t)

	var order []string
	record := func(id string) func(*gorm.DB) error {
		return func(*gorm.DB) error {
			order = append(order, id)
			return nil
		}
	}

	migrations := []Migration{
		{ID: "0001_a", Up: record("0001_a")},
		{ID: "0002_b", Up: record("0002_b")},
		{ID: "0003_c", Up: record("0003_c")},
	}
	if err := Migrate(db, migrations); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	want := "0001_a,0002_b,0003_c"
	if got := strings.Join(order, ","); got != want {
		t.Errorf("applied %v, want %v", got, want)
	}
	if got := strings.Join(appliedIDs(t, db), ","); got != want {
		t.Errorf("ledger = %v, want %v", got, want)
	}
}

func TestMigrateHaltsAtFirstFailureAndResumesOnceFixed(t *testing.T) {
	db := newTestDB(t)

	thirdRan := false
	third := Migration{ID: "0003_c", Up: func(tx *gorm.DB) error {
		thirdRan = true
		return tx.Exec("CREATE TABLE c (id TEXT)").Error
	}}
	broken := []Migration{
		{ID: "0001_a", Up: func(tx *gorm.DB) error { return tx.Exec("CREATE TABLE a (id TEXT)").Error }},
		{ID: "0002_b", Up: func(*gorm.DB) error { return errors.New("boom") }},
		third,
	}

	err := Migrate(db, broken)
	if err == nil {
		t.Fatal("expected migrate to fail")
	}
	if !strings.Contains(err.Error(), "0002_b") {
		t.Errorf("error = %v, want it to name 0002_b", err)
	}
	if thirdRan || db.Migrator().HasTable("c") {
		t.Error("0003_c ran after 0002_b failed; the run did not halt")
	}
	if got := appliedIDs(t, db); len(got) != 1 || got[0] != "0001_a" {
		t.Fatalf("ledger = %v, want [0001_a]", got)
	}

	fixed := []Migration{
		broken[0],
		{ID: "0002_b", Up: func(tx *gorm.DB) error { return tx.Exec("CREATE TABLE b (id TEXT)").Error }},
		third,
	}
	if err := Migrate(db, fixed); err != nil {
		t.Fatalf("resume after fix: %v", err)
	}
	if got := appliedIDs(t, db); len(got) != 3 {
		t.Errorf("ledger = %v, want all three after the fix", got)
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

func TestMigrateRejectsMalformedMigrationLists(t *testing.T) {
	tests := map[string]struct {
		migrations []Migration
		want       string
	}{
		"duplicate": {[]Migration{{ID: "0001_a", Up: noop}, {ID: "0001_a", Up: noop}}, "duplicate migration ID"},
		"unordered": {[]Migration{{ID: "0002_b", Up: noop}, {ID: "0001_a", Up: noop}}, "not ordered after"},
		"empty ID":  {[]Migration{{ID: "", Up: noop}}, "empty ID"},
		"nil Up":    {[]Migration{{ID: "0001_a"}}, "no Up function"},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			err := Migrate(newTestDB(t), tt.migrations)
			if err == nil {
				t.Fatal("expected an error")
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Errorf("error = %q, want it to mention %q", err, tt.want)
			}
		})
	}
}

func TestMigrateRejectsALedgerThisBuildDoesNotDeclare(t *testing.T) {
	db := newTestDB(t)

	newer := []Migration{{ID: "0001_a", Up: noop}, {ID: "0002_b", Up: noop}}
	if err := Migrate(db, newer); err != nil {
		t.Fatalf("migrate with the newer build: %v", err)
	}

	err := Migrate(db, newer[:1])
	if err == nil {
		t.Fatal("an older binary accepted a database migrated past it")
	}
	if !strings.Contains(err.Error(), "0002_b") {
		t.Errorf("error = %v, want it to name 0002_b", err)
	}
}

func TestMigrateRejectsAPendingMigrationBelowTheLedger(t *testing.T) {
	db := newTestDB(t)

	if err := Migrate(db, []Migration{{ID: "0001_a", Up: noop}, {ID: "0003_c", Up: noop}}); err != nil {
		t.Fatalf("initial migrate: %v", err)
	}

	inserted := []Migration{{ID: "0001_a", Up: noop}, {ID: "0002_b", Up: noop}, {ID: "0003_c", Up: noop}}
	err := Migrate(db, inserted)
	if err == nil {
		t.Fatal("0002_b was applied after 0003_c without an error")
	}
	if !strings.Contains(err.Error(), "0002_b") {
		t.Errorf("error = %v, want it to name 0002_b", err)
	}
	if got := appliedIDs(t, db); len(got) != 2 {
		t.Errorf("ledger = %v, want the out-of-order migration left unapplied", got)
	}
}

// Column order is not compared: ALTER TABLE appends, while AutoMigrate writes in field order.
func TestMigratedSchemaMatchesTheModels(t *testing.T) {
	automigrated := newTestDB(t)
	if err := automigrated.AutoMigrate(&model.Block{}, &model.Note{}, &model.Folder{}, &model.User{}, &model.SyncState{}); err != nil {
		t.Fatalf("automigrate: %v", err)
	}

	migrated := newTestDB(t)
	if err := Migrate(migrated, Migrations); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	want := schemaFingerprint(t, automigrated)
	if got := schemaFingerprint(t, migrated); got != want {
		t.Errorf("the migrations have drifted from the models\n got: %s\nwant: %s", got, want)
	}
}

func TestMigrateAdoptsALegacyDatabaseWithoutLosingRows(t *testing.T) {
	db := newTestDB(t)

	// A database as it existed before the ledger: baseline schema, no schema_migrations.
	if err := baseline(db); err != nil {
		t.Fatalf("legacy schema: %v", err)
	}
	seeds := []string{
		"INSERT INTO `folders` (`id`, `name`) VALUES ('f1', 'Coursework')",
		"INSERT INTO `folders` (`id`, `name`, `parent_id`) VALUES ('child', 'Child', 'f1')",
		"INSERT INTO `notes` (`id`, `title`, `folder_id`) VALUES ('n1', 'Existing', 'child')",
		"INSERT INTO `blocks` (`id`, `note_id`, `type`, `index`, `content`) VALUES ('b1', 'n1', 'text', 0, '{\"text\":\"keep me\"}')",
	}
	for _, seed := range seeds {
		if err := db.Exec(seed).Error; err != nil {
			t.Fatalf("seed legacy rows: %v", err)
		}
	}

	if err := Migrate(db, Migrations); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	var folder model.Folder
	if err := db.First(&folder, "id = ?", "child").Error; err != nil {
		t.Errorf("child folder lost: %v", err)
	} else if folder.ParentID == nil || *folder.ParentID != "f1" {
		t.Errorf("child folder parent = %v, want f1", folder.ParentID)
	}
	var note model.Note
	if err := db.First(&note, "id = ?", "n1").Error; err != nil {
		t.Fatalf("existing note did not survive migration: %v", err)
	}
	if note.Title != "Existing" {
		t.Errorf("note title = %q, want %q", note.Title, "Existing")
	}
	var block model.Block
	if err := db.First(&block, "id = ?", "b1").Error; err != nil {
		t.Errorf("block lost: %v", err)
	} else if block.Content != `{"text":"keep me"}` {
		t.Errorf("block content = %q, want the seeded json", block.Content)
	}
}

func TestBaselineRejectsADatabaseThatPredatesTheLedger(t *testing.T) {
	db := newTestDB(t)

	if err := db.Exec("CREATE TABLE `blocks` (`id` uuid,`note_id` uuid NOT NULL,`type` text,`index` integer,`created_at` datetime,`updated_at` datetime,PRIMARY KEY (`id`))").Error; err != nil {
		t.Fatalf("seed pre-content blocks table: %v", err)
	}

	err := Migrate(db, Migrations)
	if err == nil {
		t.Fatal("baseline adopted a blocks table with no content column")
	}
	if !strings.Contains(err.Error(), "content") {
		t.Errorf("error = %v, want it to name the missing column", err)
	}
	if got := appliedIDs(t, db); len(got) != 0 {
		t.Errorf("ledger = %v, want the baseline not recorded", got)
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
	folderID := "f1"
	if err := db.Create(&model.Folder{ID: folderID, Name: "Coursework"}).Error; err != nil {
		t.Fatalf("create folder: %v", err)
	}
	note := model.Note{Title: "Fresh", FolderID: &folderID}
	if err := db.Create(&note).Error; err != nil {
		t.Fatalf("create note: %v", err)
	}
	block := model.Block{NoteID: note.ID, Type: "text", Content: `{"text":"hello"}`}
	if err := db.Create(&block).Error; err != nil {
		t.Fatalf("create block: %v", err)
	}

	var got model.Block
	if err := db.First(&got, "id = ?", block.ID).Error; err != nil {
		t.Fatalf("read block back: %v", err)
	}
	if got.Content != block.Content || got.Type != "text" {
		t.Errorf("block round-tripped as %+v, want content %q type text", got, block.Content)
	}

	missing := "nonexistent"
	if err := db.Create(&model.Note{Title: "Orphan", FolderID: &missing}).Error; err == nil {
		t.Error("a note referencing a missing folder was accepted; the foreign key is not enforced")
	}
}
