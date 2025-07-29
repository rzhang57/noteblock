import {useEffect, useRef, useState} from "react";
import {FileText, FolderPlus, Plus} from "lucide-react";
import {FolderTreeItem} from "./FolderTreeItem";
import {folderService} from "@/services/FolderService";
import type {Folder} from "@/services/FolderService";
import {NoteService} from "@/services/NoteService.ts";
import type {Note} from "@/types/Note.ts";
import {useNoteContext} from "@/context/NoteContext.tsx";

const AddMenu: React.FC<{
    open: boolean;
    onClose: () => void;
    onNewFolder: () => void;
    onNewNote: () => void;
    buttonRef: React.RefObject<HTMLButtonElement | null> | null;
}> = ({open, onClose, onNewFolder, onNewNote, buttonRef}) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(event.target as Node) &&
                buttonRef?.current &&
                !buttonRef.current.contains(event.target as Node)
            ) {
                onClose();
            }
        };

        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open, onClose, buttonRef]);

    if (!open) return null;

    const handleAction = (action: () => void) => {
        action();
        onClose();
    };

    return (
        <div
            ref={menuRef}
            className="absolute right-0 top-8 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50 min-w-[140px]"
            onClick={(e) => e.stopPropagation()}
        >
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    handleAction(onNewNote);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100"
            >
                <FileText className="w-4 h-4"/>
                New Note
            </button>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    handleAction(onNewFolder);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100"
            >
                <FolderPlus className="w-4 h-4"/>
                New Folder
            </button>
        </div>
    );
};

export const Sidebar: React.FC = () => {
    const [root, setRoot] = useState<Folder | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [showAddMenu, setShowAddMenu] = useState(false);
    const {selectedNoteId, setSelectedNoteId, setNoteTitle} = useNoteContext();
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        (async () => {
            const rootFolder = await folderService.getFolder("root");
            setRoot(rootFolder);
            setExpanded(new Set([rootFolder.id]));
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
        setExpanded(prev => new Set([...prev, root.id]));
    };

    const handleNewNote = async () => {
        if (!root) return;
        await NoteService.createNote({title: '', folder_id: root.id});
        await refreshRoot();
    };

    const handleCreateNote = async (parentFolderId: string) => {
        setExpanded(prev => new Set([...prev, parentFolderId]));
        await NoteService.createNote({title: '', folder_id: parentFolderId});
        await refreshRoot();
    };

    const handleCreateFolder = async (parentFolderId: string) => {
        setExpanded(prev => new Set([...prev, parentFolderId]));
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
                <div className="relative">
                    <button
                        ref={buttonRef}
                        onClick={(e) => {
                            e.stopPropagation()
                            setShowAddMenu(v => !v)
                        }}
                        className="p-1 rounded hover:bg-gray-200 hover:cursor-pointer"
                    >
                        <Plus className="w-4 h-4"/>
                    </button>
                    <AddMenu
                        open={showAddMenu}
                        onClose={() => setShowAddMenu(false)}
                        onNewFolder={handleNewFolder}
                        onNewNote={handleNewNote}
                        buttonRef={buttonRef}
                    />
                </div>
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
