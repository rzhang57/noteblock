package sync

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
	"server/internal/model"
)

// RootFolderID is a per-device fixture seeded by InitDb, not user data. Both machines create
// their own row under this id, so syncing it would make each seed look like an edit to the other.
const RootFolderID = "root"

type Store struct{ DB *gorm.DB }

func (s *Store) Cursors() (Cursors, error) {
	var state model.SyncState
	if err := s.DB.First(&state, model.SyncStateID).Error; err != nil {
		return Cursors{}, err
	}

	return Cursors{
		LastPushedLocal:  state.LastPushedLocal,
		LastPulledServer: state.LastPulledServer,
	}, nil
}

// Only the cursors the caller set are written, so advancing one does not blank the other.
func SaveCursors(tx *gorm.DB, c Cursors) error {
	updates := map[string]any{}
	if c.LastPushedLocal != nil {
		updates["last_pushed_local"] = c.LastPushedLocal
	}
	if c.LastPulledServer != "" {
		updates["last_pulled_server"] = c.LastPulledServer
	}
	if len(updates) == 0 {
		return nil
	}

	return tx.Model(&model.SyncState{}).
		Where("id = ?", model.SyncStateID).
		Updates(updates).Error
}

// SQLite compares datetimes as text, and Go writes variable-width fractional seconds with a local
// offset, so both sides are normalised to a fixed-width UTC string before comparing.
const cursorExpr = `strftime('%Y-%m-%dT%H:%M:%f', updated_at) >= strftime('%Y-%m-%dT%H:%M:%f', ?)`

// The comparison resolves to a millisecond, so a record written in the same millisecond as the
// cursor is sent again rather than skipped; applying a change twice is idempotent, losing one is not.
const cursorOrder = `strftime('%Y-%m-%dT%H:%M:%f', updated_at)`

// ChangedSince reads Unscoped so tombstones are included; they are the only record that a
// delete happened. A nil since means everything.
func (s *Store) ChangedSince(since *time.Time) (Changes, error) {
	since = normalise(since)

	folders, err := s.changedFolders(since)
	if err != nil {
		return Changes{}, err
	}

	notes, err := s.changedNotes(since)
	if err != nil {
		return Changes{}, err
	}

	return Changes{Notes: notes, Folders: folders}, nil
}

func (s *Store) changedFolders(since *time.Time) ([]FolderDocument, error) {
	query := s.DB.Unscoped().Model(&model.Folder{})
	if since != nil {
		query = query.Where(cursorExpr, *since)
	}

	var folders []model.Folder
	if err := query.Order(cursorOrder).Find(&folders).Error; err != nil {
		return nil, err
	}

	docs := make([]FolderDocument, 0, len(folders))
	for _, f := range folders {
		docs = append(docs, FolderDocument{
			ID:        f.ID,
			Name:      f.Name,
			ParentID:  f.ParentID,
			UserID:    f.UserID,
			UpdatedAt: f.UpdatedAt,
			DeletedAt: deletedAt(f.DeletedAt),
		})
	}

	return docs, nil
}

func (s *Store) changedNotes(since *time.Time) ([]NoteDocument, error) {
	query := s.DB.Unscoped().Model(&model.Note{})
	if since != nil {
		query = query.Where(cursorExpr, *since)
	}

	var notes []model.Note
	if err := query.Order(cursorOrder).Find(&notes).Error; err != nil {
		return nil, err
	}
	if len(notes) == 0 {
		return []NoteDocument{}, nil
	}

	// A tombstone does not need to carry the body it is deleting, and the payload would only grow.
	ids := make([]string, 0, len(notes))
	for _, n := range notes {
		if n.DeletedAt.Valid {
			continue
		}
		ids = append(ids, n.ID)
	}

	var blocks []model.Block
	if err := s.DB.Where("note_id IN ?", ids).Order("`index`").Find(&blocks).Error; err != nil {
		return nil, err
	}

	byNote := make(map[string][]BlockDocument, len(notes))
	for _, b := range blocks {
		byNote[b.NoteID] = append(byNote[b.NoteID], BlockDocument{
			ID:      b.ID,
			Type:    b.Type,
			Index:   b.Index,
			Content: json.RawMessage(b.Content),
		})
	}

	docs := make([]NoteDocument, 0, len(notes))
	for _, n := range notes {
		doc := NoteDocument{
			ID:        n.ID,
			Title:     n.Title,
			FolderID:  n.FolderID,
			UserID:    n.UserID,
			UpdatedAt: n.UpdatedAt,
			DeletedAt: deletedAt(n.DeletedAt),
			Blocks:    byNote[n.ID],
		}
		if doc.Blocks == nil {
			doc.Blocks = []BlockDocument{}
		}
		docs = append(docs, doc)
	}

	return docs, nil
}

// Timestamps are stored UTC and SQLite compares them lexically, so a cursor carrying a
// local offset would match the wrong rows.
func normalise(since *time.Time) *time.Time {
	if since == nil {
		return nil
	}

	utc := since.UTC()

	return &utc
}

func deletedAt(d gorm.DeletedAt) *time.Time {
	if !d.Valid {
		return nil
	}

	return &d.Time
}
