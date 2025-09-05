import {useEffect, useState, Fragment} from "react";
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
import {DocumentTextIcon, RectangleGroupIcon} from '@heroicons/react/24/outline';

async function createBlock(type: "text" | "canvas" | "image", noteId: string, index: number): Promise<Block> {
    const blockRequest = {
        type: type,
        index,
        content: ""
    };

    return await NoteService.createBlock(noteId, blockRequest);
}

function InsertionDivider({onAdd, visibleWithoutHover}: {
    onAdd: (type: "text" | "canvas" | "image") => void,
    visibleWithoutHover?: boolean
}) {
    return (
        <div className="relative group h-0">
            <div className="absolute inset-x-0 top-0 -translate-y-1/2 h-8 cursor-pointer"/>
            <div
                className={`absolute inset-x-0 top-0 -translate-y-1/2 border-t transition-colors duration-150 pointer-events-none ${
                    visibleWithoutHover
                        ? 'border-gray-200'
                        : 'border-transparent group-hover:border-gray-200'
                }`}
            />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <div className={`transition-opacity duration-150 ${
                    visibleWithoutHover
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                }`}>
                    <div className="flex gap-1">
                        <button
                            onClick={() => onAdd("text")}
                            className="px-2 py-1 border border-gray-300 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-700 shadow-sm inline-flex items-center gap-1"
                            title="Add text block"
                        >
                            <DocumentTextIcon className="h-4 w-4 text-gray-500"/>
                            Text
                        </button>
                        <button
                            onClick={() => onAdd("canvas")}
                            className="px-2 py-1 border border-gray-300 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-700 shadow-sm inline-flex items-center gap-1"
                            title="Add canvas block"
                        >
                            <RectangleGroupIcon className="h-4 w-4 text-gray-500"/>
                            Canvas
                        </button>
                        {/* TODO: vaulted until furhter work is done for this block type (plan is to merge with canvas potentially)*/}
                        {/*<button*/}
                        {/*    onClick={() => onAdd("image")}*/}
                        {/*    className="px-2 py-1 border border-gray-300 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-700 shadow-sm inline-flex items-center gap-1"*/}
                        {/*    title="Add image block"*/}
                        {/*>*/}
                        {/*    <PhotoIcon className="h-4 w-4 text-gray-500"/>*/}
                        {/*    Image*/}
                        {/*</button>*/}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function MainContentPanel() {
    const {selectedNoteId, noteTitle, setNoteTitle} = useNoteContext();
    const [note, setNote] = useState<Note | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeBlock, setActiveBlock] = useState<Block | null>(null);
    const [editingTitle, setEditingTitle] = useState(false);
    const [localNoteTitle, setLocalNoteTitle] = useState(noteTitle);

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

        fetchNote().then(
            () => {
                setLoading(false)
                setLocalNoteTitle(noteTitle);
            }
        );
    }, [selectedNoteId]);

    const handleAddBlockAt = async (type: "text" | "canvas" | "image", index: number) => {
        if (!note || !selectedNoteId) return;
        try {
            const created = await createBlock(type, selectedNoteId, index);
            const fetched = await NoteService.getNote(selectedNoteId);
            const blocksSorted = [...fetched.blocks].sort((a, b) => a.index - b.index);

            const newIdxCurrent = blocksSorted.findIndex(b => b.id === created.id);
            let withoutNew = blocksSorted;
            if (newIdxCurrent !== -1) {
                withoutNew = [
                    ...blocksSorted.slice(0, newIdxCurrent),
                    ...blocksSorted.slice(newIdxCurrent + 1)
                ];
            }
            const targetIndex = Math.max(0, Math.min(index, withoutNew.length));
            const reordered = [
                ...withoutNew.slice(0, targetIndex),
                blocksSorted[newIdxCurrent !== -1 ? newIdxCurrent : blocksSorted.length - 1],
                ...withoutNew.slice(targetIndex)
            ];
            const blocksWithNewIndices: Block[] = reordered.map((b, i) => ({...b, index: i}));

            await NoteService.updateNote({
                id: selectedNoteId,
                title: fetched.title,
                folder_id: fetched.folder_id,
                blocks: blocksWithNewIndices
            });

            setNote({...fetched, blocks: blocksWithNewIndices});
        } catch (err) {
            console.error(`Failed to add ${type} block at index ${index}:`, err);
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
        return (
            <div className="flex justify-center items-center p-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    const sortedBlocks = note?.blocks ? [...note.blocks].sort((a, b) => a.index - b.index) : [];

    const tryUpdateTitle = async (newTitle: string) => {
        if (!selectedNoteId) return;
        try {
            const trimmed = newTitle.trim();
            if (trimmed && trimmed !== noteTitle) {
                await NoteService.updateNote({
                    id: selectedNoteId,
                    title: trimmed,
                    folder_id: note?.folder_id,
                    blocks: note?.blocks
                });
                setEditingTitle(false);
                setNoteTitle(trimmed);
                setLocalNoteTitle(trimmed);
            }
        } catch (err) {
            console.error("Failed to update note title:", err);
            setLocalNoteTitle(noteTitle);
        }
    }

    return (
        note && noteTitle && (
            <div className="p-6 space-y-4">
                <div className="flex justify-center pb-2">
                    <div className="w-full max-w-3xl text-left" onClick={() => !editingTitle && setEditingTitle(true)}>
                        {editingTitle ? (
                            <input
                                className="text-xl font-semibold text-gray-800 bg-white focus:outline-none px-4 py-2 border-2 border-gray-200 w-full"
                                style={{boxShadow: "0 2px 8px rgba(0,0,0,0.06)", background: "#fff"}}
                                value={localNoteTitle !== null ? localNoteTitle : noteTitle}
                                onChange={e => setLocalNoteTitle(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === "Enter") {
                                        tryUpdateTitle(localNoteTitle ? localNoteTitle : "");
                                    }
                                }}
                                onBlur={() => {
                                    setEditingTitle(false)
                                }}
                                autoFocus
                            />
                        ) : (
                            <h1 className="text-xl font-semibold text-gray-800">{noteTitle}</h1>
                        )}
                    </div>
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
                            {sortedBlocks.length === 0 && (
                                <>
                                    <div className="flex flex-col items-center pb-4">
                                        <p className="text-center text-gray-500 mb-4">Begin your note by adding your
                                            first
                                            block below.</p>
                                    </div>
                                    <InsertionDivider onAdd={(type) => handleAddBlockAt(type, 0)}
                                                      visibleWithoutHover={true}/>
                                </>

                            )}
                            {sortedBlocks.map((block: Block, i: number) => (
                                <Fragment key={block.id}>
                                    {(() => {
                                        switch (block.type) {
                                            case "text":
                                                return (
                                                    <div className="flex justify-center">
                                                        <SortableBlock blockId={block.id} onDelete={handleDeleteBlock}>
                                                            <TextBlock block={block}/>
                                                        </SortableBlock>
                                                    </div>
                                                );
                                            case "image":
                                                return <p>image</p>;
                                            case "canvas":
                                                return (
                                                    <div className="flex justify-center">
                                                        <SortableBlock blockId={block.id} onDelete={handleDeleteBlock}>
                                                            <CanvasBlock block={block}/>
                                                        </SortableBlock>
                                                    </div>
                                                );
                                            default:
                                                return (
                                                    <div className="text-red-600">
                                                        Unknown block type: {block.type}
                                                    </div>
                                                );
                                        }
                                    })()}
                                    <InsertionDivider onAdd={(type) => handleAddBlockAt(type, i + 1)}/>
                                </Fragment>
                            ))}
                            <div className="h-[40vh]"/>
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