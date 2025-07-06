package api

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"server/internal/service"
)

type NoteHandler struct{ Svc *service.NoteService }

func (h *NoteHandler) Create(c *gin.Context) {
	var body struct {
		Title    string `json:"title"`
		Markdown string `json:"markdown"`
		FolderID string `json:"folder_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid body"})
		return
	}
	id, err := h.Svc.NewNote(body.Title, body.Markdown, body.FolderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
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
	c.JSON(http.StatusOK, note)
}
