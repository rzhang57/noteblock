import {useEffect, useState} from "react";
import {FilePlus, FileText, FolderPlus, Plus} from "lucide-react";
import {FolderTreeItem} from "./FolderTreeItem";
import {folderService} from "@/services/FolderService";
import type {Folder} from "@/services/FolderService";
import {NoteService} from "@/services/NoteService.ts";
import type {Note} from "@/types/Note.ts";
import {useNoteContext} from "@/context/NoteContext.tsx";

const Popover: React.FC<{
    open: boolean;
    onClose: () => void;
    onNewFolder: () => void;
    onNewNote: () => void;
}> = ({open, onClose, onNewFolder, onNewNote}) =>
    !open ? null : (
        <div
            className="absolute right-2 mt-1 w-32 rounded border bg-white shadow-lg text-sm"
            onMouseLeave={onClose}
        >
            <button
                onClick={() => {
                    onNewFolder();
                    onClose();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-100"
            >
                <FolderPlus className="w-4 h-4"/> New folder
            </button>
            <button
                onClick={() => {
                    onNewNote();
                    onClose();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-100"
            >
                <FilePlus className="w-4 h-4"/> New note
            </button>
        </div>
    );

export const Sidebar: React.FC = () => {
    const [root, setRoot] = useState<Folder | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [showAddMenu, setShowAddMenu] = useState(false);
    const {selectedNoteId, setSelectedNoteId, setNoteTitle} = useNoteContext();

    useEffect(() => {
        (async () => {
            const rootFolder = await folderService.getFolder("root");
            setRoot(rootFolder);
            setExpanded(new Set([rootFolder.id])); // open root by default
        })();
    }, []);

    const refreshRoot = async () => {
        const refreshed = await folderService.getFolder('root');
        setRoot(refreshed);
    };

    const toggleFolder = (id: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleNewFolder = async () => {
        if (!root) return;
        await folderService.createFolder({name: '', parent_id: root.id});
        await refreshRoot();
    };

    const handleNewNote = async () => {
        if (!root) return;
        await NoteService.createNote({title: '', parent: root.id});
        await refreshRoot();
    };

    const handleCreateNote = async (parentFolderId: string) => {
        await NoteService.createNote({title: '', parent: parentFolderId});
        await refreshRoot();
    };

    const handleCreateFolder = async (parentFolderId: string) => {
        await folderService.createFolder({name: '', parent_id: parentFolderId});
        await refreshRoot();
    };

    const handleDeleteItem = async (item: Folder | Note) => {
        try {
            const isFolder = Array.isArray((item as Folder).children);
            if (isFolder) {
                await folderService.deleteFolder(item.id);
            } else {
                if (item.id === selectedNoteId) {
                    setSelectedNoteId(null);
                    setNoteTitle('');
                }
                await NoteService.deleteNote(item.id);
            }
            await refreshRoot();
        } catch (err) {
            console.error("Failed to delete item:", err);
        }
    };

    const handleRenameFolder = async (folderId: string, newName: string) => {
        setRoot(prev => {
            if (!prev) return prev;
            const updateFolder = (folder: Folder): Folder => {
                if (folder.id === folderId) {
                    return {...folder, name: newName};
                }
                return {
                    ...folder,
                    children: folder.children.map(updateFolder)
                };
            };
            return updateFolder(prev);
        });
        try {
            await folderService.updateFolder({
                current_id: folderId,
                name: newName,
            });
        } catch (err) {
            console.error("Failed to rename folder:", err);
            await refreshRoot();
        }
    };

    const handleRenameNote = async (noteId: string, newTitle: string) => {
        setRoot(prev => {
            if (!prev) return prev;
            const updateNote = (folder: Folder): Folder => ({
                ...folder,
                notes: folder.notes.map(note =>
                    note.id === noteId ? {...note, title: newTitle} : note
                ),
                children: folder.children.map(updateNote)
            });
            return updateNote(prev);
        });

        try {
            await NoteService.updateNote({id: noteId, title: newTitle});
            setNoteTitle(newTitle);
        } catch (err) {
            console.error("Failed to rename note:", err);
            await refreshRoot();
        }
    };

    if (!root) {
        return (
            <aside className="flex items-center justify-center h-full w-64 border-r bg-white">
                Loading…
            </aside>
        );
    }

    return (
        <aside className="h-full w-64 border-r bg-white flex flex-col">
            <div className="border-b p-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-white"/>
                </div>
                <h2 className="font-bold text-gray-900">Noteblock</h2>
            </div>

            <div className="flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-500">
                <span>NOTES</span>
                <button
                    onClick={() => setShowAddMenu(v => !v)}
                    className="p-1 rounded hover:bg-gray-200 hover:cursor-pointer"
                >
                    <Plus className="w-4 h-4"/>
                </button>
                <Popover
                    open={showAddMenu}
                    onClose={() => setShowAddMenu(false)}
                    onNewFolder={handleNewFolder}
                    onNewNote={handleNewNote}
                />
            </div>

            <div className="flex-1 overflow-auto p-2">
                {root.children?.map(child => (
                    <FolderTreeItem
                        key={child.id}
                        item={child}
                        depth={0}
                        expanded={expanded}
                        onToggle={toggleFolder}
                        onCreateNote={handleCreateNote}
                        onCreateFolder={handleCreateFolder}
                        onDeleteItem={handleDeleteItem}
                        onRenameFolder={handleRenameFolder}
                        onRenameNote={handleRenameNote}
                    />
                ))}
                {root.notes?.map(note => (
                    <FolderTreeItem
                        key={note.id}
                        item={note}
                        depth={0}
                        expanded={expanded}
                        onToggle={toggleFolder}
                        onCreateNote={handleCreateNote}
                        onCreateFolder={handleCreateFolder}
                        onDeleteItem={handleDeleteItem}
                        onRenameFolder={handleRenameFolder}
                        onRenameNote={handleRenameNote}
                    />
                ))}
            </div>
        </aside>
    );
};

// TODO: fix note creation (only creating in root atm)
// TODO: fix folder creation (creating in correct folder but not expanding the folder as it's being created)
