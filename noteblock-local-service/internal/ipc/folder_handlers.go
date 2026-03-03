package ipc

func (s *Server) folderCreate(req Request) Response {
	var body struct {
		Name     *string `json:"name"`
		ParentID *string `json:"parent_id"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}

	if body.ParentID == nil || *body.ParentID == "" {
		root := "root"
		body.ParentID = &root
	}

	if _, err := s.folderSvc.GetFolderByID(*body.ParentID); err != nil {
		return dbErrToRPC(req.ID, err, "Failed to query parent folder")
	}

	existingFolders, err := s.folderSvc.ListChildrenByParentId(body.ParentID)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to query folders")
	}

	if body.Name == nil || *body.Name == "" {
		newName := generateUniqueFolderName(existingFolders)
		body.Name = &newName
	} else {
		for _, f := range existingFolders {
			if f.Name == *body.Name {
				return rpcErr(req.ID, "CONFLICT", "Folder with that name already exists")
			}
		}
	}

	folder, err := s.folderSvc.CreateNewFolder(*body.Name, body.ParentID)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to create new folder")
	}

	return Response{
		ID: req.ID,
		Result: map[string]any{
			"id":        folder.ID,
			"name":      folder.Name,
			"parent_id": folder.ParentID,
		},
	}
}

func (s *Server) folderGet(req Request) Response {
	var body struct {
		ID string `json:"id"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}
	if body.ID == "" {
		return rpcErr(req.ID, "BAD_REQUEST", "Missing folder ID")
	}

	folder, err := s.folderSvc.GetFolderDtoById(body.ID)
	if err != nil {
		return dbErrToRPC(req.ID, err, "Failed to retrieve folder")
	}

	return Response{
		ID:     req.ID,
		Result: folder,
	}
}

func (s *Server) folderUpdate(req Request) Response {
	var body struct {
		CurrentID *string `json:"current_id"`
		Name      *string `json:"name"`
		ParentID  *string `json:"parent_id"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}
	if body.CurrentID == nil || *body.CurrentID == "" {
		return rpcErr(req.ID, "BAD_REQUEST", "Missing current folder ID")
	}

	currentFolder, err := s.folderSvc.GetFolderByID(*body.CurrentID)
	if err != nil {
		return dbErrToRPC(req.ID, err, "Failed to retrieve folder")
	}

	targetName := currentFolder.Name
	if body.Name != nil && *body.Name != "" {
		targetName = *body.Name
	}

	targetParentID := currentFolder.ParentID
	if body.ParentID != nil && *body.ParentID != "" {
		targetParentID = body.ParentID
	}
	if targetParentID == nil || *targetParentID == "" {
		root := "root"
		targetParentID = &root
	}

	if _, err := s.folderSvc.GetFolderByID(*targetParentID); err != nil {
		return dbErrToRPC(req.ID, err, "Parent folder does not exist")
	}

	siblings, err := s.folderSvc.ListChildrenByParentId(targetParentID)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to check sibling folders")
	}
	for _, f := range siblings {
		if f.Name == targetName && f.ID != currentFolder.ID {
			return rpcErr(req.ID, "CONFLICT", "Folder with that name already exists in the target parent")
		}
	}

	updated, err := s.folderSvc.UpdateFolder(currentFolder.ID, targetName, targetParentID)
	if err != nil {
		return rpcErr(req.ID, "INTERNAL", "Failed to update folder")
	}

	return Response{
		ID: req.ID,
		Result: map[string]any{
			"id":        updated.ID,
			"name":      updated.Name,
			"parent_id": updated.ParentID,
		},
	}
}

func (s *Server) folderDelete(req Request) Response {
	var body struct {
		ID string `json:"id"`
	}
	if err := parseParams(req.Params, &body); err != nil {
		return rpcErr(req.ID, "BAD_REQUEST", "Invalid params")
	}
	if body.ID == "" {
		return rpcErr(req.ID, "BAD_REQUEST", "Missing folder ID")
	}
	if body.ID == "root" {
		return rpcErr(req.ID, "BAD_REQUEST", "Cannot delete root folder")
	}

	folder, err := s.folderSvc.GetFolderByID(body.ID)
	if err != nil {
		return dbErrToRPC(req.ID, err, "Folder was not found or does not exist")
	}
	if err := s.folderSvc.DeleteFolderAndContents(folder.ID); err != nil {
		return rpcErr(req.ID, "INTERNAL", "Something went wrong in the deletion process of the folder")
	}

	return Response{
		ID: req.ID,
		Result: map[string]any{
			"id":      folder.ID,
			"message": "Folder deleted successfully",
		},
	}
}
