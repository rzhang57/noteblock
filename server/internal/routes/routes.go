package routes

import (
	"github.com/gin-gonic/gin"
	"server/internal/api"
)

// have all routes in this file, single file this application's API surface
func Setup(fh *api.FolderHandler, nh *api.NoteHandler) *gin.Engine {
	r := gin.Default()
	apiGroup := r.Group("/api")
	{
		apiGroup.POST("/folders", fh.Create)
		apiGroup.GET("/folders/:id", fh.Retrieve)
		apiGroup.PUT("/folders", fh.Update)
		apiGroup.DELETE("/folders/:id", fh.Delete)

		apiGroup.POST("/notes", nh.Create)
		apiGroup.GET("/notes/:id", nh.Get) // retrieve blocks
		apiGroup.PUT("/notes/:id", nh.UpdateMetaData)

		apiGroup.POST("/notes/:id/blocks", nh.AddBlock) // add a block to a note
	}
	return r
}
