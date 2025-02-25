package com.noteblock.server.repository;

import com.noteblock.server.model.Folder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface FolderStore extends JpaRepository<Folder, Long> {
    Optional<Object> findByName(String name);
}