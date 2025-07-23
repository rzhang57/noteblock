import {useEffect, useState} from "react";
import {useNoteContext} from "@/context/NoteContext";
import {NoteService} from "@/services/NoteService";
import type {Block, Note} from "@/types/Note.ts";

export function MainContentPanel() {
    const {selectedNoteId} = useNoteContext();
    const [note, setNote] = useState<Note | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!selectedNoteId) {
            setNote(null);
            return;
        }

        const fetchNote = async () => {
            setLoading(true);
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

    if (!selectedNoteId) {
        return <div className="p-6 text-gray-500">No note selected</div>;
    }

    if (loading) {
        return <div className="p-6 text-gray-500">Loading note...</div>;
    }

    if (!loading && !note) {
        return <div className="p-6 text-red-500">Note not found</div>;
    }

    return (
        note && (<div className="p-6 space-y-4">
            <h1 className="text-xl font-semibold text-gray-800">{note.title}</h1>
            {note.blocks
                .sort((a: Block, b: Block) => a.index - b.index)
                .map((block: Block) => {
                    switch (block.type) {
                        case "text":
                            return <p>text</p>;
                        case "image":
                            return <p>image</p>;
                        case "canvas":
                            return <p>canvas</p>;
                        default:
                            return (
                                <div key={block.id} className="text-red-600">
                                    Unknown block type: {block.type}
                                </div>
                            );
                    }
                })}
        </div>)
    );
}
