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

		// SQLite has transactional DDL, so a failed migration leaves no half-applied schema.
		if err := db.Transaction(func(tx *gorm.DB) error {
			if err := m.Up(tx); err != nil {
				return err
			}
			return tx.Exec(
				"INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
				m.ID, time.Now().UTC(),
			).Error
		}); err != nil {
			return fmt.Errorf("migration %s: %w", m.ID, err)
		}

		log.Printf("applied migration %s", m.ID)
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
