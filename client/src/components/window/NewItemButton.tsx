import {useCallback, useRef, useState} from "react";
import {FilePlus, FolderPlus} from "lucide-react";
import {Menu} from "@/components/menu/Menu.tsx";
import type {NewItemKind} from "./createItem.ts";

export function NewItemButton({onCreate}: {onCreate: (kind: NewItemKind) => void}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const close = useCallback(() => setMenuOpen(false), []);

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                className="toolbar-button new-item-button"
                aria-label="New note or folder"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title="New Note (⌘N)"
                onClick={() => setMenuOpen(isOpen => !isOpen)}
            >
                <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden>
                    <path
                        d="M8.5 2.5H4.5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-4"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                    />
                    <path
                        d="M13.6 1.9a1.3 1.3 0 0 1 1.9 1.9L9.2 10.1l-2.6.7.7-2.6z"
                        fill="none"
                        stroke="currentColor"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>
            {menuOpen && (
                <Menu
                    className="new-item-menu"
                    triggerRef={buttonRef}
                    onClose={close}
                    entries={[
                        {label: "New Note", icon: <FilePlus/>, onSelect: () => onCreate("note")},
                        {label: "New Folder", icon: <FolderPlus/>, onSelect: () => onCreate("folder")},
                    ]}
                />
            )}
        </>
    );
}
