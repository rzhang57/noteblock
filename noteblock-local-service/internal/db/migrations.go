package db

import (
	"fmt"
	"log"
	"sort"
	"time"

	"gorm.io/gorm"
)

type Migration struct {
	ID string
	Up func(tx *gorm.DB) error

	// SQLite counts DROP TABLE as deleting every child row that references it, and bringing
	// the table back does not undo that, so a rebuild cannot satisfy a deferred check. These
	// run with enforcement off and are verified with foreign_key_check before they commit.
	RebuildsTables bool
}

const createLedgerSQL = `CREATE TABLE IF NOT EXISTS schema_migrations (
	id TEXT PRIMARY KEY,
	applied_at DATETIME NOT NULL
)`

func Migrate(db *gorm.DB, migrations []Migration) error {
	if err := validateOrder(migrations); err != nil {
		return err
	}

	if err := db.Exec(createLedgerSQL).Error; err != nil {
		return fmt.Errorf("create migration ledger: %w", err)
	}

	var appliedIDs []string
	if err := db.Table("schema_migrations").Pluck("id", &appliedIDs).Error; err != nil {
		return fmt.Errorf("read applied migrations: %w", err)
	}
	if err := validateAgainstLedger(migrations, appliedIDs); err != nil {
		return err
	}
	applied := make(map[string]bool, len(appliedIDs))
	for _, id := range appliedIDs {
		applied[id] = true
	}

	for _, m := range migrations {
		if applied[m.ID] {
			continue
		}

		// PRAGMA foreign_keys is a no-op inside a transaction, so it has to be set out here.
		if m.RebuildsTables {
			if err := disableForeignKeys(db); err != nil {
				return fmt.Errorf("migration %s: %w", m.ID, err)
			}
		}

		// SQLite has transactional DDL, so a failed migration leaves no half-applied schema.
		err := db.Transaction(func(tx *gorm.DB) error {
			if err := m.Up(tx); err != nil {
				return err
			}
			if m.RebuildsTables {
				if err := assertReferencesIntact(tx); err != nil {
					return err
				}
			}
			return tx.Exec(
				"INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
				m.ID, time.Now().UTC(),
			).Error
		})

		if m.RebuildsTables {
			if onErr := db.Exec("PRAGMA foreign_keys = ON").Error; onErr != nil {
				return fmt.Errorf("migration %s: re-enable foreign keys: %w", m.ID, onErr)
			}
		}

		if err != nil {
			return fmt.Errorf("migration %s: %w", m.ID, err)
		}

		log.Printf("applied migration %s", m.ID)
	}

	return nil
}

// The pragma is per-connection and this is an Exec, so it only reaches the connection the
// migration will run on because db.Open pins the pool to one. Read it back rather than trust
// that: if enforcement is still on, the rebuild cascades and takes every block with it.
func disableForeignKeys(db *gorm.DB) error {
	if err := db.Exec("PRAGMA foreign_keys = OFF").Error; err != nil {
		return fmt.Errorf("disable foreign keys: %w", err)
	}

	var enabled int
	if err := db.Raw("PRAGMA foreign_keys").Scan(&enabled).Error; err != nil {
		return fmt.Errorf("read back foreign_keys: %w", err)
	}
	if enabled != 0 {
		return fmt.Errorf("foreign keys still enforced; a table rebuild here would cascade")
	}

	return nil
}

func validateOrder(migrations []Migration) error {
	seen := make(map[string]bool, len(migrations))
	previous := ""

	for _, m := range migrations {
		if m.ID == "" {
			return fmt.Errorf("migration with empty ID")
		}
		if m.Up == nil {
			return fmt.Errorf("migration %s has no Up function", m.ID)
		}
		if seen[m.ID] {
			return fmt.Errorf("duplicate migration ID %s", m.ID)
		}
		if m.ID <= previous {
			return fmt.Errorf("migration %s is not ordered after %s", m.ID, previous)
		}
		seen[m.ID] = true
		previous = m.ID
	}

	return nil
}

// A database only moves forward, so the ledger must be a prefix of what this build declares. Either
// mismatch means the binary and the database disagree about what the schema already is.
func validateAgainstLedger(migrations []Migration, appliedIDs []string) error {
	if len(appliedIDs) == 0 {
		return nil
	}

	// Sorted here rather than in the query, so no caller can quietly drop the ordering this needs.
	applied := append([]string(nil), appliedIDs...)
	sort.Strings(applied)

	declared := make(map[string]bool, len(migrations))
	for _, m := range migrations {
		declared[m.ID] = true
	}
	for _, id := range applied {
		if !declared[id] {
			return fmt.Errorf("migration %s is applied but not declared by this build; the database is newer than the binary", id)
		}
	}

	highestApplied := applied[len(applied)-1]
	for _, m := range migrations {
		if m.ID >= highestApplied {
			break
		}
		if i := sort.SearchStrings(applied, m.ID); i == len(applied) || applied[i] != m.ID {
			return fmt.Errorf("migration %s is pending but sorts below applied migration %s", m.ID, highestApplied)
		}
	}

	return nil
}

// A table rebuild silently drops rows whose parent moved; the check has to run inside the same
// transaction, while it can still be rolled back.
func assertReferencesIntact(tx *gorm.DB) error {
	var violations []struct {
		Table  string `gorm:"column:table"`
		RowID  int64  `gorm:"column:rowid"`
		Parent string `gorm:"column:parent"`
	}
	if err := tx.Raw("PRAGMA foreign_key_check").Scan(&violations).Error; err != nil {
		return fmt.Errorf("foreign key check: %w", err)
	}

	if len(violations) > 0 {
		return fmt.Errorf("%d dangling references after rebuild, first in %s -> %s",
			len(violations), violations[0].Table, violations[0].Parent)
	}

	return nil
}
