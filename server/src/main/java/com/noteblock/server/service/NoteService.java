package com.noteblock.server.service;

import com.noteblock.server.model.Folder;
import com.noteblock.server.model.Note;
import com.noteblock.server.repository.NoteStore;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class NoteService {

    private final NoteStore noteRepository;
    private final FolderService folderService;

    public NoteService(NoteStore noteRepository, FolderService folderService) {
        this.noteRepository = noteRepository;
        this.folderService = folderService;
    }

    public List<Note> getNotesByFolder(Long folderId) {
        return noteRepository.findByFolderId(folderId);
    }

    public Optional<Note> getNoteById(Long id) {
        return noteRepository.findById(id);
    }

    public Note createNote(Long folderId, String title, String content) {
        Folder folder = folderService.getFolderById(folderId)
                .orElseThrow(() -> new IllegalArgumentException("Folder not found"));
        return noteRepository.save(new Note(folder, title));
    }

    public Note updateNote(Long id, String title, String content) {
        Optional<Note> noteOpt = noteRepository.findById(id);
        if (noteOpt.isPresent()) {
            Note note = noteOpt.get();
            note.setTitle(title);
            note.setContent(content);
            return noteRepository.save(note);
        }
        return null;
    }

    public void deleteNote(Long id) {
        noteRepository.deleteById(id);
    }
}
