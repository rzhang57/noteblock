import {restClient} from "./RestClient";
import type {Block, Note} from "@/types/Note.ts";

export interface NoteCreateRequest {
    title: string;
    folder_id: string;
}

export interface NoteUpdateRequest {
    id: string;
    title: string;
}

export interface BlockCreateRequest {
    type: "text" | "canvas" | "image";
    index: number;
    content: string;
}

export interface BlockUpdateRequest {
    type: "text" | "canvas" | "image";
    content: Record<any, any>;
}

export const NoteService = {
    async getNote(id: string): Promise<Note> {
        return restClient.get<Note>(`/notes/${id}`);
    },

    async createNote(request: NoteCreateRequest): Promise<Note> {
        return restClient.post<Note>("/notes", request);
    },

    async updateNote(request: NoteUpdateRequest): Promise<Note> {
        return restClient.put<Note>(`/notes/${request.id}`, {title: request.title});
    },

    async deleteNote(id: string): Promise<void> {
        return restClient.delete<void>(`/notes/${id}`);
    },

    async createBlock(noteId: string, request: BlockCreateRequest): Promise<Block> {
        return restClient.post<Block>(`/notes/${noteId}/blocks`, request);
    },

    async updateBlock(noteId: string, blockId: string, request: BlockUpdateRequest): Promise<Block> {
        return restClient.put<Block>(`/notes/${noteId}/blocks/${blockId}`, request);
    },

    async deleteBlock(noteId: string, blockId: string): Promise<void> {
        return restClient.delete<void>(`/notes/${noteId}/blocks/${blockId}`);
    },
};
