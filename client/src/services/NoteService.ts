import {restClient} from "./RestClient";

export interface Note {
    id: string;
    title: string;
    blocks: Block[];
}

export interface NoteCreateRequest {
    title: string;
    blocks: Block[];
}

export interface Block {
    id: string;
    type: "text" | "canvas" | "image";
    index: number;
    content: string;
    createdAt: Date;
    updatedAt: Date;
}

// note: noteId should be a parameter in request url
export interface BlockCreateRequest {
    type: "text" | "canvas" | "image";
    index: number;
    content: string;
}

// note: noteId and blockId should be parameters in request url
export interface BlockUpdateRequest {
    type: "text" | "canvas" | "image";
    content: string;
}



async function getNote(id: string): Promise<Note> {
    return restClient.get<Note>(`/notes/${id}`);
}

async function createNote(title: string, parent: string): Promise<Note> {
    return restClient.post<Note>("/notes", { title, parent });
}