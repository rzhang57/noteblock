package api

import (
	"fmt"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"net/http"
	"regexp"
	"server/internal/api/mapper"
	"server/internal/model"
	"server/internal/model/dto"
	"server/internal/service"
	"strconv"
)

// TODO: this handler is too fat, consider moving more down to services
type NoteHandler struct {
	Svc      *service.NoteService
	BlockSvc *service.BlockService
}

func (h *NoteHandler) Create(c *gin.Context) {
	var body struct {
		Title    *string `json:"title"`
		FolderID *string `json:"folder_id"`
	}
	err := ValidateAndSetJsonBody(&body, c)
	if err != nil {
		return
	}

	if body.FolderID == nil || *body.FolderID == "" {
		root := "root"
		body.FolderID = &root
	}

	existingNotesInFolder, err := h.Svc.ListNotesByFolderId(body.FolderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query notes in current folder"})
		return
	}

	if body.Title == nil || *body.Title == "" {
		newName := generateUniqueNoteName(existingNotesInFolder)
		body.Title = &newName
	} else {
		for _, n := range existingNotesInFolder {
			if n.Title == *body.Title {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Note with that title already exists in this folder"})
				return
			}
		}
	}

	note, err := h.Svc.NewNote(*body.Title, *body.FolderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error() + " - failed to create new note"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": note.ID, "title": note.Title, "folder_id": note.FolderID})
}

func (h *NoteHandler) Get(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing note ID"})
		return
	}

	note, err := h.Svc.GetNote(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if note == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	dtoNote, err := mapper.ToNoteDTO(note)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to map note to DTO"})
		return
	}

	c.JSON(http.StatusOK, dtoNote)
}

func (h *NoteHandler) Update(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing note ID"})
		return
	}
	var body struct {
		Title    *string         `json:"title"`
		FolderID *string         `json:"folder_id"`
		Blocks   *[]dto.BlockDTO `json:"blocks"`
	}
	err := ValidateAndSetJsonBody(&body, c)
	if err != nil {
		return
	}
	existingNote, err := h.Svc.GetNoteMetaData(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve note metadata, double check id"})
		return
	}

	targetTitle := existingNote.Title
	if body.Title != nil && *body.Title != "" {
		targetTitle = *body.Title
	}

	targetFolderId := existingNote.FolderID
	if body.FolderID != nil && *body.FolderID != "" {
		targetFolderId = *body.FolderID
	}

	if body.Blocks != nil {
		// TODO: database logic in handler = bad
		err := h.BlockSvc.DB.Transaction(func(tx *gorm.DB) error {
			for _, block := range *body.Blocks {
				if err := tx.Model(&model.Block{}).Where("id = ? AND note_id = ?", block.ID, id).
					Update("index", block.Index).Error; err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update blocks"})
			return
		}
	}

	folder, err := h.Svc.ListNotesByFolderId(&targetFolderId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve notes in new folder, double check id"})
		return
	}
	for _, n := range folder {
		if n.Title == targetTitle && n.ID != id {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Note with that title already exists in the destination folder"})
			return
		}
	}

	data, err := h.Svc.UpdateNoteMetaData(id, targetTitle, targetFolderId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error() + " - failed to update note metadata"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"id": data.ID, "title": data.Title, "folder_id": data.FolderID, "message": "Note and blocks updated successfully"})
}

func generateUniqueNoteName(folders []model.Note) string {
	base := "New Note"
	maxIndex := 0
	pattern := regexp.MustCompile(`^New Note(?: (\d+))?$`)

	for _, n := range folders {
		matches := pattern.FindStringSubmatch(n.Title)
		if len(matches) > 1 && matches[1] != "" {
			if idx, err := strconv.Atoi(matches[1]); err == nil {
				if idx > maxIndex {
					maxIndex = idx
				}
			}
		} else if n.Title == base && maxIndex == 0 {
			maxIndex = 1
		}
	}

	if maxIndex == 0 {
		return base
	}
	return fmt.Sprintf("%s %d", base, maxIndex+1)
}

func (h *NoteHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing note ID"})
		return
	}

	err := h.Svc.DeleteNote(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error() + " - failed to delete note"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Note deleted successfully"})
}
