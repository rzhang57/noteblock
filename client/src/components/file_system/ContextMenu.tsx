import {MoreHorizontal, FilePlus, FolderPlus, Trash2, Pencil, FolderUp} from "lucide-react";
import {useState, useRef, useEffect, useCallback} from "react";
import {createPortal} from "react-dom";
import {Menu, type MenuEntry} from "@/components/menu/Menu.tsx";

const MENU_WIDTH = 180;

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

    const entries: MenuEntry[] = [
        ...(isFolder ? [
            {label: "New Note", icon: <FilePlus/>, onSelect: onCreateNote},
            {label: "New Folder", icon: <FolderPlus/>, onSelect: onCreateFolder},
        ] : []),
        {label: "Move to Root", icon: <FolderUp/>, onSelect: onMoveToRoot, separatorBefore: isFolder},
        {label: "Rename", icon: <Pencil/>, onSelect: onRename},
        {label: "Delete", icon: <Trash2/>, onSelect: onDelete, destructive: true},
    ];

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={handleMenuClick}
                className="sidebar-row-actions"
                aria-label="Item actions"
                aria-haspopup="menu"
                aria-expanded={pos !== null}
            >
                <MoreHorizontal size={14}/>
            </button>

            {pos && createPortal(
                <Menu
                    entries={entries}
                    onClose={close}
                    triggerRef={triggerRef}
                    style={{position: "fixed", top: pos.top, left: pos.left, minWidth: MENU_WIDTH, zIndex: 9999}}
                />,
                document.body
            )}
        </>
    );
};
