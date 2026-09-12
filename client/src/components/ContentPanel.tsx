import {useEffect, useState, Fragment} from "react";
import {useNoteContext} from "@/context/NoteContext";
import {NoteService} from "@/services/NoteService";
import type {Block, Note} from "@/types/Note.ts";
import {TextBlock} from "@/components/blocks/block_types/Textblock/TextBlock.tsx";
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
import {InsertionPoint, type InsertKind} from "@/components/blocks/InsertionPoint.tsx";
import {DocumentTextIcon, RectangleGroupIcon} from '@heroicons/react/24/outline';
import {ExcalidrawBlock} from "@/components/blocks/block_types/ExcalidrawBlock.tsx";
import {CodeBlock} from "@/components/blocks/block_types/CodeBlock.tsx";
import {ImageBlock} from "@/components/blocks/block_types/ImageBlock.tsx";

async function createBlock(kind: InsertKind, noteId: string, index: number): Promise<Block> {
    return await NoteService.createBlock(noteId, {type: kind, index, content: ""});
}

export function MainContentPanel() {
    const {selectedNoteId, noteTitle, setNoteTitle} = useNoteContext();
    const [note, setNote] = useState<Note | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeBlock, setActiveBlock] = useState<Block | null>(null);
    const [editingTitle, setEditingTitle] = useState(false);
    const [localNoteTitle, setLocalNoteTitle] = useState(noteTitle);
    const [spawnedBlockId, setSpawnedBlockId] = useState<string | null>(null);

    const sensors = useSensors(
        // the drag handle is also the actions menu trigger, so a press that never moves must stay a click
        useSensor(PointerSensor, {activationConstraint: {distance: 4}}),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        if (activeBlock && note) {
            const updatedBlock = note.blocks.find(b => b.id === activeBlock.id);
            if (updatedBlock) {
                setActiveBlock({...updatedBlock});
            }
        }
    }, [note?.blocks]);

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

    const handleAddBlockAt = async (kind: InsertKind, index: number) => {
        if (!note || !selectedNoteId) return;
        try {
            const created = await createBlock(kind, selectedNoteId, index);
            setSpawnedBlockId(created.id);
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
            console.error(`Failed to add ${kind} block at index ${index}:`, err);
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

    const handleAddImageBlock = async (url: string, index: number) => {
        if (!note || !selectedNoteId) return;
        try {
            const created = await NoteService.createBlock(selectedNoteId, {
                type: "image",
                index,
                content: {url, strokes: []}
            });
            setSpawnedBlockId(created.id);

            const fetched = await NoteService.getNote(selectedNoteId);
            const others = fetched.blocks
                .filter(b => b.id !== created.id)
                .sort((a, b) => a.index - b.index);
            const at = Math.max(0, Math.min(index, others.length));
            const ordered = [...others.slice(0, at), created, ...others.slice(at)]
                .map((b, i) => ({...b, index: i}));

            await NoteService.updateNote({
                id: selectedNoteId,
                title: fetched.title,
                folder_id: fetched.folder_id,
                blocks: ordered
            });
            setNote({...fetched, blocks: ordered});
        } catch (err) {
            console.error("Failed to add image block:", err);
        }
    };

    const handleDuplicateBlock = async (blockId: string) => {
        if (!note || !selectedNoteId) return;
        const source = note.blocks.find(b => b.id === blockId);
        if (!source) return;

        try {
            const created = await NoteService.createBlock(selectedNoteId, {
                type: source.type,
                index: source.index + 1,
                content: source.content
            });
            setSpawnedBlockId(created.id);

            const fetched = await NoteService.getNote(selectedNoteId);
            const others = fetched.blocks
                .filter(b => b.id !== created.id)
                .sort((a, b) => a.index - b.index);
            const at = others.findIndex(b => b.id === blockId) + 1;
            const ordered = [...others.slice(0, at), created, ...others.slice(at)]
                .map((b, i) => ({...b, index: i}));

            await NoteService.updateNote({
                id: selectedNoteId,
                title: fetched.title,
                folder_id: fetched.folder_id,
                blocks: ordered
            });
            setNote({...fetched, blocks: ordered});
        } catch (err) {
            console.error("Failed to duplicate block:", err);
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
        return <div className="editor-col py-10 text-ink-muted">No note selected</div>;
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-rule border-t-ink-muted"></div>
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

    const titleClasses = "w-full bg-transparent text-[30px] font-semibold leading-tight tracking-[-0.022em] text-ink";

    return (
        note && noteTitle && (
            <div className="pb-2 pt-10">
                <div className="editor-col mb-0.5" onClick={() => !editingTitle && setEditingTitle(true)}>
                    {editingTitle ? (
                        <input
                            className={`${titleClasses} border-0 p-0 focus:outline-none`}
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
                        <h1 className={`${titleClasses} cursor-text`}>{noteTitle}</h1>
                    )}
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
                        <div className="flex w-full flex-col">
                            {sortedBlocks.length === 0 ? (
                                <div className="editor-col">
                                    <p className="mb-2 text-[15px] text-ink-faint">
                                        Start writing, or add a block below.
                                    </p>
                                    <InsertionPoint onAdd={(kind) => handleAddBlockAt(kind, 0)} persistent/>
                                </div>
                            ) : (
                                <div className="editor-col py-1.5">
                                    <InsertionPoint onAdd={(kind) => handleAddBlockAt(kind, 0)}/>
                                </div>
                            )}

                            {sortedBlocks.map((block: Block, i: number) => (
                                <Fragment key={block.id}>
                                    <div className="editor-col">
                                        <SortableBlock blockId={block.id} onDelete={handleDeleteBlock}
                                                       onDuplicate={handleDuplicateBlock}
                                                       showBoundary={block.type === "text"}>
                                            {block.type === "text" && (
                                                <TextBlock
                                                    block={block}
                                                    onSpawnCodeBlock={() => handleAddBlockAt("code", i + 1)}
                                                    onSpawnImageBlock={(url) => handleAddImageBlock(url, i + 1)}
                                                />
                                            )}
                                            {block.type === "code" && <CodeBlock block={block} autoFocus={block.id === spawnedBlockId}/>}
                                            {block.type === "canvas" && <ExcalidrawBlock block={block}/>}
                                            {block.type === "image" && <ImageBlock block={block}/>}
                                            {!["text", "canvas", "image", "code"].includes(block.type) && (
                                                <div className="text-destructive">
                                                    Unknown block type: {block.type}
                                                </div>
                                            )}
                                        </SortableBlock>
                                    </div>
                                    <div className="editor-col py-1.5">
                                        <InsertionPoint onAdd={(kind) => handleAddBlockAt(kind, i + 1)}/>
                                    </div>
                                </Fragment>
                            ))}

                            <div
                                className="h-[35vh] cursor-text"
                                onClick={() => handleAddBlockAt("text", sortedBlocks.length)}
                            />
                        </div>
                    </SortableContext>

                    <DragOverlay>
                        {activeBlock && (
                            <div className="surface-pop flex items-center gap-3 rounded-lg px-4 py-3">
                                {activeBlock.type === "text" && (
                                    <>
                                        <DocumentTextIcon className="h-5 w-5 flex-shrink-0 text-ink-muted"/>
                                        <div className="text-[13px] font-medium text-ink">Text block</div>
                                    </>
                                )}
                                {activeBlock.type === "canvas" && (
                                    <>
                                        <RectangleGroupIcon className="h-5 w-5 flex-shrink-0 text-ink-muted"/>
                                        <div className="text-[13px] font-medium text-ink">Canvas block</div>
                                    </>
                                )}
                            </div>
                        )}
                    </DragOverlay>
                </DndContext>
            </div>
        )
    );
}
