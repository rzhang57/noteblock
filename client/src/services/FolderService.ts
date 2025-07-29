import {restClient} from "./RestClient";
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
    name: string;
    parent_id: string | null;
}

export interface FolderRenameRequest {
    current_id: string;
    name: string;
}

export interface FolderMoveRequest {
    current_id: string;
    parent_id: string | null;
}

export const folderService = {

    async createFolder(request: FolderCreateRequest): Promise<Folder> {
        return restClient.post<Folder>("/folders", request);
    },

    async getFolder(id: string): Promise<Folder> {
        return restClient.get<Folder>(`/folders/${id}`);
    },

    async updateFolder(request: FolderUpdateRequest | FolderMoveRequest | FolderRenameRequest): Promise<Folder> {
        return restClient.put<Folder>("/folders", request);
    },

    async deleteFolder(id: string): Promise<void> {
        return restClient.delete<void>(`/folders/${id}`);
    },
};