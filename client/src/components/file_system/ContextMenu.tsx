import {MoreHorizontal, FileText, Folder, Trash2, Edit3, FolderUp} from "lucide-react";
import {useState, useRef, useEffect, useCallback} from "react";
import {createPortal} from "react-dom";

const MENU_WIDTH = 170;

interface ContextMenuProps {
    isFolder: boolean;
    onCreateNote: () => void;
    onCreateFolder: () => void;
    onDelete: () => void;
    onRename: () => void;
    onMoveToRoot: () => void;
    openAt?: { x: number; y: number } | null;
    onRequestClose?: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
                                                            isFolder,
                                                            onCreateNote,
                                                            onCreateFolder,
                                                            onDelete,
                                                            onRename,
                                                            onMoveToRoot,
                                                            openAt,
                                                            onRequestClose
                                                        }) => {
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const close = useCallback(() => {
        setPos(null);
        onRequestClose?.();
    }, [onRequestClose]);

    useEffect(() => {
        if (!openAt) return;
        setPos({
            top: Math.min(openAt.y, window.innerHeight - 200),
            left: Math.min(openAt.x, window.innerWidth - MENU_WIDTH - 8)
        });
    }, [openAt]);

    useEffect(() => {
        if (!pos) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (
                menuRef.current && !menuRef.current.contains(event.target as Node) &&
                triggerRef.current && !triggerRef.current.contains(event.target as Node)
            ) {
                close();
            }
        };
        const handleScroll = () => close();
        const handleKey = (e: KeyboardEvent) => e.key === "Escape" && close();

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('scroll', handleScroll, true);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('scroll', handleScroll, true);
            document.removeEventListener('keydown', handleKey);
        };
    }, [pos, close]);

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (pos) {
            close();
            return;
        }
        const rect = triggerRef.current!.getBoundingClientRect();
        setPos({
            top: rect.bottom + 2,
            left: Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)
        });
    };

    const handleAction = (action: () => void) => {
        action();
        close();
    };

    const item = "flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-[13px] transition-colors duration-150";

    return (
        <div className="shrink-0">
            <button
                ref={triggerRef}
                onClick={handleMenuClick}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-md text-ink-faint hover:bg-sidebar-accent hover:text-ink-muted transition-all duration-150 hover:cursor-pointer"
                aria-label="Item actions"
            >
                <MoreHorizontal className="w-3.5 h-3.5"/>
            </button>

            {pos && createPortal(
                <div
                    ref={menuRef}
                    className="surface-pop fixed rounded-lg p-1 z-[9999]"
                    style={{top: pos.top, left: pos.left, minWidth: MENU_WIDTH}}
                    onClick={e => e.stopPropagation()}
                >
                    {isFolder && (
                        <>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleAction(onCreateNote);
                                }}
                                className={`${item} text-ink hover:bg-accent`}
                            >
                                <FileText className="w-4 h-4"/>
                                New Note
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleAction(onCreateFolder);
                                }}
                                className={`${item} text-ink hover:bg-accent`}
                            >
                                <Folder className="w-4 h-4"/>
                                New Folder
                            </button>
                            <hr className="my-1 border-t border-rule"/>
                        </>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleAction(onMoveToRoot);
                        }}
                        className={`${item} text-ink hover:bg-accent`}
                    >
                        <FolderUp className="w-4 h-4"/>
                        Move to Root
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleAction(onRename);
                        }}
                        className={`${item} text-ink hover:bg-accent`}
                    >
                        <Edit3 className="w-4 h-4"/>
                        Rename
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleAction(onDelete);
                        }}
                        className={`${item} text-destructive hover:bg-destructive/10`}
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
