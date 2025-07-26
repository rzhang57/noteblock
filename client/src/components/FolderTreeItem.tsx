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

interface TreeProps {
    item: Folder | Note;
    depth: number;
    expanded: Set<string>;
    onToggle: (folderId: string) => void;
}

export const FolderTreeItem: React.FC<TreeProps> = ({
                                                        item,
                                                        depth,
                                                        expanded,
                                                        onToggle,
                                                    }) => {
    const {selectedNoteId, setSelectedNoteId, setNoteTitle} = useNoteContext();

    const isFolder = (item: Folder | Note): item is Folder =>
        Array.isArray((item as Folder).children);

    const baseIndent = depth * 16;

    if (isFolder(item)) {
        const open = expanded.has(item.id);
        const hasChildren = item.children.length > 0 || item.notes.length > 0;

        return (
            <>
                <div
                    onClick={() => onToggle(item.id)}
                    className="group flex items-center py-1 px-2 hover:bg-gray-100 cursor-pointer select-none"
                    style={{paddingLeft: baseIndent + 8}}
                >
                    {/* Arrow */}
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

                    {/* Folder icon + name */}
                    <div className="flex items-center gap-2">
                        {open ? (
                            <FolderOpen className="w-4 h-4 text-blue-500"/>
                        ) : (
                            <FolderIcon className="w-4 h-4 text-blue-500"/>
                        )}
                        <span className="truncate text-sm">{item.name}</span>
                    </div>
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
                setSelectedNoteId(item.id);
                setNoteTitle(item.title);
            }}
            className={cn(
                "flex items-center py-1 px-2 gap-2 cursor-pointer hover:bg-gray-100 select-none",
                active && "bg-blue-100 text-blue-900"
            )}
            style={{paddingLeft: baseIndent + 24}}
        >
            <FileText className="w-4 h-4 text-gray-600"/>
            <span className="truncate text-sm">{item.title}</span>
        </div>
    );
};
