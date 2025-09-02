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
	nSvc := &service.NoteService{DB: dbConn}
	fSvc := &service.FolderService{DB: dbConn, NoteService: nSvc}
	bSvc := &service.BlockService{DB: dbConn}

	// handlers - controllers
	fHandler := &api.FolderHandler{Svc: fSvc}
	nHandler := &api.NoteHandler{Svc: nSvc, BlockSvc: bSvc}
	bHandler := &api.BlockHandler{Svc: bSvc}

	r := routes.Setup(fHandler, nHandler, bHandler)
	err := r.Run(":7474")
	if err != nil {
		return
	}
}
