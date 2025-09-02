package api

import (
	"github.com/gin-gonic/gin"
	"net/http"
)

func ValidateAndSetJsonBody[T any](body *T, c *gin.Context) error {
	if err := c.ShouldBindJSON(body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON in body"})
		return err
	}
	return nil
}
