import {
    Folder as FolderIcon,
    FolderOpen,
    FileText,
    ChevronRight,
    ChevronDown,
} from "lucide-react";
import type {Folder} from "@/services/FolderService";
import type {Note} from "@/services/NoteService";
import {cn} from "@/lib/utils";

interface TreeProps {
    item: Folder | Note;
    depth: number;
    expanded: Set<string>;
    onToggle: (folderId: string) => void;
    selectedNoteId: string | null;
    onNoteSelect: (noteId: string) => void;
}


// TODO: if performance becomes an issue, consider lazy loading children on expand only
export const FolderTreeItem: React.FC<TreeProps> = ({
                                                        item,
                                                        depth,
                                                        expanded,
                                                        onToggle,
                                                        selectedNoteId,
                                                        onNoteSelect,
                                                    }) => {
    if (isFolder(item)) {

        const open = expanded.has(item.id);
        const hasChildren = item.children.length > 0 || item.notes.length > 0;

        return (
            <>
                <div
                    onClick={() => onToggle(item.id)}
                    style={{paddingLeft: depth * 16 + 8}}
                    className="flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-gray-100 select-none"
                >
                    {hasChildren ? (
                        open ? (
                            <ChevronDown className="w-3 h-3 text-gray-500"/>
                        ) : (
                            <ChevronRight className="w-3 h-3 text-gray-500"/>
                        )
                    ) : (
                        <span className="w-3"/>
                    )}

                    {open ? (
                        <FolderOpen className="w-4 h-4 text-blue-500"/>
                    ) : (
                        <FolderIcon className="w-4 h-4 text-blue-500"/>
                    )}
                    <span className="truncate">{item.name}</span>
                </div>

                {open && (
                    <>
                        {item.children
                            .slice()
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(f => (
                                <FolderTreeItem
                                    key={f.id}
                                    item={f}
                                    depth={depth + 1}
                                    expanded={expanded}
                                    onToggle={onToggle}
                                    selectedNoteId={selectedNoteId}
                                    onNoteSelect={onNoteSelect}
                                />
                            ))}
                        {item.notes
                            .slice()
                            .sort((a, b) => a.title.localeCompare(b.title))
                            .map(n => (
                                <FolderTreeItem
                                    key={n.id}
                                    item={n}
                                    depth={depth + 1}
                                    expanded={expanded}
                                    onToggle={onToggle}
                                    selectedNoteId={selectedNoteId}
                                    onNoteSelect={onNoteSelect}
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
            onClick={() => onNoteSelect(item.id)}
            style={{paddingLeft: depth * 16 + 28}}
            className={cn(
                "flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-gray-100 select-none",
                active && "bg-blue-100 text-blue-900"
            )}
        >
            <FileText className="w-4 h-4 text-gray-600"/>
            <span className="truncate">{item.title}</span>
        </div>
    );
};

const isFolder = (item: Folder | Note): item is Folder => {
    return Array.isArray((item as Folder).children);
};
