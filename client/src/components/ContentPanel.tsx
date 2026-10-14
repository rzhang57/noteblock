import {useEffect, useState, Fragment, type ReactNode} from "react";
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
import {Code2, Image as ImageIcon, PenTool, Type} from "lucide-react";
import {ExcalidrawBlock} from "@/components/blocks/block_types/ExcalidrawBlock.tsx";
import {CodeBlock} from "@/components/blocks/block_types/CodeBlock.tsx";
import {ImageBlock} from "@/components/blocks/block_types/ImageBlock.tsx";

const BLOCK_PREVIEW: Record<string, {label: string; icon: ReactNode}> = {
    text: {label: "Text", icon: <Type/>},
    canvas: {label: "Canvas", icon: <PenTool/>},
    code: {label: "Code", icon: <Code2/>},
    image: {label: "Image", icon: <ImageIcon/>},
};

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

    if (!selectedNoteId) return null;

    if (loading) {
        return (
            <div className="empty-reader">
                <div className="spinner" aria-label="Loading"/>
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

    const blockCount = `${sortedBlocks.length} ${sortedBlocks.length === 1 ? "block" : "blocks"}`;

    return (
        note && noteTitle && (
            <div className="reader-content">
                <article className="note-page page-column">
                    <header className="note-header" onClick={() => !editingTitle && setEditingTitle(true)}>
                        {editingTitle ? (
                            <input
                                className="note-title"
                                aria-label="Note title"
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
                            <h1 className="note-title">{noteTitle}</h1>
                        )}
                        <p className="note-meta">{blockCount}</p>
                    </header>

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
                            {sortedBlocks.length === 0 ? (
                                <>
                                    <p className="note-hint">Start writing, or add a block below.</p>
                                    <InsertionPoint onAdd={(kind) => handleAddBlockAt(kind, 0)} persistent/>
                                </>
                            ) : (
                                <InsertionPoint onAdd={(kind) => handleAddBlockAt(kind, 0)}/>
                            )}

                            {sortedBlocks.map((block: Block, i: number) => (
                                <Fragment key={block.id}>
                                    <div className={block.type === "canvas" ? "page-breakout" : undefined}>
                                        <SortableBlock blockId={block.id} onDelete={handleDeleteBlock}
                                                       onDuplicate={handleDuplicateBlock}>
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
                                                <p className="image-missing">Unknown block type: {block.type}</p>
                                            )}
                                        </SortableBlock>
                                    </div>
                                    <InsertionPoint onAdd={(kind) => handleAddBlockAt(kind, i + 1)}/>
                                </Fragment>
                            ))}

                            <div className="note-tail" onClick={() => handleAddBlockAt("text", sortedBlocks.length)}/>
                        </SortableContext>

                        <DragOverlay>
                            {activeBlock && (
                                <div className="block-drag-preview">
                                    {BLOCK_PREVIEW[activeBlock.type]?.icon}
                                    {BLOCK_PREVIEW[activeBlock.type]?.label ?? "Block"}
                                </div>
                            )}
                        </DragOverlay>
                    </DndContext>
                </article>
            </div>
        )
    );
}
