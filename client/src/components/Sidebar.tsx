import {useEffect, useState} from "react";
import {FileText} from "lucide-react";
import {FolderTreeItem} from "./FolderTreeItem";
import {folderService} from "@/services/FolderService";
import type {Folder} from "@/services/FolderService";

interface NotebookSidebarProps {
    selectedNoteId: string | null;
    onNoteSelect: (noteId: string) => void;
}

export const NotebookSidebar: React.FC<NotebookSidebarProps> = ({
                                                                    selectedNoteId,
                                                                    onNoteSelect,
                                                                }) => {
    const [root, setRoot] = useState<Folder | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    useEffect(() => {
        (async () => {
            const rootFolder = await folderService.getFolder("root");
            setRoot(rootFolder);
            setExpanded(new Set([rootFolder.id])); // open root by default
        })();
    }, []);

    const toggleFolder = (id: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }


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
                <h2 className="font-semibold text-gray-900">Files</h2>
            </div>

            <div className="flex-1 overflow-auto p-2">
                {root.children?.map(child => (
                    <FolderTreeItem
                        key={child.id}
                        item={child}
                        depth={0}
                        expanded={expanded}
                        onToggle={toggleFolder}
                        selectedNoteId={selectedNoteId}
                        onNoteSelect={onNoteSelect}
                    />
                ))}
                {root.notes?.map(note => (
                    <FolderTreeItem
                        key={note.id}
                        item={note}
                        depth={0}
                        expanded={expanded}
                        onToggle={toggleFolder}
                        selectedNoteId={selectedNoteId}
                        onNoteSelect={onNoteSelect}
                    />
                ))}
            </div>

        </aside>
    );
};
