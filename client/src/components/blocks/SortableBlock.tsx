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
        height: isDragging ? '60px' : 'auto',
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
                className="absolute left-0 top-4 transform -translate-x-12
     opacity-0 group-hover:opacity-100 transition-opacity duration-200
     cursor-grab active:cursor-grabbing p-1 bg-gray-200 hover:bg-gray-300
     flex items-center justify-center"
                style={{width: '26px', height: '26px'}}
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
                className="absolute right-0 top-4 transform translate-x-12
         opacity-0 group-hover:opacity-100 transition-opacity duration-200
         cursor-pointer p-1 bg-red-100 hover:bg-red-300
         flex items-center justify-center"
                style={{width: '26px', height: '26px'}}
                title="Delete block"
            >
                <span className="relative w-full h-full flex items-center justify-center group/trash">
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        className="text-red-600"
                    >
                        <g>
                            <rect x="6" y="9" width="12" height="10" rx="2" fill="currentColor" opacity="0.2"/>
                            <rect x="6" y="9" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                            <rect
                                x="9"
                                y="3"
                                width="6"
                                height="3"
                                rx="1"
                                fill="currentColor"
                                className="transition-transform duration-200 origin-bottom group-hover/trash:-translate-y-1"
                            />
                            <rect
                                x="5"
                                y="6"
                                width="14"
                                height="2"
                                rx="1"
                                fill="currentColor"
                            />
                        </g>
                    </svg>
                </span>
            </button>

            {children}
        </div>
    );
};