import {useEffect, useRef, useState, type ReactNode} from "react";
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {GripVertical, Trash2, Copy, MoreHorizontal} from 'lucide-react';

interface SortableBlockProps {
    blockId: string;
    children: ReactNode;
    onDelete: (blockId: string) => void;
    onDuplicate: (blockId: string) => void;
}

export const SortableBlock = ({blockId, children, onDelete, onDuplicate}: SortableBlockProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
        activeIndex,
        index,
    } = useSortable({id: blockId});

    const [menuOpen, setMenuOpen] = useState(false);
    const gutterRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const onPointerDown = (e: MouseEvent) => {
            if (!gutterRef.current?.contains(e.target as Node)) setMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [menuOpen]);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    };

    const showDropLine = isOver && activeIndex !== index;
    const dropAbove = showDropLine && activeIndex > index;
    const dropBelow = showDropLine && activeIndex < index;

    const act = (fn: (id: string) => void) => {
        setMenuOpen(false);
        fn(blockId);
    };

    return (
        <div ref={setNodeRef} style={style} className="block">
            {dropAbove && <div className="block-drop-line" style={{top: -1}}/>}
            {dropBelow && <div className="block-drop-line" style={{bottom: -1}}/>}

            <div ref={gutterRef} className="block-gutter">
                <button
                    {...attributes}
                    {...listeners}
                    type="button"
                    className="block-gutter-button"
                    data-handle
                    title="Drag to move"
                    aria-label="Drag block"
                >
                    <GripVertical size={15}/>
                </button>

                <button
                    type="button"
                    onClick={() => setMenuOpen(v => !v)}
                    className="block-gutter-button"
                    title="Block actions"
                    aria-label="Block actions"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                >
                    <MoreHorizontal size={15}/>
                </button>

                {menuOpen && (
                    <div className="menu" role="menu">
                        <button type="button" role="menuitem" className="menu-item" onClick={() => act(onDuplicate)}>
                            <Copy/>
                            Duplicate
                        </button>
                        <button type="button" role="menuitem" className="menu-item" data-tone="destructive"
                                onClick={() => act(onDelete)}>
                            <Trash2/>
                            Delete
                        </button>
                    </div>
                )}
            </div>

            {children}
        </div>
    );
};
