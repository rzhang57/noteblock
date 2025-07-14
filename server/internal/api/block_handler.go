package api

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"server/internal/service"
)

type BlockHandler struct {
	Svc *service.BlockService
}

func (b *BlockHandler) Create(c *gin.Context) {
	noteId := c.Param("noteId")
	var body struct {
		Type    string           `json:"type"`
		Index   int              `json:"index"`
		Content *json.RawMessage `json:"content"`
	}
	err := ValidateAndSetJsonBody(&body, c)
	if err != nil {
		return
	}

	block, err := b.Svc.CreateNewBlock(noteId, body.Type, body.Index, body.Content)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to create block: " + err.Error()})
		return
	}

	c.JSON(201, gin.H{"noteId": block.ID, "note_id": block.NoteID, "type": block.Type, "index": block.Index})
}
