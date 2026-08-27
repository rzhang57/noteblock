package main

import (
	"log"
	"os"
	"server/internal/db"
	"server/internal/ipc"
	"server/internal/service"
)

func main() {
	dbConn := db.InitDb()

	// services
	nSvc := &service.NoteService{DB: dbConn}
	fSvc := &service.FolderService{DB: dbConn, NoteService: nSvc}
	bSvc := &service.BlockService{DB: dbConn}

	server := ipc.NewServer(nSvc, fSvc, bSvc)
	if err := server.Run(os.Stdin, os.Stdout); err != nil {
		// stderr: stdout is the IPC protocol.
		log.Fatalf("ipc server terminated: %v", err)
	}
}
