import {useEffect, useRef, useState} from "react";
import {AlertCircle, FileText, FolderPlus, Plus, X} from "lucide-react";
import {FolderTreeItem} from "./FolderTreeItem";
import {FolderService} from "@/services/FolderService";
import type {Folder} from "@/services/FolderService";
import {NoteService} from "@/services/NoteService.ts";
import type {Note} from "@/types/Note.ts";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {Alert, AlertDescription} from "@/components/ui/alert.tsx";
import SidebarEmptyState from "@/components/SidebarEmptyState.tsx";

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
            className="absolute right-0 top-8 bg-white border border-gray-200 shadow-lg py-1 z-50 min-w-[140px]"
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
    const [moveError, setMoveError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            const rootFolder = await FolderService.getFolder("root");
            setRoot(rootFolder);
            setExpanded(new Set([rootFolder.id]));
        })();
    }, []);

    // TODO: is there a better way to refresh UI without re-fetching the entire root every time?
    const refreshRoot = async () => {
        const refreshed = await FolderService.getFolder('root');
        setRoot(refreshed);
    };

    const toggleFolder = (id: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const createTemporaryNote = (parentFolderId: string | null) => {
        const tempId = `temp-note-${Date.now()}`;
        const tempNote: Note = {
            id: tempId,
            title: '',
            folder_id: parentFolderId || root?.id || '',
            blocks: [],
        };

        setRoot((prev) => {
            if (!prev) return prev;

            if (!parentFolderId) {
                return {
                    ...prev,
                    notes: [...prev.notes, tempNote],
                };
            }

            const updateFolder = (folder: Folder): Folder => {
                if (folder.id === parentFolderId) {
                    return {
                        ...folder,
                        notes: [...folder.notes, tempNote],
                    };
                }
                return {
                    ...folder,
                    children: folder.children.map(updateFolder),
                };
            };

            return updateFolder(prev);
        });
        setExpanded((prev) => new Set([...prev, parentFolderId || root?.id || '']));
    };

    const createTemporaryFolder = (parentFolderId: string | null) => {
        const tempId = `temp-folder-${Date.now()}`;
        const tempFolder: Folder = {
            id: tempId,
            name: '',
            parent_id: parentFolderId || root?.id || '',
            children: [],
            notes: [],
        };

        setRoot((prev) => {
            if (!prev) return prev;

            if (!parentFolderId) {
                return {
                    ...prev,
                    children: [...prev.children, tempFolder],
                };
            }

            const updateFolder = (folder: Folder): Folder => {
                if (folder.id === parentFolderId) {
                    return {
                        ...folder,
                        children: [...folder.children, tempFolder],
                    };
                }
                return {
                    ...folder,
                    children: folder.children.map(updateFolder),
                };
            };

            return updateFolder(prev);
        });

        setExpanded((prev) => new Set([...prev, parentFolderId || root?.id || '']));
    };

    const handleDeleteItem = async (item: Folder | Note) => {
        try {
            const isFolder = Array.isArray((item as Folder).children);
            if (isFolder) {
                await FolderService.deleteFolder(item.id);
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
            await FolderService.updateFolder({
                current_id: folderId,
                name: newName,
            });
        } catch (err) {
            console.error("Failed to rename folder:", err);
            setMoveError("Failed to rename folder. It might already exist in the target folder.");
        }
        await refreshRoot();
    };

    const handleRenameNote = async (noteId: string, newTitle: string) => {
        setMoveError(null);
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
            setMoveError("Failed to rename note. It might already exist in the target folder.");
        }
        await refreshRoot();
    };

    const handleMoveItem = async (item: string, targetFolderId: string, itemType: 'folder' | 'note') => {
        setMoveError(null);

        if (itemType === 'folder' && targetFolderId !== 'root') {
            const isDescendant = (sourceId: string, targetId: string, folder: Folder): boolean => {
                if (folder.id === sourceId) {
                    const checkDescendant = (f: Folder): boolean => {
                        if (f.id === targetId) return true;
                        return f.children.some(checkDescendant);
                    };
                    return checkDescendant(folder);
                }
                return folder.children.some(child => isDescendant(sourceId, targetId, child));
            };

            if (isDescendant(item, targetFolderId, root!)) {
                setMoveError("Cannot move a parent folder into its own child.");
                window.dispatchEvent(new CustomEvent('clearDragState'));
                return;
            }
        }

        try {
            if (itemType === 'folder') {
                await FolderService.updateFolder({current_id: item, parent_id: targetFolderId});
            } else {
                await NoteService.updateNote({id: item, folder_id: targetFolderId});
            }
            await refreshRoot();
            setExpanded(prev => new Set([...prev, targetFolderId]));
        } catch (err) {
            console.error("Failed to move item:", err);
            if (itemType === 'folder') {
                setMoveError("Name conflict or invalid folder move.");
            } else {
                setMoveError("Note could not be moved. It might already exist in the target folder.");
            }
        } finally {
            window.dispatchEvent(new CustomEvent('clearDragState'));
        }
    };

    if (!root) {
        return (
            <aside className="flex items-center justify-center h-full w-64 border-r bg-white">
                <div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-gray-900 animate-spin"
                     aria-label="Loading"></div>
                <span className="sr-only">Loading</span>
            </aside>
        );
    }

    if (root.children.length === 0 && root.notes.length === 0) {
        return (
            <>
                <div className="border-b p-4 flex items-center gap-2 h-full w-64 border-r bg-white flex flex-col">
                    <div className="flex items-center justify-center gap-3">
                        <img src="./noteblock.png" alt="" className="h-8 w-8 align-middle"/>
                        <h1 className="text-black text-3xl leading-[2rem] ml-1"
                            style={{fontFamily: 'Minecraft'}}>Noteblock</h1>
                    </div>
                    <SidebarEmptyState createTemporaryNote={createTemporaryNote}
                                       createTemporaryFolder={createTemporaryFolder}/>
                </div>
            </>

        )
    }

    return (
        <aside className="h-full w-64 border-r bg-white flex flex-col">
            <div className="border-b p-4 flex items-center gap-2">
                <div className="flex items-center justify-center gap-3">
                    <img src="./noteblock.png" alt="" className="h-8 w-8 align-middle"/>
                    <h1 className="text-black text-3xl leading-[2rem] ml-1"
                        style={{fontFamily: 'Minecraft'}}>Noteblock</h1>
                </div>
            </div>

            {moveError && (
                <div className="p-2">
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4"/>
                        <AlertDescription className="flex items-center justify-between">
                            <span>{moveError}</span>
                            <button
                                onClick={() => setMoveError(null)}
                                className="ml-2 hover:bg-red-200 rounded p-1"
                            >
                                <X className="h-3 w-3"/>
                            </button>
                        </AlertDescription>
                    </Alert>
                </div>
            )}

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
                        onNewFolder={() => createTemporaryFolder(null)}
                        onNewNote={() => createTemporaryNote(null)}
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
                        onCreateNote={createTemporaryNote}
                        onCreateFolder={createTemporaryFolder}
                        onDeleteItem={handleDeleteItem}
                        onRenameFolder={handleRenameFolder}
                        onRenameNote={handleRenameNote}
                        onMoveItem={handleMoveItem}
                        isTemporary={child.id.includes('temp-folder-')}
                        setSidebarError={setMoveError}
                        refreshRoot={refreshRoot}
                    />
                ))}
                {root.notes?.map(note => (
                    <FolderTreeItem
                        key={note.id}
                        item={note}
                        depth={0}
                        expanded={expanded}
                        onToggle={toggleFolder}
                        onCreateNote={createTemporaryNote}
                        onCreateFolder={createTemporaryFolder}
                        onDeleteItem={handleDeleteItem}
                        onRenameFolder={handleRenameFolder}
                        onRenameNote={handleRenameNote}
                        onMoveItem={handleMoveItem}
                        isTemporary={note.id.includes('temp-note-')}
                        setSidebarError={setMoveError}
                        refreshRoot={refreshRoot}
                    />
                ))}
            </div>
        </aside>
    );
};
