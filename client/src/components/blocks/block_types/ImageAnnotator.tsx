import {useCallback, useEffect, useRef, useState} from "react";
import {X, Undo2, Pen} from "lucide-react";
import type {Stroke} from "@/types/Note.ts";

const PEN_COLORS = ["#e0452c", "#f0a202", "#2f9e44", "#1c7ed6", "#7048e8", "#1a1a1a"];
const PEN_WIDTHS = [3, 6, 11];

function strokePath(stroke: Stroke, w: number, h: number): string {
    return stroke.points.map(([x, y]) => `${(x * w).toFixed(2)},${(y * h).toFixed(2)}`).join(" ");
}

interface ImageAnnotatorProps {
    url: string;
    strokes: Stroke[];
    onSave: (strokes: Stroke[]) => void;
    onClose: () => void;
}

export function ImageAnnotator({url, strokes, onSave, onClose}: ImageAnnotatorProps) {
    const [draft, setDraft] = useState<Stroke[]>(strokes);
    const [active, setActive] = useState<Stroke | null>(null);
    const [color, setColor] = useState(PEN_COLORS[0]);
    const [width, setWidth] = useState(PEN_WIDTHS[1]);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState({w: 0, h: 0});

    useEffect(() => {
        const el = surfaceRef.current;
        if (!el) return;
        const measure = () => setBox({w: el.clientWidth, h: el.clientHeight});
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        measure();
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                setDraft(prev => prev.slice(0, -1));
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const pointAt = useCallback((e: React.PointerEvent): [number, number] => {
        const rect = surfaceRef.current!.getBoundingClientRect();
        return [
            Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
            Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
        ];
    }, []);

    const onPointerDown = (e: React.PointerEvent) => {
        // capture throws for pointers the browser never registered; the stroke still works without it
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            /* empty */
        }
        setActive({color, width, points: [pointAt(e)]});
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!active) return;
        const next = pointAt(e);
        setActive(prev => prev ? {...prev, points: [...prev.points, next]} : prev);
    };

    const endStroke = () => {
        if (!active) return;
        if (active.points.length > 1) setDraft(prev => [...prev, active]);
        setActive(null);
    };

    const rendered = active ? [...draft, active] : draft;

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink/80 backdrop-blur-sm">
            <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2 text-[13px] font-medium text-paper">
                    <Pen size={15}/>
                    Annotate
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setDraft(prev => prev.slice(0, -1))}
                        disabled={draft.length === 0}
                        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] text-paper/80 transition-colors duration-150 hover:bg-paper/15 disabled:opacity-35"
                        title="Undo last stroke"
                    >
                        <Undo2 size={14}/>
                        Undo
                    </button>
                    <button
                        onClick={() => onSave(draft)}
                        className="rounded-md bg-paper px-3 py-1.5 text-[12px] font-medium text-ink transition-opacity duration-150 hover:opacity-90"
                    >
                        Done
                    </button>
                    <button
                        onClick={onClose}
                        className="rounded-md p-1.5 text-paper/80 transition-colors duration-150 hover:bg-paper/15"
                        aria-label="Close without saving"
                    >
                        <X size={16}/>
                    </button>
                </div>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-4">
                <div ref={surfaceRef} className="relative max-h-full max-w-full touch-none select-none">
                    <img src={url} alt="" className="block max-h-[75vh] max-w-full object-contain"/>
                    <svg
                        className="absolute inset-0 h-full w-full cursor-crosshair"
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={endStroke}
                        onPointerCancel={endStroke}
                    >
                        {rendered.map((s, i) => (
                            <polyline
                                key={i}
                                points={strokePath(s, box.w, box.h)}
                                fill="none"
                                stroke={s.color}
                                strokeWidth={s.width}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        ))}
                    </svg>
                </div>
            </div>

            <div className="flex items-center justify-center gap-4 pb-6">
                <div className="surface-pop flex items-center gap-1.5 rounded-full px-2.5 py-2">
                    {PEN_COLORS.map(c => (
                        <button
                            key={c}
                            onClick={() => setColor(c)}
                            className={`h-5 w-5 rounded-full transition-transform duration-150 ${
                                color === c ? "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-popover" : "hover:scale-105"
                            }`}
                            style={{background: c}}
                            aria-label={`Pen colour ${c}`}
                        />
                    ))}
                </div>
                <div className="surface-pop flex items-center gap-1 rounded-full px-2.5 py-2">
                    {PEN_WIDTHS.map(w => (
                        <button
                            key={w}
                            onClick={() => setWidth(w)}
                            className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-150 ${
                                width === w ? "bg-accent" : "hover:bg-accent/60"
                            }`}
                            aria-label={`Pen width ${w}`}
                        >
                            <span className="rounded-full bg-ink" style={{width: w, height: w}}/>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
