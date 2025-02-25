package com.noteblock.server.repository;

import com.noteblock.server.model.Note;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NoteStore extends JpaRepository<Note, Long> {
    List<Note> findByFolderId(Long folderId);
}
