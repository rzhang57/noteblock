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

		folders, err := foldersChangedSince(tx, since)
		if err != nil {
			return err
		}
		notes, err := notesChangedSince(tx, since)
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

		row := model.CloudFolder{
			ID:              id,
			UserID:          model.LocalUserID,
			Data:            doc,
			ClientUpdatedAt: clientUpdatedAt,
			ServerUpdatedAt: serverTime,
		}
		if err := tx.Save(&row).Error; err != nil {
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
		row := model.CloudNote{
			ID:              id,
			UserID:          model.LocalUserID,
			FolderID:        folderID,
			Data:            doc,
			ClientUpdatedAt: clientUpdatedAt,
			ServerUpdatedAt: serverTime,
		}
		if err := tx.Save(&row).Error; err != nil {
			return err
		}
	}

	return nil
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

	return &parsed, nil
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
	if err := tx.Raw("SELECT CURRENT_TIMESTAMP").Scan(&t).Error; err != nil {
		return time.Time{}, err
	}

	return t.UTC(), nil
}
