package routes

import (
	"github.com/gin-gonic/gin"
	"server/internal/api"
)

// have all routes in this file, single file this application's API surface
func Setup(fh *api.FolderHandler, nh *api.NoteHandler, bh *api.BlockHandler) *gin.Engine {
	r := gin.Default()
	apiGroup := r.Group("/api")
	{
		// {
		//   "name": {name of folder},
		//   "parent_id": {parent}
		// }
		apiGroup.POST("/folders", fh.Create)
		// returns {
		//	"id":        folder.ID,
		//	"name":      folder.Name,
		//	"parent_id": folder.ParentID,
		//	"notes":     folder.Notes,
		//	"children":  folder.Children,`
		// }
		apiGroup.GET("/folders/:id", fh.Retrieve)
		// {
		//   "name": {name of folder},
		//   "parent_id": {parent}
		// }
		apiGroup.PUT("/folders", fh.Update)
		apiGroup.DELETE("/folders/:id", fh.Delete)

		apiGroup.POST("/notes", nh.Create)
		apiGroup.GET("/notes/:id", nh.Get) // retrieve blocks
		apiGroup.PUT("/notes/:id", nh.UpdateMetaData)

		apiGroup.POST("/notes/:id/blocks", bh.Create)                 // add a block to a note
		apiGroup.PUT("/notes/:id/blocks/:block_id", bh.UpdateContent) // update contentType/content of a block
	}
	return r
}
