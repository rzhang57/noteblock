export function NoteEmptyState({onNewNote}: {onNewNote: () => void}) {
    return (
        <div className="empty-reader">
            <h1>Noteblock</h1>
            <p>Open a note from the sidebar, or start a new one.</p>
            <button type="button" className="push-button" onClick={onNewNote}>
                New Note…
            </button>
        </div>
    );
}
