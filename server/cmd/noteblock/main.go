package main

import (
	api2 "server/internal/api"
	"server/internal/db"
	"server/internal/routes"
	service2 "server/internal/service"
	storage2 "server/internal/storage"
)

func main() {
	dbConn := db.InitDb()

	// repositories
	fRepo := &storage2.FolderRepository{DB: dbConn}
	nRepo := &storage2.NoteRepository{DB: dbConn}

	// services
	fSvc := &service2.FolderService{Repo: fRepo}
	nSvc := &service2.NoteService{Repo: nRepo}

	// handlers - controllers
	fHandler := &api2.FolderHandler{Svc: fSvc}
	nHandler := &api2.NoteHandler{Svc: nSvc}

	r := routes.Setup(fHandler, nHandler)
	err := r.Run(":7474")
	if err != nil {
		return
	}
}
