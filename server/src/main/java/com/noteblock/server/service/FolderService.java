package com.noteblock.server.service;

import com.noteblock.server.model.Folder;
import com.noteblock.server.repository.FolderStore;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class FolderService {

    private final FolderStore folderStore;

    public FolderService(FolderStore folderStore) {
        this.folderStore = folderStore;
    }

    public List<Folder> getAllFolders() {
        return folderStore.findAll();
    }

    public Optional<Folder> getFolderById(Long id) {
        return folderStore.findById(id);
    }

    public Folder createFolder(String name) {
        if (name == null || name.isEmpty()) {
            throw new IllegalArgumentException("Folder name cannot be empty");
        }
        if (folderStore.findByName(name).isPresent()) {
            throw new IllegalArgumentException("Folder with name " + name + " already exists");
        }
        return folderStore.save(new Folder(name));
    }

    public Folder updateFolderName(Long id, String newName) {
        Optional<Folder> folderOpt = folderStore.findById(id);
        if (folderOpt.isPresent()) {
            Folder folder = folderOpt.get();
            folder.setName(newName);
            return folderStore.save(folder);
        }
        return null;
    }

    public void deleteFolder(Long id) {
        folderStore.deleteById(id);
    }
}
