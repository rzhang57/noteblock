import {useCallback, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {FilePlus, FolderPlus} from "lucide-react";
import {FolderTreeItem} from "./FolderTreeItem";
import {FolderService} from "@/services/FolderService";
import type {Folder} from "@/services/FolderService";
import {NoteService} from "@/services/NoteService.ts";
import type {Note} from "@/types/Note.ts";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {CloudDatabaseSettings} from "@/components/CloudDatabaseSettings.tsx";
import {Menu} from "@/components/menu/Menu.tsx";
import {onNewItemRequest} from "@/components/window/createItem.ts";

export function Sidebar() {
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
    const [showCloudSettings, setShowCloudSettings] = useState(false);
    const [contextMenu, setContextMenu] = useState<{x: number; y: number} | null>(null);
    const {selectedNoteId, setSelectedNoteId, setNoteTitle, noteTitle} = useNoteContext();
    const [moveError, setMoveError] = useState<string | null>(null);
    const isInitialMount = useRef(true);

    const refreshRoot = async () => {
        const refreshed = await FolderService.getTree();
        setRoot(refreshed);
    };

    useEffect(() => {
        (async () => {
            const rootFolder = await FolderService.getTree();
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

        if (itemType === 'folder' && targetFolderId !== '') {
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

    useEffect(() => onNewItemRequest(kind => {
        if (kind === "note") createTemporaryNote(null);
        else createTemporaryFolder(null);
    }));

    const closeContextMenu = useCallback(() => setContextMenu(null), []);

    if (!root) {
        return (
            <div className="sidebar-loading">
                <div className="spinner" aria-label="Loading"/>
            </div>
        );
    }

    const treeItemProps = {
        depth: 0,
        expanded,
        onToggle: toggleFolder,
        onCreateNote: createTemporaryNote,
        onCreateFolder: createTemporaryFolder,
        onDeleteItem: handleDeleteItem,
        onRenameFolder: handleRenameFolder,
        onRenameNote: handleRenameNote,
        onMoveItem: handleMoveItem,
        setSidebarError: setMoveError,
        refreshRoot,
    };
    const isEmpty = root.children.length === 0 && root.notes.length === 0;

    return (
        <nav className="sidebar" aria-label="Notes">
            <div
                className="sidebar-scroll"
                onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({x: e.clientX, y: e.clientY});
                }}
            >
                <h2 className="sidebar-heading">Notes</h2>
                {moveError && (
                    <p className="sidebar-error" role="alert">
                        <span>{moveError}</span>
                        <button type="button" className="link-button" onClick={() => setMoveError(null)}>
                            Dismiss
                        </button>
                    </p>
                )}
                {isEmpty ? (
                    <p className="sidebar-empty">
                        Notes and folders you create are kept here.{" "}
                        <button type="button" className="link-button" onClick={() => createTemporaryNote(null)}>
                            New Note
                        </button>
                    </p>
                ) : (
                    <>
                        {root.children.map(child => (
                            <FolderTreeItem
                                key={child.id}
                                item={child}
                                isTemporary={child.id.includes('temp-folder-')}
                                {...treeItemProps}
                            />
                        ))}
                        {root.notes.map(note => (
                            <FolderTreeItem
                                key={note.id}
                                item={note}
                                isTemporary={note.id.includes('temp-note-')}
                                {...treeItemProps}
                            />
                        ))}
                    </>
                )}
            </div>
            <div className="sidebar-footer">
                <button type="button" className="sidebar-row" onClick={() => setShowCloudSettings(true)}>
                    <span className="sidebar-row-label">Sync Database…</span>
                </button>
            </div>
            {contextMenu && createPortal(
                <Menu
                    style={{position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 50}}
                    onClose={closeContextMenu}
                    entries={[
                        {label: "New Note", icon: <FilePlus/>, onSelect: () => createTemporaryNote(null)},
                        {label: "New Folder", icon: <FolderPlus/>, onSelect: () => createTemporaryFolder(null)},
                    ]}
                />,
                document.body
            )}
            {showCloudSettings && <CloudDatabaseSettings onClose={() => setShowCloudSettings(false)}/>}
        </nav>
    );
}
