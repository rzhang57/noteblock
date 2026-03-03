import {localIpcClient} from "./LocalIpcClient";
import type {Note} from "@/types/Note.ts";

export interface Folder {
    id: string;
    name: string;
    parent_id: string;
    notes: Note[];
    children: Folder[];
}

export interface FolderCreateRequest {
    name: string;
    parent_id: string | null;
}

export interface FolderUpdateRequest {
    current_id: string;
    name?: string;
    parent_id?: string | null;
}

export interface FolderRenameRequest {
    current_id: string;
    name: string;
}

export interface FolderMoveRequest {
    current_id: string;
    parent_id: string | null;
}

export const FolderService = {

    async createFolder(request: FolderCreateRequest): Promise<Folder> {
        return localIpcClient.folder.create(request);
    },

    async getFolder(id: string): Promise<Folder> {
        return localIpcClient.folder.get(id);
    },

    async updateFolder(request: FolderUpdateRequest | FolderMoveRequest | FolderRenameRequest): Promise<Folder> {
        return localIpcClient.folder.update(request);
    },

    async deleteFolder(id: string): Promise<void> {
        await localIpcClient.folder.delete(id);
    },
};
