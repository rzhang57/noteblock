import type {ReactNode} from "react";
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {GripVertical, Trash2} from 'lucide-react';

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
                className="absolute left-0 top-4 transform -translate-x-8
     opacity-0 group-hover:opacity-100 transition-opacity duration-200
     cursor-grab active:cursor-grabbing p-1 bg-gray-200 hover:bg-gray-300
     flex items-center justify-center"
                style={{width: '26px', height: '26px'}}
            >
                <GripVertical size={16} className="text-gray-600"/>
            </div>

            <button
                onClick={handleDelete}
                className="absolute right-0 top-4 transform translate-x-8
         opacity-0 group-hover:opacity-100 transition-opacity duration-200
         cursor-pointer p-1 bg-red-100 hover:bg-red-300
         flex items-center justify-center group/trash"
                style={{width: '26px', height: '26px'}}
                title="Delete block"
            >
                <Trash2 size={16} className="text-red-600 group-hover/trash:[&>path:first-child]:animate-trash-lid"/>
            </button>

            {children}
        </div>
    );
};