package api

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"server/service"
)

type NoteHandler struct{ Svc *service.NoteService }

func (h *NoteHandler) Create(c *gin.Context) {
	var body struct {
		Title    string `json:"title"`
		Markdown string `json:"markdown"`
		FolderID uint   `json:"folder_id"`
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
