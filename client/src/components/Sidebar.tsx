import React, {useEffect, useRef, useState} from "react";
import {AlertCircle, FileText, FolderPlus, Plus, X, ChevronLeft} from "lucide-react";
import {FolderTreeItem} from "./FolderTreeItem";
import {FolderService} from "@/services/FolderService";
import type {Folder} from "@/services/FolderService";
import {NoteService} from "@/services/NoteService.ts";
import type {Note} from "@/types/Note.ts";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {Alert, AlertDescription} from "@/components/ui/alert.tsx";
import SidebarEmptyState from "@/components/SidebarEmptyState.tsx";

const SidebarContextMenu: React.FC<{
    x: number;
    y: number;
    onClose: () => void;
    onNewNote: () => void;
    onNewFolder: () => void;
}> = ({x, y, onClose, onNewNote, onNewFolder}) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = () => onClose();
        const handleContextMenu = () => onClose();
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('contextmenu', handleContextMenu);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [onClose]);

    const handle = (action: () => void) => {
        action();
        onClose();
    };

    return (
        <div
            ref={menuRef}
            className="fixed bg-white border border-gray-200 rounded-md shadow-md py-1 z-50 min-w-[160px]"
            style={{top: y, left: x}}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            <button
                onClick={() => handle(onNewNote)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100"
            >
                <FileText className="w-4 h-4"/>
                New Note
            </button>
            <button
                onClick={() => handle(onNewFolder)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100"
            >
                <FolderPlus className="w-4 h-4"/>
                New Folder
            </button>
        </div>
    );
};

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
            className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-md py-1 z-50 min-w-[160px]"
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

const MIN_WIDTH = 150;
const DEFAULT_WIDTH = 208;
const MAX_WIDTH = 600;
const COLLAPSE_THRESHOLD = 150;

export const Sidebar: React.FC = () => {
    const [root, setRoot] = useState<Folder | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(() => {
        const storedExpanded = localStorage.getItem('sidebarExpanded');
        if (storedExpanded) {
            try {
                const parsed = JSON.parse(storedExpanded);
                if (Array.isArray(parsed)) {
                    return new Set(parsed);
                }
            } catch (e) {
                console.error("Failed to parse expanded state from localStorage", e);
            }
        }
        return new Set();
    });
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [contextMenu, setContextMenu] = useState<{x: number; y: number} | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
        const stored = localStorage.getItem('sidebarWidth');
        if (stored) {
            const parsed = parseInt(stored);
            if (!isNaN(parsed)) return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parsed));
        }
        return DEFAULT_WIDTH;
    });
    const sidebarWidthRef = useRef(sidebarWidth);
    const lastExpandedWidthRef = useRef(sidebarWidth);
    const {selectedNoteId, setSelectedNoteId, setNoteTitle, noteTitle} = useNoteContext();
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [moveError, setMoveError] = useState<string | null>(null);
    const isInitialMount = useRef(true);

    const refreshRoot = async () => {
        const refreshed = await FolderService.getFolder('root');
        setRoot(refreshed);
    };

    useEffect(() => {
        (async () => {
            const rootFolder = await FolderService.getFolder("root");
            setRoot(rootFolder);
            if (expanded.size === 0) {
                setExpanded(new Set([rootFolder.id]));
            }
        })();
    }, []);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        refreshRoot();
    }, [noteTitle]);

    useEffect(() => {
        if (expanded.size > 0) {
            localStorage.setItem('sidebarExpanded', JSON.stringify(Array.from(expanded)));
        }
    }, [expanded]);


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
            setSelectedNoteId(null);
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

    const handleCollapse = (collapsed: boolean) => {
        if (collapsed) {
            lastExpandedWidthRef.current = sidebarWidthRef.current;
        } else {
            const restoreWidth = lastExpandedWidthRef.current;
            sidebarWidthRef.current = restoreWidth;
            setSidebarWidth(restoreWidth);
        }
        setIsCollapsed(collapsed);
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('sidebarToggle'));
        }, 0);
    };

    const handleDragStart = (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = sidebarWidthRef.current;

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (e: MouseEvent) => {
            const newWidth = Math.max(100, Math.min(MAX_WIDTH, startWidth + (e.clientX - startX)));
            sidebarWidthRef.current = newWidth;
            setSidebarWidth(newWidth);
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            if (sidebarWidthRef.current < COLLAPSE_THRESHOLD) {
                handleCollapse(true);
            } else {
                localStorage.setItem('sidebarWidth', String(sidebarWidthRef.current));
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const handleCollapsedDragStart = (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const collapsedWidth = 40;

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (e: MouseEvent) => {
            const newWidth = Math.max(collapsedWidth, Math.min(MAX_WIDTH, collapsedWidth + (e.clientX - startX)));
            sidebarWidthRef.current = newWidth;
            setSidebarWidth(newWidth);
            if (newWidth >= COLLAPSE_THRESHOLD) {
                setIsCollapsed(false);
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            if (sidebarWidthRef.current < COLLAPSE_THRESHOLD) {
                setIsCollapsed(true);
                sidebarWidthRef.current = lastExpandedWidthRef.current;
                setSidebarWidth(lastExpandedWidthRef.current);
            } else {
                lastExpandedWidthRef.current = sidebarWidthRef.current;
                localStorage.setItem('sidebarWidth', String(sidebarWidthRef.current));
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('sidebarToggle'));
                }, 0);
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    if (!root) {
        return (
            <aside
                className="flex items-center justify-center h-full border-r bg-white"
                style={{width: isCollapsed ? 40 : sidebarWidth}}>
                <div className="h-4 w-4 rounded-full border-2 border-gray-300 border-t-gray-900 animate-spin"
                     aria-label="Loading"></div>
                <span className="sr-only">Loading</span>
            </aside>
        );
    }

    if (isCollapsed) {
        return (
            <aside className="h-full w-10 border-r bg-white flex flex-col items-center py-3 relative shrink-0">
                <button
                    onClick={() => handleCollapse(false)}
                    className="p-1.5 hover:bg-gray-100 rounded group relative cursor-pointer"
                    aria-label="Expand sidebar"
                >
                    <img src="./noteblock.png" alt="" className="h-5 w-5"/>
                    <span
                        className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-50">
                        Expand sidebar
                    </span>
                </button>
                <div
                    className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-blue-400/40 transition-colors z-20"
                    onMouseDown={handleCollapsedDragStart}
                />
            </aside>
        );
    }

    if (root.children.length === 0 && root.notes.length === 0) {
        return (
            <div className="h-full border-r bg-white flex flex-col relative shrink-0"
                 style={{width: sidebarWidth}}>
                <div className="px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                        <img src="./noteblock.png" alt="" className="h-5 w-5 shrink-0"/>
                        <h1 className="text-black text-base leading-none truncate"
                            style={{fontFamily: 'Minecraft'}}>noteblock</h1>
                    </div>
                    <button
                        onClick={() => handleCollapse(true)}
                        className="p-1 hover:bg-gray-100 rounded cursor-pointer shrink-0"
                        aria-label="Collapse sidebar"
                    >
                        <ChevronLeft className="w-4 h-4 text-gray-400"/>
                    </button>
                </div>
                <SidebarEmptyState createTemporaryNote={createTemporaryNote}
                                   createTemporaryFolder={createTemporaryFolder}/>
                <div
                    className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-black/20 transition-colors z-20"
                    onMouseDown={handleDragStart}
                />
            </div>
        );
    }

    return (
        <aside className="h-full border-r bg-white flex flex-col relative shrink-0"
               style={{width: sidebarWidth}}>
            <div className="px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <img src="./noteblock.png" alt="" className="h-5 w-5"/>
                </div>
                <div className="flex items-center gap-0.5">
                    <div className="relative">
                        <button
                            ref={buttonRef}
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowAddMenu(v => !v);
                            }}
                            className="p-1 rounded hover:bg-gray-100 cursor-pointer"
                            aria-label="New note or folder"
                        >
                            <Plus className="w-3.5 h-3.5 text-gray-500"/>
                        </button>
                        <AddMenu
                            open={showAddMenu}
                            onClose={() => setShowAddMenu(false)}
                            onNewFolder={() => createTemporaryFolder(null)}
                            onNewNote={() => createTemporaryNote(null)}
                            buttonRef={buttonRef}
                        />
                    </div>
                    <button
                        onClick={() => handleCollapse(true)}
                        className="p-1 rounded hover:bg-gray-100 cursor-pointer"
                        aria-label="Collapse sidebar"
                    >
                        <ChevronLeft className="w-4 h-4 text-gray-400"/>
                    </button>
                </div>
            </div>

            {moveError && (
                <div className="px-2 pb-1">
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

            {contextMenu && (
                <SidebarContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    onNewNote={() => createTemporaryNote(null)}
                    onNewFolder={() => createTemporaryFolder(null)}
                />
            )}

            <div
                className="flex-1 overflow-y-auto overflow-x-hidden p-1.5"
                onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({x: e.clientX, y: e.clientY});
                }}
            >
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
            <div
                className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-blue-400/40 transition-colors z-20"
                onMouseDown={handleDragStart}
            />
        </aside>
    );
};