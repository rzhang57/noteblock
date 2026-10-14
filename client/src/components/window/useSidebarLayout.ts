import {useCallback, useEffect, useRef, useState, type MouseEvent} from "react";

const MIN_WIDTH = 180;
const DEFAULT_WIDTH = 252;
const MAX_WIDTH = 600;
const COLLAPSE_THRESHOLD = 140;
const WIDTH_KEY = "sidebarWidth";

function storedWidth(): number {
    const parsed = parseInt(localStorage.getItem(WIDTH_KEY) ?? "");
    if (isNaN(parsed)) return DEFAULT_WIDTH;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parsed));
}

// Canvas blocks re-measure on this event; the grid animates, so it fires once the column settles.
function announceLayoutChange() {
    setTimeout(() => window.dispatchEvent(new CustomEvent("sidebarToggle")), 0);
}

export function useSidebarLayout() {
    const [open, setOpen] = useState(true);
    const [width, setWidth] = useState(storedWidth);
    const [resizing, setResizing] = useState(false);
    const widthRef = useRef(width);

    const openRef = useRef(open);

    useEffect(() => {
        widthRef.current = width;
        openRef.current = open;
    }, [width, open]);

    const reveal = useCallback(() => {
        if (openRef.current) return;
        setOpen(true);
        announceLayoutChange();
    }, []);

    const toggle = useCallback(() => {
        setOpen(isOpen => !isOpen);
        announceLayoutChange();
    }, []);

    const startResize = useCallback((e: MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const restoreWidth = widthRef.current;
        const startWidth = openRef.current ? restoreWidth : 0;
        const draggedWidth = (x: number) => startWidth + x - startX;
        setResizing(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const onMouseMove = (move: globalThis.MouseEvent) => {
            const dragged = draggedWidth(move.clientX);
            openRef.current = dragged >= COLLAPSE_THRESHOLD;
            widthRef.current = openRef.current ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, dragged)) : restoreWidth;
            setOpen(openRef.current);
            setWidth(widthRef.current);
        };

        const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            setResizing(false);
            if (openRef.current) localStorage.setItem(WIDTH_KEY, String(widthRef.current));
            announceLayoutChange();
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }, []);

    return {open, width, resizing, toggle, reveal, startResize};
}
