import {useEffect, useState} from "react";
import {useNoteContext} from "@/context/NoteContext";
import {NoteService} from "@/services/NoteService";
import type {Block, Note} from "@/types/Note.ts";
import {TextBlock} from "@/components/blocks/TextBlock.tsx";

async function createTextBlock(noteId: string, index: number): Promise<Block> {
    const blockRequest = {
        type: "text" as const,
        index,
        content: ""
    };

    return await NoteService.createBlock(noteId, blockRequest);
}

export function MainContentPanel() {
    const {selectedNoteId, noteTitle} = useNoteContext();
    const [note, setNote] = useState<Note | null>(null);
    const [loading, setLoading] = useState(false);

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

        // TODO: handle some cases where you cannot create a new block if the newest block is empty
        try {
            await createTextBlock(selectedNoteId, note.blocks.length);
            const updatedNote = await NoteService.getNote(selectedNoteId);
            setNote(updatedNote);
        } catch (err) {
            console.error("Failed to add text block:", err);
        }
    };

    if (!selectedNoteId) {
        return <div className="p-6 text-gray-500">No note selected</div>;
    }

    if (loading) {
        return <div className="p-6 text-gray-500">Loading note...</div>;
    }

    return (
        note && (
            <div className="p-6 space-y-4">
                <h1 className="text-xl font-semibold text-gray-800">{noteTitle}</h1>
                <button
                    className="px-4 py-2 bg-blue-500 text-white rounded"
                    onClick={handleAddTextBlock}
                >
                    Add Text Block
                </button>
                {note.blocks
                    .sort((a: Block, b: Block) => a.index - b.index)
                    .map((block: Block) => {
                        switch (block.type) {
                            case "text":
                                return <TextBlock block={block} key={block.id}/>;
                            case "image":
                                return <p key={block.id}>image</p>;
                            case "canvas":
                                return <p key={block.id}>canvas</p>;
                            default:
                                return (
                                    <div key={block.id} className="text-red-600">
                                        Unknown block type: {block.type}
                                    </div>
                                );
                        }
                    })}
            </div>
        )
    );
}
