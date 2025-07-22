import type { Folder } from "@/services/FolderService"
import type { Note } from "@/services/NoteService"

export type FileSystemItem = Folder | Note

export interface FileSystemStructure {
    [key: string]: FileSystemItem
}

export function isFolder(item: FileSystemItem): item is Folder {
    return 'children' in item && 'notes' in item
}

export function isNote(item: FileSystemItem): item is Note {
    return 'title' in item && 'blocks' in item
}