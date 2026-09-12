export function NoteEmptyState() {
    return (
        <div className="flex h-full flex-col items-center justify-center px-8">
            <h2 className="mb-2 text-[15px] font-medium tracking-tight text-ink">
                Nothing open
            </h2>
            <p className="max-w-[22rem] text-center text-[13px] leading-relaxed text-ink-muted">
                Choose a note from the sidebar, or create one to start writing.
            </p>
        </div>
    );
}
