import {MoreHorizontal, FileText, Folder, Trash2, Edit3} from "lucide-react";
import {useState, useRef, useEffect} from "react";

interface ContextMenuProps {
    isFolder: boolean;
    onCreateNote: () => void;
    onCreateFolder: () => void;
    onDelete: () => void;
    onRename: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
                                                            isFolder,
                                                            onCreateNote,
                                                            onCreateFolder,
                                                            onDelete,
                                                            onRename
                                                        }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    const handleAction = (action: () => void) => {
        action();
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={handleMenuClick}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-opacity hover:cursor-pointer"
            >
                <MoreHorizontal className="w-3 h-3 text-gray-500"/>
            </button>

            {isOpen && (
                <div
                    className="absolute right-0 top-6 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50 min-w-[140px]">
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
                                    e.stopPropagation()
                                    handleAction(onCreateFolder)
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
                            e.stopPropagation()
                            handleAction(onRename)
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100"
                    >
                        <Edit3 className="w-4 h-4"/>
                        Rename
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleAction(onDelete)
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-red-50 text-red-600"
                    >
                        <Trash2 className="w-4 h-4"/>
                        Delete
                    </button>
                </div>
            )}
        </div>
    );
};