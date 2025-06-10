package main

import (
	"server/api"
	"server/db"
	"server/router"
	"server/service"
	"server/storage"
)

func main() {
	dbConn := db.InitDb()

	// repositories
	fRepo := &storage.FolderRepository{DB: dbConn}
	nRepo := &storage.NoteRepository{DB: dbConn}

	// services
	fSvc := &service.FolderService{Repo: fRepo}
	nSvc := &service.NoteService{Repo: nRepo}

	// handlers
	fHandler := &api.FolderHandler{Svc: fSvc}
	nHandler := &api.NoteHandler{Svc: nSvc}

	r := router.Setup(fHandler, nHandler)
	err := r.Run(":7474")
	if err != nil {
		return
	}
}
