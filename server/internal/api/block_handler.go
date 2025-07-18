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
	noteId := c.Param("id")
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

	c.JSON(201, gin.H{"id": block.ID, "note_id": block.NoteID, "type": block.Type, "index": block.Index})
}

// TODO: updating order of blocks given one is moved or removed should be handled by the client which will use a list to represent blocks, and then send the new order to the server with the natural indexes of the list

// TODO: Update content specifically updates one of two things: either changes the content of the block and not the type, or changes both type and content at the same time.
func (b *BlockHandler) UpdateContent(c *gin.Context) {
	noteId := c.Param("id")
	blockId := c.Param("block_id")
	var body struct {
		Type    string           `json:"type"`
		Content *json.RawMessage `json:"content"`
	}
	err := ValidateAndSetJsonBody(&body, c)
	if err != nil {
		return
	}

	block, err := b.Svc.UpdateBlockContent(noteId, blockId, body.Type, body.Content)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to update block: " + err.Error()})
		return
	}

	c.JSON(200, gin.H{"id": block.ID, "note_id": block.NoteID, "type": block.Type, "index": block.Index})
}
