import {useEffect, useRef, useState} from "react";
import {useNoteContext} from "@/context/NoteContext";
import {NoteService} from "@/services/NoteService";
import type {Block, Note} from "@/types/Note.ts";
import {TextBlock} from "@/components/blocks/block_types/TextBlock.tsx";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent, DragOverlay, type DragStartEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {SortableBlock} from "@/components/blocks/SortableBlock.tsx";
import {CanvasBlock} from "@/components/blocks/block_types/CanvasBlock.tsx";
import {ChevronDownIcon, DocumentTextIcon, PhotoIcon, RectangleGroupIcon} from '@heroicons/react/24/outline';

async function createBlock(type: "text" | "canvas" | "image", noteId: string, index: number): Promise<Block> {
    const blockRequest = {
        type: type,
        index,
        content: ""
    };

    return await NoteService.createBlock(noteId, blockRequest);
}

export function MainContentPanel() {
    const {selectedNoteId, noteTitle} = useNoteContext();
    const [note, setNote] = useState<Note | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeBlock, setActiveBlock] = useState<Block | null>(null);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        setLoading(true);
        if (!selectedNoteId) {
            setNote(null);
            return;
        }

        const fetchNote = async () => {
            try {
                const fetched = await NoteService.getNote(selectedNoteId);
                setNote(fetched);
            } catch (err) {
                console.error("Failed to load note:", err);
                setNote(null);
            } finally {
                setLoading(false);
            }
        };

        fetchNote();
    }, [selectedNoteId]);

    const getDropdownPosition = (): 'up' | 'down' => {
        if (!dropdownRef.current) return 'down';

        const rect = dropdownRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const dropdownHeight = 200; // Approximate height of dropdown

        return spaceBelow >= dropdownHeight ? 'down' : 'up';
    };

    const handleToggleMenu = () => {
        setShowAddMenu(!showAddMenu);
    };

    const handleAddBlock = async (type: "text" | "canvas" | "image") => {
        if (!note || !selectedNoteId) return;

        try {
            await createBlock(type, selectedNoteId, note.blocks.length);
            const updatedNote = await NoteService.getNote(selectedNoteId);
            setNote(updatedNote);
            setShowAddMenu(false);
        } catch (err) {
            console.error(`Failed to add ${type} block:`, err);
        }
    };

    const handleDeleteBlock = async (blockId: string) => {
        if (!selectedNoteId) return;

        try {
            await NoteService.deleteBlock(selectedNoteId, blockId);
            const updatedNote = await NoteService.getNote(selectedNoteId);
            setNote(updatedNote);
        } catch (error) {
            console.error('Error deleting block:', error);
        }
    };

    const handleDragStart = (event: DragStartEvent) => {
        const {active} = event;
        const block = note?.blocks.find(b => b.id === active.id) || null;
        setActiveBlock(block);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const {active, over} = event;
        setActiveBlock(null);

        if (!over || !note || !selectedNoteId) return;

        if (active.id !== over.id) {
            const sortedBlocks = [...note.blocks].sort((a, b) => a.index - b.index);

            const oldIndex = sortedBlocks.findIndex(block => block.id === active.id);
            const newIndex = sortedBlocks.findIndex(block => block.id === over.id);

            const reorderedBlocks = arrayMove(sortedBlocks, oldIndex, newIndex);

            const blocksWithNewIndices = reorderedBlocks.map((block, index) => ({
                ...block,
                index: index
            }));

            setNote(prev => prev ? {
                ...prev,
                blocks: blocksWithNewIndices
            } : null);

            try {
                await NoteService.updateNote({
                    id: selectedNoteId,
                    title: note.title,
                    folder_id: note.folder_id,
                    blocks: blocksWithNewIndices
                });
            } catch (err) {
                console.error("Failed to reorder blocks:", err);
                const updatedNote = await NoteService.getNote(selectedNoteId);
                setNote(updatedNote);
            }
        }
    };

    if (!selectedNoteId) {
        return <div className="p-6 text-gray-500">No note selected</div>;
    }

    if (loading) {
        return <div className="p-6 text-gray-500">Loading note...</div>;
    }

    const sortedBlocks = note?.blocks ? [...note.blocks].sort((a, b) => a.index - b.index) : [];

    return (
        note && (
            <div className="p-6 space-y-4">
                <div className="flex justify-center">
                    <h1 className="text-xl font-semibold text-gray-800">{noteTitle}</h1>
                </div>

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    onDragStart={handleDragStart}
                >
                    <SortableContext
                        items={sortedBlocks.map(block => block.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="space-y-2 flex flex-col w-full">
                            {sortedBlocks.map((block: Block) => {
                                switch (block.type) {
                                    case "text":
                                        return (
                                            <div key={block.id} className="flex justify-center">
                                                <SortableBlock blockId={block.id} onDelete={handleDeleteBlock}>
                                                    <TextBlock key={block.id} block={block}/>
                                                </SortableBlock>
                                            </div>
                                        );
                                    case "image":
                                        return <p key={block.id}>image</p>;
                                    case "canvas":
                                        return (
                                            <div key={block.id} className="flex justify-center">
                                                <SortableBlock blockId={block.id} onDelete={handleDeleteBlock}>
                                                    <CanvasBlock key={block.id} block={block}/>
                                                </SortableBlock>
                                            </div>
                                        );
                                    default:
                                        return (
                                            <div key={block.id} className="text-red-600">
                                                Unknown block type: {block.type}
                                            </div>
                                        );
                                }
                            })}
                        </div>
                    </SortableContext>

                    <DragOverlay>
                        {activeBlock?.type === "text" && <TextBlock block={activeBlock}/>}
                        {activeBlock?.type === "canvas" && <CanvasBlock block={activeBlock}/>}
                    </DragOverlay>
                </DndContext>

                <div className="flex justify-center mt-8">
                    <div className="relative" ref={dropdownRef}>
                        <button
                            className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            onClick={handleToggleMenu}
                        >
                            <span>Add Block</span>
                            <ChevronDownIcon className="ml-2 h-4 w-4"/>
                        </button>

                        {showAddMenu && (
                            <>
                                <div
                                    className={`absolute w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10 ${
                                        getDropdownPosition() === 'up'
                                            ? 'bottom-full mb-2'
                                            : 'top-full mt-2'
                                    }`}>
                                    <div className="py-1">
                                        <button
                                            className="flex items-center w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors duration-150"
                                            onClick={() => handleAddBlock("text")}
                                        >
                                            <DocumentTextIcon className="h-5 w-5 mr-3 text-gray-500"/>
                                            <div>
                                                <div className="font-medium">Text Block</div>
                                                <div className="text-sm text-gray-500">Add formatted text content</div>
                                            </div>
                                        </button>

                                        <button
                                            className="flex items-center w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors duration-150"
                                            onClick={() => handleAddBlock("canvas")}
                                        >
                                            <RectangleGroupIcon className="h-5 w-5 mr-3 text-gray-500"/>
                                            <div>
                                                <div className="font-medium">Canvas Block</div>
                                                <div className="text-sm text-gray-500">Add drawing or diagram</div>
                                            </div>
                                        </button>

                                        <button
                                            className="flex items-center w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors duration-150"
                                            onClick={() => handleAddBlock("image")}
                                        >
                                            <PhotoIcon className="h-5 w-5 mr-3 text-gray-500"/>
                                            <div>
                                                <div className="font-medium">Image Block</div>
                                                <div className="text-sm text-gray-500">Upload or embed images</div>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                <div
                                    className="fixed inset-0 z-0"
                                    onClick={() => setShowAddMenu(false)}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>
        )
    );
}