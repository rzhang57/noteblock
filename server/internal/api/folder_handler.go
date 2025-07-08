package api

import (
	"fmt"
	"github.com/gin-gonic/gin"
	"net/http"
	"regexp"
	"server/internal/model"
	"server/internal/model/dto"
	"server/internal/service"
	"strconv"
)

type FolderHandler struct{ Svc *service.FolderService }

type FolderRequest struct {
	Name      *string `json:"name"`
	CurrentID *string `json:"current_id"`
	ParentID  *string `json:"parent_id"`
}

func (h *FolderHandler) Create(c *gin.Context) {
	var body FolderRequest
	err := ValidateJsonBody(&body, c)
	if err != nil {
		return
	}
	if body.ParentID == nil || *body.ParentID == "" {
		root := "root"
		body.ParentID = &root
	} else {
		if h.getFolder(body.ParentID, c) == nil {
			return
		}
	}
	existingFolders, err := h.Svc.ListChildrenByParentId(body.ParentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query folders"})
		return
	}

	if body.Name == nil || *body.Name == "" {
		newName := generateUniqueFolderName(existingFolders)
		body.Name = &newName
	} else {
		for _, f := range existingFolders {
			if f.Name == *body.Name {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Folder with that name already exists"})
				return
			}
		}
	}
	folder, err := h.Svc.CreateNewFolder(*body.Name, body.ParentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	createOrUpdateFolderToResponse(c, &folder, http.StatusCreated)
}

func (h *FolderHandler) Retrieve(c *gin.Context) {
	id := c.Param("id")
	if id == "" || &id == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing folder ID"})
		return
	}

	folder, err := h.Svc.GetFolderDtoById(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve folder"})
		return
	}
	if folder == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
		return
	}

	getFolderToResponse(c, folder, http.StatusOK)
}

func (h *FolderHandler) Update(c *gin.Context) {
	var body FolderRequest
	err := ValidateJsonBody(&body, c)
	if err != nil {
		return
	}

	if body.CurrentID == nil || *body.CurrentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing current folder ID"})
		return
	}

	currentFolder := h.getFolder(body.CurrentID, c)
	if currentFolder == nil {
		return
	}

	targetName := currentFolder.Name
	if body.Name != nil && *body.Name != "" {
		targetName = *body.Name
	}

	targetParentID := currentFolder.ParentID
	if body.ParentID != nil {
		targetParentID = body.ParentID
	}

	if h.getFolder(targetParentID, c) == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Parent folder does not exist"})
		return
	}

	siblings, err := h.Svc.ListChildrenByParentId(targetParentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check sibling folders"})
		return
	}
	for _, f := range siblings {
		if f.Name == targetName && f.ID != currentFolder.ID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Folder with that name already exists in the target parent"})
			return
		}
	}

	updatedFolder, err := h.Svc.UpdateFolder(currentFolder.ID, targetName, targetParentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update folder"})
		return
	}

	createOrUpdateFolderToResponse(c, updatedFolder, http.StatusOK)
}

func (h *FolderHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	if id == "" || &id == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing folder ID from request"})
		return
	}

	folder, err := h.Svc.GetFolderByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Something went wrong when trying to retrieve folder from database"})
		return
	}
	if folder == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder was not found or does not exist"})
		return
	}

	err = h.Svc.DeleteFolderAndContents(folder.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Something went wrong in the deletion process of the folder"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"id": folder.ID, "message": "Folder deleted successfully"})
}

func (h *FolderHandler) listAllFolders(parentID *string) ([]model.Folder, error) {
	folders, err := h.Svc.ListChildrenByParentId(parentID)
	return folders, err
}

func (h *FolderHandler) getFolder(parentId *string, c *gin.Context) *model.Folder {
	folder, err := h.Svc.GetFolderByID(*parentId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query parent folder"})
		return nil
	}
	return folder
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

func createOrUpdateFolderToResponse(c *gin.Context, folder *model.Folder, status int) {
	c.JSON(status, gin.H{
		"id":        folder.ID,
		"name":      folder.Name,
		"parent_id": folder.ParentID,
	})
}

func getFolderToResponse(c *gin.Context, folder *dto.FolderResponse, status int) {
	c.JSON(status, gin.H{
		"id":        folder.ID,
		"name":      folder.Name,
		"parent_id": folder.ParentID,
		"notes":     folder.Notes,
		"children":  folder.Children,
	})
}
