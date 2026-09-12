package server

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"noteblock-cloud-service/internal/model"
)

const cursorLayout = time.RFC3339Nano

type syncRequest struct {
	Since   *string       `json:"since"`
	Notes   []model.JSONB `json:"notes"`
	Folders []model.JSONB `json:"folders"`
}

type syncResponse struct {
	Notes      []model.JSONB `json:"notes"`
	Folders    []model.JSONB `json:"folders"`
	ServerTime string        `json:"server_time"`
}

func (s *Server) syncHandler(c *gin.Context) {
	var req syncRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid sync payload"})
		return
	}

	since, err := parseCursor(req.Since)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid since cursor"})
		return
	}

	var resp syncResponse
	err = s.gorm.Transaction(func(tx *gorm.DB) error {
		serverTime, err := now(tx)
		if err != nil {
			return err
		}

		if err := applyFolders(tx, req.Folders, serverTime); err != nil {
			return err
		}
		if err := applyNotes(tx, req.Notes, serverTime); err != nil {
			return err
		}

		folders, err := foldersChangedSince(tx, overlap(since))
		if err != nil {
			return err
		}
		notes, err := notesChangedSince(tx, overlap(since))
		if err != nil {
			return err
		}

		resp = syncResponse{Notes: notes, Folders: folders, ServerTime: serverTime.Format(cursorLayout)}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "sync failed"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func applyFolders(tx *gorm.DB, docs []model.JSONB, serverTime time.Time) error {
	for _, doc := range docs {
		id, clientUpdatedAt, ok := identify(doc)
		if !ok {
			continue
		}

		var existing []model.CloudFolder
		if err := tx.Where("id = ? AND user_id = ?", id, model.LocalUserID).Limit(1).Find(&existing).Error; err != nil {
			return err
		}
		if len(existing) == 1 && !clientUpdatedAt.After(existing[0].ClientUpdatedAt) {
			continue
		}

		if err := upsert(tx, &model.CloudFolder{}, id, len(existing) == 1, map[string]any{
			"user_id":           model.LocalUserID,
			"data":              doc,
			"client_updated_at": clientUpdatedAt,
			"updated_at":        serverTime,
		}, serverTime); err != nil {
			return err
		}
	}

	return nil
}

func applyNotes(tx *gorm.DB, docs []model.JSONB, serverTime time.Time) error {
	for _, doc := range docs {
		id, clientUpdatedAt, ok := identify(doc)
		if !ok {
			continue
		}

		var existing []model.CloudNote
		if err := tx.Where("id = ? AND user_id = ?", id, model.LocalUserID).Limit(1).Find(&existing).Error; err != nil {
			return err
		}
		if len(existing) == 1 && !clientUpdatedAt.After(existing[0].ClientUpdatedAt) {
			continue
		}

		folderID, _ := doc["folder_id"].(string)
		if err := upsert(tx, &model.CloudNote{}, id, len(existing) == 1, map[string]any{
			"user_id":           model.LocalUserID,
			"folder_id":         folderID,
			"data":              doc,
			"client_updated_at": clientUpdatedAt,
			"updated_at":        serverTime,
		}, serverTime); err != nil {
			return err
		}
	}

	return nil
}

// gorm's Save() issues Updates with Select("*"), which writes the zero CreatedAt of a
// freshly built struct over the stored one. Only the columns that should change are sent.
func upsert(tx *gorm.DB, out any, id string, exists bool, columns map[string]any, serverTime time.Time) error {
	if exists {
		return tx.Model(out).Where("id = ?", id).Updates(columns).Error
	}

	columns["id"] = id
	columns["created_at"] = serverTime

	return tx.Model(out).Create(columns).Error
}

func foldersChangedSince(tx *gorm.DB, since *time.Time) ([]model.JSONB, error) {
	query := tx.Model(&model.CloudFolder{}).Where("user_id = ?", model.LocalUserID)
	if since != nil {
		query = query.Where("updated_at > ?", *since)
	}

	var rows []model.CloudFolder
	if err := query.Order("updated_at").Find(&rows).Error; err != nil {
		return nil, err
	}

	docs := make([]model.JSONB, 0, len(rows))
	for _, row := range rows {
		docs = append(docs, row.Data)
	}

	return docs, nil
}

func notesChangedSince(tx *gorm.DB, since *time.Time) ([]model.JSONB, error) {
	query := tx.Model(&model.CloudNote{}).Where("user_id = ?", model.LocalUserID)
	if since != nil {
		query = query.Where("updated_at > ?", *since)
	}

	var rows []model.CloudNote
	if err := query.Order("updated_at").Find(&rows).Error; err != nil {
		return nil, err
	}

	docs := make([]model.JSONB, 0, len(rows))
	for _, row := range rows {
		docs = append(docs, row.Data)
	}

	return docs, nil
}

func identify(doc model.JSONB) (string, time.Time, bool) {
	id, ok := doc["id"].(string)
	if !ok || id == "" {
		return "", time.Time{}, false
	}

	raw, ok := doc["updated_at"].(string)
	if !ok {
		return "", time.Time{}, false
	}
	updatedAt, err := time.Parse(cursorLayout, raw)
	if err != nil {
		return "", time.Time{}, false
	}

	return id, updatedAt, true
}

func parseCursor(since *string) (*time.Time, error) {
	if since == nil || *since == "" {
		return nil, nil
	}

	parsed, err := time.Parse(cursorLayout, *since)
	if err != nil {
		return nil, err
	}
	// Rows are stored UTC and SQLite compares datetimes lexically, so an offset-bearing
	// cursor matches the wrong rows. Postgres would compare instants either way.
	parsed = parsed.UTC()

	return &parsed, nil
}

// A transaction stamps its rows when it starts but they only become visible when it commits,
// so another device syncing in between is handed a cursor past rows it never saw. Re-reading a
// short overlap on every pull costs a redundant row and closes that window; skipping one loses
// the edit forever.
const cursorOverlap = 5 * time.Second

func overlap(since *time.Time) *time.Time {
	if since == nil {
		return nil
	}

	widened := since.Add(-cursorOverlap)

	return &widened
}

// Every device runs its own copy of this service against one shared database, so the process
// clock is really a device clock. Only the database can order writes from both of them.
func now(tx *gorm.DB) (time.Time, error) {
	if tx.Dialector.Name() == "sqlite" {
		var raw string
		if err := tx.Raw("SELECT strftime('%Y-%m-%d %H:%M:%f','now')").Scan(&raw).Error; err != nil {
			return time.Time{}, err
		}
		return time.Parse("2006-01-02 15:04:05.000", raw)
	}

	var t time.Time
	if err := tx.Raw("SELECT clock_timestamp()").Scan(&t).Error; err != nil {
		return time.Time{}, err
	}

	return t.UTC(), nil
}
