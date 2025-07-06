package main

import (
	"server/internal/api"
	"server/internal/db"
	"server/internal/routes"
	"server/internal/service"
)

func main() {
	dbConn := db.InitDb()

	// services
	fSvc := &service.FolderService{DB: dbConn}
	nSvc := &service.NoteService{DB: dbConn}

	// handlers - controllers
	fHandler := &api.FolderHandler{Svc: fSvc}
	nHandler := &api.NoteHandler{Svc: nSvc}

	r := routes.Setup(fHandler, nHandler)
	err := r.Run(":7474")
	if err != nil {
		return
	}
}
