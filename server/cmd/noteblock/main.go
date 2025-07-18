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
	bSvc := &service.BlockService{DB: dbConn}

	// handlers - controllers
	fHandler := &api.FolderHandler{Svc: fSvc}
	nHandler := &api.NoteHandler{Svc: nSvc}
	bHandler := &api.BlockHandler{Svc: bSvc}

	r := routes.Setup(fHandler, nHandler, bHandler)
	err := r.Run(":7474")
	if err != nil {
		return
	}
}
