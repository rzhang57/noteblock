package db

import (
	"testing"
	"time"

	"gorm.io/gorm"
	"server/internal/model"
)

// Everything the database would have had the moment before this migration shipped.
func migrateBefore(t *testing.T, db *gorm.DB, id string) {
	t.Helper()

	var earlier []Migration
	for _, m := range Migrations {
		if m.ID == id {
			break
		}
		earlier = append(earlier, m)
	}
	if err := Migrate(db, earlier); err != nil {
		t.Fatalf("migrate up to %s: %v", id, err)
	}
}

// A database as it existed before the root folder was dropped.
func seedLegacyRoot(t *testing.T, db *gorm.DB) {
	t.Helper()

	for _, stmt := range []string{
		"INSERT INTO `folders` (`id`, `name`, `user_id`, `created_at`, `updated_at`) VALUES ('root', 'Root', 'u1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
		"INSERT INTO `folders` (`id`, `name`, `parent_id`, `user_id`, `created_at`, `updated_at`) VALUES ('f-cs', 'CS341', 'root', 'u1', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z')",
		"INSERT INTO `notes` (`id`, `title`, `folder_id`, `user_id`, `created_at`, `updated_at`) VALUES ('n-top', 'Top level', 'root', 'u1', '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z')",
		"INSERT INTO `notes` (`id`, `title`, `folder_id`, `user_id`, `created_at`, `updated_at`, `deleted_at`) VALUES ('n-gone', 'Deleted', 'root', 'u1', '2026-01-04T00:00:00Z', '2026-01-04T00:00:00Z', '2026-01-05T00:00:00Z')",
		"INSERT INTO `notes` (`id`, `title`, `folder_id`, `user_id`, `created_at`, `updated_at`) VALUES ('n-nested', 'Nested', 'f-cs', 'u1', '2026-01-06T00:00:00Z', '2026-01-06T00:00:00Z')",
		"INSERT INTO `blocks` (`id`, `note_id`, `type`, `index`, `content`, `user_id`) VALUES ('b1', 'n-top', 'text', 0, '{\"text\":\"keep me\"}', 'u1')",
	} {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("seed legacy row: %v", err)
		}
	}
}

func TestDroppingTheRootFolderRepointsItsChildren(t *testing.T) {
	db := newTestDB(t)
	migrateBefore(t, db, "0005_drop_root_folder")
	seedLegacyRoot(t, db)

	if err := Migrate(db, Migrations); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	var folder model.Folder
	if err := db.First(&folder, "id = ?", "f-cs").Error; err != nil {
		t.Fatalf("child folder lost: %v", err)
	}
	if folder.ParentID != nil {
		t.Errorf("folder parent = %v, want nil", *folder.ParentID)
	}

	var note model.Note
	if err := db.First(&note, "id = ?", "n-top").Error; err != nil {
		t.Fatalf("top-level note lost: %v", err)
	}
	if note.FolderID != nil {
		t.Errorf("note folder = %v, want nil", *note.FolderID)
	}

	var roots int64
	if err := db.Unscoped().Model(&model.Folder{}).Where("id = ?", "root").Count(&roots).Error; err != nil {
		t.Fatalf("count root: %v", err)
	}
	if roots != 0 {
		t.Error("the root folder row survived the migration")
	}

	var nested model.Note
	if err := db.First(&nested, "id = ?", "n-nested").Error; err != nil {
		t.Fatalf("nested note lost: %v", err)
	}
	if nested.FolderID == nil || *nested.FolderID != "f-cs" {
		t.Errorf("nested note folder = %v, want f-cs; an unrelated row was repointed", nested.FolderID)
	}
}

// The rebuild copies every column of every row, including the ones no live read returns.
func TestTheRebuildPreservesTombstonesAndTimestamps(t *testing.T) {
	db := newTestDB(t)
	migrateBefore(t, db, "0005_drop_root_folder")
	seedLegacyRoot(t, db)

	if err := Migrate(db, Migrations); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	var deleted model.Note
	if err := db.Unscoped().First(&deleted, "id = ?", "n-gone").Error; err != nil {
		t.Fatalf("soft-deleted note lost in the rebuild: %v", err)
	}
	if !deleted.DeletedAt.Valid {
		t.Error("the tombstone was dropped by the rebuild; the note would resurrect on the next pull")
	}
	if deleted.UserID != "u1" {
		t.Errorf("user_id = %q, want u1", deleted.UserID)
	}

	var nested model.Note
	if err := db.First(&nested, "id = ?", "n-nested").Error; err != nil {
		t.Fatalf("nested note lost: %v", err)
	}
	want := time.Date(2026, 1, 6, 0, 0, 0, 0, time.UTC)
	if !nested.CreatedAt.UTC().Equal(want) || !nested.UpdatedAt.UTC().Equal(want) {
		t.Errorf("timestamps = %v / %v, want %v; a blanked timestamp breaks the sync cursor",
			nested.CreatedAt.UTC(), nested.UpdatedAt.UTC(), want)
	}

	var blocks int64
	if err := db.Model(&model.Block{}).Where("note_id = ?", "n-top").Count(&blocks).Error; err != nil {
		t.Fatalf("count blocks: %v", err)
	}
	if blocks != 1 {
		t.Errorf("%d blocks under the repointed note, want 1", blocks)
	}
}

// The repaired rows have to reach the cloud, which only happens if the scan can still see them.
func TestTheRepairIsVisibleToAScanFromBeforeTheMigration(t *testing.T) {
	db := newTestDB(t)
	migrateBefore(t, db, "0005_drop_root_folder")
	seedLegacyRoot(t, db)

	// A device that had already pushed everything before upgrading.
	cursor := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)

	if err := Migrate(db, Migrations); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	var repointed int64
	if err := db.Unscoped().Model(&model.Note{}).
		Where("id = ? AND updated_at > ?", "n-top", cursor).Count(&repointed).Error; err != nil {
		t.Fatalf("count: %v", err)
	}
	if repointed != 1 {
		t.Error("the repointed note still sorts below the push cursor; the cloud keeps the old parent forever")
	}
}

// The guard that stands between a table rebuild and irreplaceable notes.
func TestARebuildThatOrphansRowsIsRolledBack(t *testing.T) {
	db := newTestDB(t)
	if err := Migrate(db, Migrations); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if err := db.Exec("INSERT INTO `folders` (`id`, `name`) VALUES ('keep', 'Keep')").Error; err != nil {
		t.Fatalf("seed folder: %v", err)
	}
	if err := db.Exec("INSERT INTO `notes` (`id`, `title`, `folder_id`) VALUES ('orphan-me', 'Child', 'keep')").Error; err != nil {
		t.Fatalf("seed note: %v", err)
	}

	orphaning := []Migration{{
		ID:             "9999_orphan",
		RebuildsTables: true,
		Up: func(tx *gorm.DB) error {
			return tx.Exec("DELETE FROM `folders` WHERE `id` = 'keep'").Error
		},
	}}

	err := Migrate(db, append(append([]Migration{}, Migrations...), orphaning...))
	if err == nil {
		t.Fatal("a migration that orphaned a note was accepted")
	}

	var notes int64
	if err := db.Unscoped().Model(&model.Note{}).Where("id = ?", "orphan-me").Count(&notes).Error; err != nil {
		t.Fatalf("count notes: %v", err)
	}
	if notes != 1 {
		t.Error("the note did not survive the rolled-back migration")
	}
}
