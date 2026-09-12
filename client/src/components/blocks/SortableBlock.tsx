import {useEffect, useRef, useState, type ReactNode} from "react";
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {GripVertical, Trash2, Copy} from 'lucide-react';

interface SortableBlockProps {
    blockId: string;
    children: ReactNode;
    onDelete: (blockId: string) => void;
    onDuplicate: (blockId: string) => void;
    showBoundary?: boolean;
}

export const SortableBlock = ({blockId, children, onDelete, onDuplicate, showBoundary}: SortableBlockProps) => {
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
        <div ref={setNodeRef} style={style} className="group relative">
            {dropAbove && <div className="absolute -top-px inset-x-0 z-10 h-0.5 rounded-full bg-ink"/>}
            {dropBelow && <div className="absolute -bottom-px inset-x-0 z-10 h-0.5 rounded-full bg-ink"/>}

            <div
                ref={gutterRef}
                className="absolute left-0 top-1 z-20 flex -translate-x-8 items-start opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100"
            >
                <button
                    {...attributes}
                    {...listeners}
                    onClick={() => setMenuOpen(v => !v)}
                    className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-ink-faint transition-colors duration-150 hover:bg-accent hover:text-ink-muted active:cursor-grabbing"
                    title="Drag to move, click for actions"
                    aria-label="Block actions"
                >
                    <GripVertical size={16}/>
                </button>

                {menuOpen && (
                    <div className="surface-pop absolute left-0 top-7 w-40 rounded-lg p-1">
                        <button
                            onClick={() => act(onDuplicate)}
                            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink transition-colors duration-150 hover:bg-accent"
                        >
                            <Copy size={15} className="text-ink-muted"/>
                            Duplicate
                        </button>
                        <button
                            onClick={() => act(onDelete)}
                            className="group/trash flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-destructive transition-colors duration-150 hover:bg-destructive/10"
                        >
                            <Trash2 size={15} className="group-hover/trash:[&>path:first-child]:animate-trash-lid"/>
                            Delete
                        </button>
                    </div>
                )}
            </div>

            <div className={`rounded-md px-2 py-0.5 transition-shadow duration-150 ${
                showBoundary ? "group-hover:shadow-[0_6px_10px_-10px_rgb(0_0_0/0.55)]" : ""
            }`}>
                {children}
            </div>
        </div>
    );
};
