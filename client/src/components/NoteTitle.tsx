import {useRef, useState} from "react";

interface NoteTitleProps {
    title: string;
    onRename: (title: string) => Promise<void>;
}

export function NoteTitle({title, onRename}: NoteTitleProps) {
    const [draft, setDraft] = useState<string | null>(null);
    // Escape and Enter both end the edit, and the blur that follows must not commit a second time.
    const settled = useRef(false);

    const startEditing = () => {
        settled.current = false;
        setDraft(title);
    };

    const commit = () => {
        if (settled.current || draft === null) return;
        settled.current = true;
        setDraft(null);
        const trimmed = draft.trim();
        if (trimmed && trimmed !== title) onRename(trimmed);
    };

    const cancel = () => {
        settled.current = true;
        setDraft(null);
    };

    if (draft === null) {
        return <h1 className="note-title" onClick={startEditing}>{title}</h1>;
    }

    return (
        <input
            className="note-title"
            aria-label="Note title"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
                if (e.key === "Enter") commit();
                else if (e.key === "Escape") cancel();
            }}
            onBlur={commit}
            autoFocus
        />
    );
}
