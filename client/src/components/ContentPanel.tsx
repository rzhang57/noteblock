import {useEffect, useState} from "react";
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

    const handleAddTextBlock = async () => {
        if (!note || !selectedNoteId) return;

        try {
            await createBlock("text", selectedNoteId, note.blocks.length);
            const updatedNote = await NoteService.getNote(selectedNoteId);
            setNote(updatedNote);
        } catch (err) {
            console.error("Failed to add text block:", err);
        }
    };

    const handleAddCanvasBlock = async () => {
        if (!note || !selectedNoteId) return;

        try {
            await createBlock("canvas", selectedNoteId, note.blocks.length);
            const updatedNote = await NoteService.getNote(selectedNoteId);
            setNote(updatedNote);
        } catch (err) {
            console.error("Failed to add text block:", err);
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
                <h1 className="text-xl font-semibold text-gray-800">{noteTitle}</h1>
                <button
                    className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
                    onClick={handleAddTextBlock}
                >
                    Add Text Block
                </button>
                <button
                    className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
                    onClick={handleAddCanvasBlock}
                >
                    Add Canvas Block
                </button>

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
                                            <SortableBlock blockId={block.id} onDelete={handleDeleteBlock}>
                                                <TextBlock key={block.id} block={block}/>
                                            </SortableBlock>
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
            </div>
        )
    );
}