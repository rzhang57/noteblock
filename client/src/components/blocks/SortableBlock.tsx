import type {ReactNode} from "react";
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';

interface SortableBlockProps {
    blockId: string;
    children: ReactNode;
    onDelete: (blockId: string) => void;
}

export const SortableBlock = ({blockId, children, onDelete}: SortableBlockProps) => {
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

    const handleDelete = () => {
        onDelete(blockId);
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="group relative border border-gray-300"
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

            <button
                onClick={handleDelete}
                className="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-8
                         opacity-0 group-hover:opacity-100 transition-opacity duration-200
                         cursor-pointer p-1 rounded bg-red-200 hover:bg-red-300
                         flex items-center justify-center"
                style={{width: '20px', height: '20px'}}
                title="Delete block"
            >
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="text-red-600"
                >
                    <path
                        d="M9 3L3 9M3 3l6 6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>

            {children}
        </div>
    );
};