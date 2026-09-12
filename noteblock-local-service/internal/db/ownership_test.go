package db

import (
	"testing"

	"gorm.io/gorm"
	"server/internal/model"
)

func userIDsIn(t *testing.T, db *gorm.DB, table string) []string {
	t.Helper()

	var ids []string
	if err := db.Table(table).Pluck("user_id", &ids).Error; err != nil {
		t.Fatalf("read %s.user_id: %v", table, err)
	}

	return ids
}

func TestOwnershipBackfillsRowsThatPredateTheColumn(t *testing.T) {
	db := newTestDB(t)

	if err := Migrate(db, Migrations[:1]); err != nil {
		t.Fatalf("baseline: %v", err)
	}
	if err := db.Exec("INSERT INTO folders (id, name) VALUES ('f1', 'Coursework')").Error; err != nil {
		t.Fatalf("seed folder: %v", err)
	}
	if err := db.Exec("INSERT INTO notes (id, title, folder_id) VALUES ('n1', 'Existing', 'f1')").Error; err != nil {
		t.Fatalf("seed note: %v", err)
	}
	if err := db.Exec("INSERT INTO blocks (id, note_id, type, content) VALUES ('b1', 'n1', 'text', '{}')").Error; err != nil {
		t.Fatalf("seed block: %v", err)
	}

	if err := Migrate(db, Migrations); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	for _, table := range []string{"folders", "notes", "blocks"} {
		ids := userIDsIn(t, db, table)
		if len(ids) != 1 {
			t.Fatalf("%s row count = %d, want 1", table, len(ids))
		}
		if ids[0] != model.LocalUserID {
			t.Errorf("%s.user_id = %q, want %q", table, ids[0], model.LocalUserID)
		}
	}
}

func TestOwnershipSeedsExactlyOneUser(t *testing.T) {
	db := newTestDB(t)

	if err := Migrate(db, Migrations); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	var users []model.User
	if err := db.Find(&users).Error; err != nil {
		t.Fatalf("read users: %v", err)
	}
	if len(users) != 1 {
		t.Fatalf("user count = %d, want 1", len(users))
	}
	if users[0].ID != model.LocalUserID {
		t.Errorf("user id = %q, want %q", users[0].ID, model.LocalUserID)
	}
}

func TestNewRecordsGetTheLocalUserWithoutAnyCallerSayingSo(t *testing.T) {
	db := newTestDB(t)

	if err := Migrate(db, Migrations); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	folder := model.Folder{ID: "root", Name: "Root"}
	if err := db.Create(&folder).Error; err != nil {
		t.Fatalf("create folder: %v", err)
	}
	note := model.Note{Title: "Fresh", FolderID: &folder.ID}
	if err := db.Create(&note).Error; err != nil {
		t.Fatalf("create note: %v", err)
	}
	block := model.Block{NoteID: note.ID, Type: "text", Content: "{}"}
	if err := db.Create(&block).Error; err != nil {
		t.Fatalf("create block: %v", err)
	}

	if folder.UserID != model.LocalUserID {
		t.Errorf("folder.UserID = %q, want %q", folder.UserID, model.LocalUserID)
	}
	if note.UserID != model.LocalUserID {
		t.Errorf("note.UserID = %q, want %q", note.UserID, model.LocalUserID)
	}
	if block.UserID != model.LocalUserID {
		t.Errorf("block.UserID = %q, want %q", block.UserID, model.LocalUserID)
	}
}

func TestOwnershipMigrationIsIdempotent(t *testing.T) {
	db := newTestDB(t)

	if err := Migrate(db, Migrations); err != nil {
		t.Fatalf("first migrate: %v", err)
	}
	if err := Migrate(db, Migrations); err != nil {
		t.Fatalf("second migrate: %v", err)
	}

	var userCount int64
	if err := db.Model(&model.User{}).Count(&userCount).Error; err != nil {
		t.Fatalf("count users: %v", err)
	}
	if userCount != 1 {
		t.Errorf("user count = %d after two runs, want 1", userCount)
	}
}
