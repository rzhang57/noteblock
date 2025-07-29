import {
    Folder as FolderIcon,
    FolderOpen,
    FileText,
    ChevronRight,
    ChevronDown,
} from "lucide-react";
import type {Folder} from "@/services/FolderService";
import type {Note} from "@/types/Note";
import {cn} from "@/lib/utils";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {ContextMenu} from "./file_system/ContextMenu";
import {InlineRename} from "./file_system/InlineRename";
import {useState} from "react";

interface TreeProps {
    item: Folder | Note;
    depth: number;
    expanded: Set<string>;
    onToggle: (folderId: string) => void;
    onCreateNote: (parentFolderId: string) => void;
    onCreateFolder: (parentFolderId: string) => void;
    onDeleteItem: (item: Folder | Note) => void;
    onRenameFolder: (folderId: string, newName: string) => void;
    onRenameNote: (noteId: string, newTitle: string) => void;
}

export const FolderTreeItem: React.FC<TreeProps> = ({
                                                        item,
                                                        depth,
                                                        expanded,
                                                        onToggle,
                                                        onCreateNote,
                                                        onCreateFolder,
                                                        onDeleteItem,
                                                        onRenameFolder,
                                                        onRenameNote,
                                                    }) => {
    const {selectedNoteId, setSelectedNoteId, setNoteTitle} = useNoteContext();
    const [isRenaming, setIsRenaming] = useState(false);

    const isFolder = (item: Folder | Note): item is Folder =>
        Array.isArray((item as Folder).children);

    const baseIndent = depth * 16;

    const handleRename = () => {
        setIsRenaming(true);
    };

    const handleRenameSave = (newName: string) => {
        if (isFolder(item)) {
            onRenameFolder(item.id, newName);
        } else {
            onRenameNote(item.id, newName);
        }
        setIsRenaming(false);
    };

    const handleRenameCancel = () => {
        setIsRenaming(false);
    };

    if (isFolder(item)) {
        const open = expanded.has(item.id);
        const hasChildren = item.children.length > 0 || item.notes.length > 0;

        return (
            <>
                <div
                    onClick={() => !isRenaming && onToggle(item.id)}
                    className="group flex items-center justify-between py-1 px-2 hover:bg-gray-100 cursor-pointer select-none"
                    style={{paddingLeft: baseIndent + 8}}
                >
                    <div className="flex items-center flex-1">
                        <div className="w-4 flex items-center justify-center">
                            {hasChildren ? (
                                open ? (
                                    <ChevronDown className="w-3 h-3 text-gray-500"/>
                                ) : (
                                    <ChevronRight className="w-3 h-3 text-gray-500"/>
                                )
                            ) : (
                                <span className="w-3"/>
                            )}
                        </div>

                        <div className="flex items-center gap-2 flex-1">
                            {open ? (
                                <FolderOpen className="w-4 h-4 text-blue-500"/>
                            ) : (
                                <FolderIcon className="w-4 h-4 text-blue-500"/>
                            )}
                            {isRenaming ? (
                                <InlineRename
                                    initialValue={item.name}
                                    onSave={handleRenameSave}
                                    onCancel={handleRenameCancel}
                                />
                            ) : (
                                <span className="truncate text-sm">{item.name}</span>
                            )}
                        </div>
                    </div>

                    {!isRenaming && (
                        <ContextMenu
                            isFolder={true}
                            onCreateNote={() => onCreateNote(item.id)}
                            onCreateFolder={() => onCreateFolder(item.id)}
                            onDelete={() => onDeleteItem(item)}
                            onRename={handleRename}
                        />
                    )}
                </div>

                {open && (
                    <>
                        {item.children
                            .slice()
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((f) => (
                                <FolderTreeItem
                                    key={f.id}
                                    item={f}
                                    depth={depth + 1}
                                    expanded={expanded}
                                    onToggle={onToggle}
                                    onCreateNote={onCreateNote}
                                    onCreateFolder={onCreateFolder}
                                    onDeleteItem={onDeleteItem}
                                    onRenameFolder={onRenameFolder}
                                    onRenameNote={onRenameNote}
                                />
                            ))}
                        {item.notes
                            .slice()
                            .sort((a, b) => a.title.localeCompare(b.title))
                            .map((n) => (
                                <FolderTreeItem
                                    key={n.id}
                                    item={n}
                                    depth={depth + 1}
                                    expanded={expanded}
                                    onToggle={onToggle}
                                    onCreateNote={onCreateNote}
                                    onCreateFolder={onCreateFolder}
                                    onDeleteItem={onDeleteItem}
                                    onRenameFolder={onRenameFolder}
                                    onRenameNote={onRenameNote}
                                />
                            ))}
                    </>
                )}
            </>
        );
    }

    const active = selectedNoteId === item.id;

    return (
        <div
            onClick={() => {
                if (!isRenaming) {
                    setSelectedNoteId(item.id)
                    setNoteTitle(item.title)
                }
            }}
            className={cn(
                "group flex items-center justify-between py-1 px-2 gap-2 cursor-pointer hover:bg-gray-100 select-none",
                active && "bg-blue-100 text-blue-900"
            )}
            style={{paddingLeft: baseIndent + 24}}
        >
            <div className="flex items-center gap-2 flex-1">
                <FileText className="w-4 h-4 text-gray-600"/>
                {isRenaming ? (
                    <InlineRename
                        initialValue={item.title}
                        onSave={handleRenameSave}
                        onCancel={handleRenameCancel}
                    />
                ) : (
                    <span className="truncate text-sm">{item.title}</span>
                )}
            </div>

            {!isRenaming && (
                <ContextMenu
                    isFolder={false}
                    onCreateNote={() => {
                    }}
                    onCreateFolder={() => {
                    }}
                    onDelete={() => onDeleteItem(item)}
                    onRename={handleRename}
                />
            )}
        </div>
    );
};