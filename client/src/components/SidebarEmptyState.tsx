import {FileText, Folder as FolderIcon, FolderPlus} from "lucide-react";
import {Button} from "@/components/ui/button.tsx";
import {useEffect, useRef, useState} from "react";

interface SidebarEmptyStateProps {
    createTemporaryNote: (parentId: string | null) => void;
    createTemporaryFolder: (parentId: string | null) => void;
}

export default function SidebarEmptyState({createTemporaryNote, createTemporaryFolder}: SidebarEmptyStateProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const ghostRef = useRef<HTMLDivElement>(null);
    const [showText, setShowText] = useState(true);

    useEffect(() => {
        const container = containerRef.current;
        const ghost = ghostRef.current;
        if (!container || !ghost) return;

        const check = () => setShowText(container.clientWidth >= ghost.scrollWidth);
        const observer = new ResizeObserver(check);
        observer.observe(container);
        check();
        return () => observer.disconnect();
    }, []);

    return (
        <div className="flex-1 flex flex-col justify-center">
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <div className="w-11 h-11 rounded-xl bg-sidebar-accent flex items-center justify-center mb-4">
                    <FolderIcon className="w-6 h-6 text-ink-faint"/>
                </div>
                <h3 className="text-[14px] font-medium text-ink mb-1.5">No files yet</h3>
                <p className="text-[13px] text-ink-muted mb-4 leading-relaxed">
                    Create your first note or folder to get started with your noteblock workspace.
                </p>
                {/* ghost: always renders with text to measure natural button width */}
                <div ref={ghostRef} className="flex items-center gap-1 invisible absolute pointer-events-none">
                    <Button variant="ghost" size="sm">
                        <FileText className="w-3 h-3 mr-1"/>New Note
                    </Button>
                    <Button variant="ghost" size="sm">
                        <FolderPlus className="w-3 h-3 mr-1"/>New Folder
                    </Button>
                </div>
                <div ref={containerRef} className="flex items-center gap-1 w-full justify-center">
                    <Button variant="ghost" size="sm" onClick={() => createTemporaryNote(null)}>
                        <FileText className="w-3 h-3 mr-1"/>
                        {showText && "New Note"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => createTemporaryFolder(null)}>
                        <FolderPlus className="w-3 h-3 mr-1"/>
                        {showText && "New Folder"}
                    </Button>
                </div>
            </div>
        </div>
    );
}