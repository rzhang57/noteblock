package api

import (
	"fmt"
	"github.com/gin-gonic/gin"
	"net/http"
	"regexp"
	"server/internal/model"
	"server/internal/service"
	"strconv"
)

type FolderHandler struct{ Svc *service.FolderService }

type RequestBody struct {
	Name     string  `json:"name"`
	ParentID *string `json:"parent_id"`
}

func (h *FolderHandler) Create(c *gin.Context) {
	var body RequestBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid body"})
		return
	}
	if body.ParentID == nil {
		root := "root"
		body.ParentID = &root
	}
	existingFolders, err := h.Svc.ListChildrenByParentId(body.ParentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query folders"})
		return
	}

	if body.Name == "" {
		body.Name = generateUniqueFolderName(existingFolders)
	} else {
		for _, f := range existingFolders {
			if f.Name == body.Name {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Folder with that name already exists"})
				return
			}
		}
	}

	folder, err := h.Svc.NewFolder(body.Name, body.ParentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": folder.ID, "name": folder.Name, "parent_id": folder.ParentID})
}

func generateUniqueFolderName(folders []model.Folder) string {
	base := "New Folder"
	maxIndex := 0
	pattern := regexp.MustCompile(`^New Folder(?: (\d+))?$`)

	for _, f := range folders {
		matches := pattern.FindStringSubmatch(f.Name)
		if len(matches) > 1 && matches[1] != "" {
			if idx, err := strconv.Atoi(matches[1]); err == nil {
				if idx > maxIndex {
					maxIndex = idx
				}
			}
		} else if f.Name == base && maxIndex == 0 {
			maxIndex = 1
		}
	}

	if maxIndex == 0 {
		return base
	}
	return fmt.Sprintf("%s %d", base, maxIndex+1)
}
