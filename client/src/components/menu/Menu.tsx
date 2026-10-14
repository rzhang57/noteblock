import {useEffect, useRef, type CSSProperties, type ReactNode, type RefObject} from "react";

export interface MenuEntry {
    label: string;
    icon: ReactNode;
    onSelect: () => void;
    destructive?: boolean;
    separatorBefore?: boolean;
}

interface MenuProps {
    entries: MenuEntry[];
    onClose: () => void;
    // Presses on the trigger are left to it, so clicking it again closes rather than reopens.
    triggerRef?: RefObject<HTMLElement | null>;
    className?: string;
    style?: CSSProperties;
}

export function Menu({entries, onClose, triggerRef, className, style}: MenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        menuRef.current?.querySelector<HTMLButtonElement>(".menu-item")?.focus({preventScroll: true});
    }, []);

    useEffect(() => {
        const onClose = () => onCloseRef.current();
        const onPointerDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (menuRef.current?.contains(target) || triggerRef?.current?.contains(target)) return;
            onClose();
        };
        const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        const onScroll = (e: Event) => !menuRef.current?.contains(e.target as Node) && onClose();
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("scroll", onScroll, true);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("scroll", onScroll, true);
        };
    }, [triggerRef]);

    return (
        <div
            ref={menuRef}
            role="menu"
            className={className ? `menu ${className}` : "menu"}
            style={style}
            onClick={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
        >
            {entries.map(entry => (
                <div key={entry.label}>
                    {entry.separatorBefore && <hr className="menu-separator"/>}
                    <button
                        type="button"
                        role="menuitem"
                        className="menu-item"
                        data-tone={entry.destructive ? "destructive" : undefined}
                        onClick={() => {
                            onClose();
                            entry.onSelect();
                        }}
                    >
                        {entry.icon}
                        {entry.label}
                    </button>
                </div>
            ))}
        </div>
    );
}
