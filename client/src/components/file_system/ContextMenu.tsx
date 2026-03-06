import {MoreHorizontal, FileText, Folder, Trash2, Edit3, FolderUp} from "lucide-react";
import {useState, useRef, useEffect} from "react";
import {createPortal} from "react-dom";

interface ContextMenuProps {
    isFolder: boolean;
    onCreateNote: () => void;
    onCreateFolder: () => void;
    onDelete: () => void;
    onRename: () => void;
    onMoveToRoot: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
                                                            isFolder,
                                                            onCreateNote,
                                                            onCreateFolder,
                                                            onDelete,
                                                            onRename,
                                                            onMoveToRoot
                                                        }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [menuPos, setMenuPos] = useState<{top: number; right: number} | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                menuRef.current && !menuRef.current.contains(event.target as Node) &&
                triggerRef.current && !triggerRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        const handleScroll = () => setIsOpen(false);

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('scroll', handleScroll, true);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('scroll', handleScroll, true);
        };
    }, []);

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setMenuPos({top: rect.bottom + 2, right: window.innerWidth - rect.right});
        }
        setIsOpen(v => !v);
    };

    const handleAction = (action: () => void) => {
        action();
        setIsOpen(false);
    };

    return (
        <div className="shrink-0">
            <button
                ref={triggerRef}
                onClick={handleMenuClick}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 transition-opacity hover:cursor-pointer"
            >
                <MoreHorizontal className="w-3 h-3 text-gray-500"/>
            </button>

            {isOpen && menuPos && createPortal(
                <div
                    ref={menuRef}
                    className="fixed bg-white border border-gray-200 rounded-md shadow-md py-1 z-[9999] min-w-[160px]"
                    style={{top: menuPos.top, right: menuPos.right}}
                    onClick={e => e.stopPropagation()}
                >
                    {isFolder && (
                        <>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleAction(onCreateNote);
                                }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100"
                            >
                                <FileText className="w-4 h-4"/>
                                New Note
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleAction(onCreateFolder);
                                }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100"
                            >
                                <Folder className="w-4 h-4"/>
                                New Folder
                            </button>
                            <hr className="my-1 border-gray-200"/>
                        </>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleAction(onMoveToRoot);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100"
                    >
                        <FolderUp className="w-4 h-4"/>
                        Move to Root
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleAction(onRename);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100"
                    >
                        <Edit3 className="w-4 h-4"/>
                        Rename
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleAction(onDelete);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-red-50 text-red-600"
                    >
                        <Trash2 className="w-4 h-4"/>
                        Delete
                    </button>
                </div>,
                document.body
            )}
        </div>
    );
};