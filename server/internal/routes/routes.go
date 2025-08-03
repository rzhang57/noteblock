package routes

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"server/internal/api"
)

// have all routes in this file, single file this application's API surface
func Setup(fh *api.FolderHandler, nh *api.NoteHandler, bh *api.BlockHandler) *gin.Engine {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"}, // or "*"
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	apiGroup := r.Group("/api")
	{
		apiGroup.POST("/folders", fh.Create)
		apiGroup.GET("/folders/:id", fh.Retrieve)
		apiGroup.PUT("/folders", fh.Update)
		apiGroup.DELETE("/folders/:id", fh.Delete)

		apiGroup.POST("/notes", nh.Create)
		apiGroup.GET("/notes/:id", nh.Get)
		apiGroup.PUT("/notes/:id", nh.Update)
		apiGroup.DELETE("/notes/:id", nh.Delete)

		apiGroup.POST("/notes/:id/blocks", bh.Create)
		apiGroup.PUT("/notes/:id/blocks/:block_id", bh.UpdateContent)
	}
	return r
}
