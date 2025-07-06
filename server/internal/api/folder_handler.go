package api

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"server/internal/service"
)

type FolderHandler struct{ Svc *service.FolderService }

func (h *FolderHandler) Create(c *gin.Context) {
	var body struct {
		Name     string  `json:"name"`
		ParentID *string `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid body"})
		return
	}
	id, err := h.Svc.NewFolder(body.Name, body.ParentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "name": body.Name, "parent_id": body.ParentID})
}
