import type {ReactNode} from "react";
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';

interface SortableBlockProps {
    blockId: string;
    children: ReactNode;
}

export const SortableBlock = ({blockId, children}: SortableBlockProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        isDragging,
    } = useSortable({id: blockId});

    const style = {
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? 'none' : (transform ? 'transform 200ms ease' : undefined),
        opacity: isDragging ? 0 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="group relative"
        >
            <div
                {...attributes}
                {...listeners}
                className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-8
                         opacity-0 group-hover:opacity-100 transition-opacity duration-200
                         cursor-grab active:cursor-grabbing p-1 rounded bg-gray-200 hover:bg-gray-300
                         flex items-center justify-center"
                style={{width: '20px', height: '20px'}}
            >
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="text-gray-600"
                >
                    <circle cx="3" cy="3" r="1" fill="currentColor"/>
                    <circle cx="9" cy="3" r="1" fill="currentColor"/>
                    <circle cx="3" cy="9" r="1" fill="currentColor"/>
                    <circle cx="9" cy="9" r="1" fill="currentColor"/>
                </svg>
            </div>

            {children}
        </div>
    );
};