package sync

import (
	"encoding/json"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"server/internal/model"
)

// Apply writes whatever the server returned, keeping each record's incoming updated_at.
// GORM stamps that column itself on Save, which would make every pulled record look newer
// than the copy it came from and bounce it straight back on the next pass.
func Apply(tx *gorm.DB, incoming Changes) error {
	// The server returns records in server-write order, which says nothing about parentage:
	// a child can arrive before the parent it points at. Deferring the check to COMMIT keeps
	// the constraint without demanding an order the payload cannot promise.
	if err := tx.Exec("PRAGMA defer_foreign_keys = ON").Error; err != nil {
		return err
	}

	for _, folder := range incoming.Folders {
		if err := applyFolder(tx, folder); err != nil {
			return err
		}
	}

	for _, note := range incoming.Notes {
		if err := applyNote(tx, note); err != nil {
			return err
		}
	}

	return nil
}

func applyFolder(tx *gorm.DB, doc FolderDocument) error {
	if doc.ID == RootFolderID {
		return nil
	}

	var existing []model.Folder
	if err := tx.Unscoped().Where("id = ?", doc.ID).Limit(1).Find(&existing).Error; err != nil {
		return err
	}

	columns := map[string]any{
		"name":       doc.Name,
		"parent_id":  doc.ParentID,
		"user_id":    doc.UserID,
		"updated_at": doc.UpdatedAt.UTC(),
		"deleted_at": doc.DeletedAt,
	}

	if len(existing) == 0 {
		columns["id"] = doc.ID
		columns["created_at"] = doc.UpdatedAt.UTC()
		return tx.Model(&model.Folder{}).Create(columns).Error
	}
	if !doc.UpdatedAt.After(existing[0].UpdatedAt) {
		return nil
	}

	return tx.Unscoped().Model(&model.Folder{}).Where("id = ?", doc.ID).UpdateColumns(columns).Error
}

func applyNote(tx *gorm.DB, doc NoteDocument) error {
	var existing []model.Note
	if err := tx.Unscoped().Where("id = ?", doc.ID).Limit(1).Find(&existing).Error; err != nil {
		return err
	}

	columns := map[string]any{
		"title":      doc.Title,
		"folder_id":  doc.FolderID,
		"user_id":    doc.UserID,
		"updated_at": doc.UpdatedAt.UTC(),
		"deleted_at": doc.DeletedAt,
	}

	if len(existing) == 0 {
		columns["id"] = doc.ID
		columns["created_at"] = doc.UpdatedAt.UTC()
		if err := tx.Model(&model.Note{}).Create(columns).Error; err != nil {
			return err
		}
		return replaceBlocks(tx, doc)
	}
	if !doc.UpdatedAt.After(existing[0].UpdatedAt) {
		return nil
	}

	if err := tx.Unscoped().Model(&model.Note{}).Where("id = ?", doc.ID).UpdateColumns(columns).Error; err != nil {
		return err
	}

	// A tombstone carries no blocks, and the device that performed the delete keeps its own so a
	// restored note comes back intact. Replacing here would destroy them everywhere else.
	if doc.DeletedAt != nil {
		return nil
	}

	return replaceBlocks(tx, doc)
}

// The whole block set moves as one unit, so a block missing from the document is a delete.
func replaceBlocks(tx *gorm.DB, doc NoteDocument) error {
	if err := tx.Where("note_id = ?", doc.ID).Delete(&model.Block{}).Error; err != nil {
		return err
	}

	for _, block := range doc.Blocks {
		row := model.Block{
			ID:      block.ID,
			NoteID:  doc.ID,
			UserID:  doc.UserID,
			Type:    block.Type,
			Index:   block.Index,
			Content: blockContent(block.Content),
		}
		// A block id that still exists under another note would abort the pass and, because the
		// cursors move inside it, wedge every later pass on the same payload.
		if err := tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "id"}},
			UpdateAll: true,
		}).Create(&row).Error; err != nil {
			return err
		}
	}

	return nil
}

// An absent content field would store "", which is not valid JSON and fails to marshal on the next
// scan - killing sync permanently and making the note unopenable.
func blockContent(raw json.RawMessage) string {
	if len(raw) == 0 {
		return "{}"
	}

	return string(raw)
}
