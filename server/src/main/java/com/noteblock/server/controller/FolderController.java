package com.noteblock.server.controller;

import com.noteblock.server.model.Folder;
import com.noteblock.server.service.FolderService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/folders")
public class FolderController {

    private final FolderService folderService;

    public FolderController(FolderService folderService) {
        this.folderService = folderService;
    }

    @GetMapping
    public ResponseEntity<List<Folder>> getAllFolders() {
        return ResponseEntity.ok(folderService.getAllFolders());
    }

    @PostMapping
    public ResponseEntity<Folder> createFolder(@RequestBody Folder folderRequest) {
        Folder folder = folderService.createFolder(folderRequest.getName());
        return ResponseEntity.ok(folder);
    }

    @PutMapping("/{id}/rename")
    public ResponseEntity<Folder> renameFolder(@PathVariable Long id, @RequestBody String newName) {
        Folder updatedFolder = folderService.updateFolderName(id, newName);
        if (updatedFolder != null) {
            return ResponseEntity.ok(updatedFolder);
        }
        return ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteFolder(@PathVariable Long id) {
        folderService.deleteFolder(id);
        return ResponseEntity.noContent().build();
    }
}
