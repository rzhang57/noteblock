package com.noteblock.server.controller;

import com.noteblock.server.model.Note;
import com.noteblock.server.service.NoteService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
public class NoteController {

    private final NoteService noteService;

    public NoteController(NoteService noteService) {
        this.noteService = noteService;
    }

    @GetMapping("/folders/{folderId}/notes")
    public ResponseEntity<List<Note>> getNotesByFolder(@PathVariable Long folderId) {
        List<Note> notes = noteService.getNotesByFolder(folderId);
        return ResponseEntity.ok(notes);
    }

    @GetMapping("/notes/{id}")
    public ResponseEntity<Note> getNoteById(@PathVariable Long id) {
        return noteService.getNoteById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/folders/{folderId}/notes")
    public ResponseEntity<Note> createNote(@PathVariable Long folderId, @RequestBody Note noteRequest) {
        Note note = noteService.createNote(folderId, noteRequest.getTitle(), noteRequest.getContent());
        return ResponseEntity.ok(note);
    }

    @PutMapping("/notes/{id}")
    public ResponseEntity<Note> updateNote(@PathVariable Long id, @RequestBody Note noteRequest) {
        Note updatedNote = noteService.updateNote(id, noteRequest.getTitle(), noteRequest.getContent());
        if (updatedNote != null) {
            return ResponseEntity.ok(updatedNote);
        }
        return ResponseEntity.notFound().build();
    }

    @DeleteMapping("/notes/{id}")
    public ResponseEntity<Void> deleteNote(@PathVariable Long id) {
        noteService.deleteNote(id);
        return ResponseEntity.noContent().build();
    }
}
