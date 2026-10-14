interface SidebarToggleProps {
    open: boolean;
    onToggle: () => void;
}

export function SidebarToggle({open, onToggle}: SidebarToggleProps) {
    return (
        <button
            type="button"
            className="toolbar-button sidebar-toggle"
            aria-label={open ? "Hide sidebar" : "Show sidebar"}
            aria-pressed={open}
            onClick={onToggle}
        >
            <svg viewBox="0 0 20 16" width="18" height="15" aria-hidden>
                <rect x="1" y="1" width="18" height="14" rx="3" fill="none" stroke="currentColor"/>
                <line x1="7" y1="1.5" x2="7" y2="14.5" stroke="currentColor"/>
            </svg>
        </button>
    );
}
