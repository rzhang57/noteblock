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

func SaveCursors(tx *gorm.DB, c Cursors) error {
	return tx.Model(&model.SyncState{}).
		Where("id = ?", model.SyncStateID).
		Updates(map[string]any{
			"last_pushed_local":  c.LastPushedLocal,
			"last_pulled_server": c.LastPulledServer,
		}).Error
}

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
		query = query.Where("updated_at > ?", *since)
	}

	var folders []model.Folder
	if err := query.Order("updated_at").Find(&folders).Error; err != nil {
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
		query = query.Where("updated_at > ?", *since)
	}

	var notes []model.Note
	if err := query.Order("updated_at").Find(&notes).Error; err != nil {
		return nil, err
	}
	if len(notes) == 0 {
		return []NoteDocument{}, nil
	}

	ids := make([]string, 0, len(notes))
	for _, n := range notes {
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
