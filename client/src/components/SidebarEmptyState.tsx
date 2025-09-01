import {FileText, Folder as FolderIcon, FolderPlus} from "lucide-react";
import {Button} from "@/components/ui/button.tsx";

interface SidebarEmptyStateProps {
    createTemporaryNote: (parentId: string | null) => void;
    createTemporaryFolder: (parentId: string | null) => void;
}

export default function SidebarEmptyState({createTemporaryNote, createTemporaryFolder}: SidebarEmptyStateProps) {
    return (
        <aside className="h-full w-64 border-r bg-white flex flex-col justify-center">
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div
                    className="w-12 h-12 border-2 border-gray-400 flex items-center justify-center mb-4">
                    <FolderIcon className="w-6 h-6 text-gray-400"/>
                </div>
                <h3 className="text-md font-medium text-sidebar-foreground mb-2">No files yet</h3>
                <p className="text-sm text-sidebar-foreground/60 mb-4 leading-relaxed">
                    Create your first note or folder to get started with your noteblock workspace.
                </p>
                <div className="flex items-center gap-1">
                    <Button
                        variant={"ghost"}
                        size="sm"
                        onClick={() => createTemporaryNote(null)}
                    >
                        <FileText className="w-3 h-3 mr-1"/>
                        New Note
                    </Button>
                    <Button
                        variant={"ghost"}
                        size="sm"
                        onClick={() => createTemporaryFolder(null)}
                    >
                        <FolderPlus className="w-3 h-3 mr-1"/>
                        New Folder
                    </Button>
                </div>
            </div>
        </aside>)
}