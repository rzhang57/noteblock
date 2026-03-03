import {localIpcClient} from "./LocalIpcClient";
import type {Block, Note} from "@/types/Note.ts";

export interface NoteCreateRequest {
    title: string;
    folder_id: string;
}

export interface NoteUpdateRequest {
    id: string;
    title?: string;
    folder_id?: string;
    blocks?: Block[];
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
        return localIpcClient.note.get(id);
    },

    async createNote(request: NoteCreateRequest): Promise<Note> {
        return localIpcClient.note.create(request);
    },

    async updateNote(request: NoteUpdateRequest): Promise<Note> {
        return localIpcClient.note.update({
            id: request.id,
            title: request.title,
            folder_id: request.folder_id,
            blocks: request.blocks?.map((block) => ({
                id: block.id,
                index: block.index,
            })),
        });
    },

    async deleteNote(id: string): Promise<void> {
        await localIpcClient.note.delete(id);
    },

    async createBlock(noteId: string, request: BlockCreateRequest): Promise<Block> {
        return localIpcClient.block.create(noteId, request);
    },

    async updateBlock(noteId: string, blockId: string, request: BlockUpdateRequest): Promise<Block> {
        return localIpcClient.block.update(noteId, blockId, request);
    },

    async deleteBlock(noteId: string, blockId: string): Promise<void> {
        await localIpcClient.block.delete(noteId, blockId);
    },

    async uploadImage(image: File): Promise<string> {
        const bytes = new Uint8Array(await image.arrayBuffer());
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }
        const dataBase64 = btoa(binary);

        const response = await localIpcClient.asset.uploadImage({
            filename: image.name,
            data_base64: dataBase64,
        });
        return response.url;
    }
};
