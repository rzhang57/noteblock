package router

import (
	"github.com/gin-gonic/gin"
	"server/api"
)

func Setup(fh *api.FolderHandler, nh *api.NoteHandler) *gin.Engine {
	r := gin.Default()
	apiGroup := r.Group("/api")
	{
		apiGroup.POST("/folders", fh.Create)
		apiGroup.POST("/notes", nh.Create)
	}
	return r
}
