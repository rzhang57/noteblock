package routes

import (
	"github.com/gin-gonic/gin"
	api2 "server/internal/api"
)

// have all routes in this file, single file this application's API surface
func Setup(fh *api2.FolderHandler, nh *api2.NoteHandler) *gin.Engine {
	r := gin.Default()
	apiGroup := r.Group("/api")
	{
		apiGroup.POST("/folders", fh.Create)
		apiGroup.POST("/notes", nh.Create)
		apiGroup.GET("/notes/:id", nh.Get)
	}
	return r
}
