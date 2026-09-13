import {useCallback, useEffect, useRef, useState} from "react";
import {X, Undo2, Pen, Maximize2} from "lucide-react";
import type {Stroke} from "@/types/Note.ts";
import {loadPen, PEN_COLORS, PEN_WIDTHS, savePen, type PenSettings} from "./penSettings.ts";
import {anchoredScroll, fitZoom, stepZoom, wheelZoom} from "./zoom.ts";

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
    const [pen, setPen] = useState<PenSettings>(loadPen);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const [box, setBox] = useState({w: 0, h: 0});
    const [natural, setNatural] = useState({w: 0, h: 0});
    const [zoom, setZoom] = useState(1);
    const zoomRef = useRef(1);

    // Derived rather than observed: a ResizeObserver reports the previous size for the render
    // that changes it, which lands strokes at the wrong place for a frame after every zoom.
    const canvas = natural.w > 0 ? {w: natural.w * zoom, h: natural.h * zoom} : box;

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
        savePen(pen);
    }, [pen]);

    useEffect(() => {
        zoomRef.current = zoom;
    }, [zoom]);

    // An onLoad prop misses a cached or data-url image, which has already finished loading by
    // the time React attaches the handler — the size then never arrives and fit never happens.
    useEffect(() => {
        const el = imgRef.current;
        if (!el) return;

        const read = () => setNatural({w: el.naturalWidth, h: el.naturalHeight});
        if (el.complete && el.naturalWidth > 0) read();

        el.addEventListener("load", read);
        return () => el.removeEventListener("load", read);
    }, [url]);

    const applyFit = useCallback(() => {
        const viewport = viewportRef.current;
        if (!viewport || natural.w === 0) return;

        setZoom(fitZoom(natural, {w: viewport.clientWidth, h: viewport.clientHeight}));
    }, [natural]);

    useEffect(applyFit, [applyFit]);

    // Ctrl+wheel is also how a trackpad pinch arrives. Without preventDefault the browser
    // zooms the whole document underneath the overlay.
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();

            const current = zoomRef.current;
            const next = wheelZoom(current, e.deltaY);
            if (next === current) return;

            const rect = viewport.getBoundingClientRect();
            const {left, top} = anchoredScroll({
                scrollLeft: viewport.scrollLeft,
                scrollTop: viewport.scrollTop,
                pointerX: e.clientX - rect.left,
                pointerY: e.clientY - rect.top,
            }, current, next);

            zoomRef.current = next;
            setZoom(next);
            requestAnimationFrame(() => viewport.scrollTo(left, top));
        };

        viewport.addEventListener("wheel", onWheel, {passive: false});
        return () => viewport.removeEventListener("wheel", onWheel);
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();

            const chord = e.ctrlKey || e.metaKey;
            if (chord && e.key.toLowerCase() === "z") {
                e.preventDefault();
                setDraft(prev => prev.slice(0, -1));
            }
            // Claimed only while the overlay is mounted, so page zoom is untouched elsewhere.
            if (chord && (e.key === "=" || e.key === "+")) {
                e.preventDefault();
                setZoom(current => stepZoom(current, 1));
            }
            if (chord && e.key === "-") {
                e.preventDefault();
                setZoom(current => stepZoom(current, -1));
            }
            if (chord && e.key === "0") {
                e.preventDefault();
                setZoom(1);
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
        // Widths are natural-image pixels, the same anchor the 0..1 points use. Denominating
        // them in view pixels would make a stroke change weight when the window resizes, and
        // render differently on a laptop and a desktop once the image syncs between them.
        setActive({color: pen.color, width: pen.width, points: [pointAt(e)]});
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

    // Merging off the previous value rather than the rendered one, so picking a colour and a
    // width before React re-renders keeps both.
    const choosePen = (next: Partial<PenSettings>) => setPen(prev => ({...prev, ...next}));

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink/80 backdrop-blur-sm">
            <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2 text-[13px] font-medium text-paper">
                    <Pen size={15}/>
                    Annotate
                </div>
                <div className="flex items-center gap-2">
                    <div className="mr-1 flex items-center gap-1 text-[12px] text-paper/80">
                        <button
                            onClick={applyFit}
                            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors duration-150 hover:bg-paper/15"
                            title="Fit to window"
                        >
                            <Maximize2 size={14}/>
                            Fit
                        </button>
                        <button
                            onClick={() => setZoom(1)}
                            className="rounded-md px-2.5 py-1.5 transition-colors duration-150 hover:bg-paper/15"
                            title="Actual size"
                        >
                            100%
                        </button>
                        <span className="w-12 text-right tabular-nums text-paper/60" aria-label="Zoom level">
                            {Math.round(zoom * 100)}%
                        </span>
                    </div>
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

            <div ref={viewportRef} className="flex min-h-0 flex-1 overflow-auto px-6 pb-4">
                {/* m-auto, not justify-center: a centred flex container clips the start edge
                    of an oversized child and no amount of scrolling reaches it. */}
                <div
                    ref={surfaceRef}
                    className="relative m-auto h-fit w-fit shrink-0 touch-none select-none"
                    style={natural.w > 0 ? {width: natural.w * zoom, height: natural.h * zoom} : undefined}
                >
                    <img ref={imgRef} src={url} alt="" className="block h-full w-full object-contain"/>
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
                                points={strokePath(s, canvas.w, canvas.h)}
                                fill="none"
                                stroke={s.color}
                                strokeWidth={s.width * zoom}
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
                            onClick={() => choosePen({color: c})}
                            className={`h-5 w-5 rounded-full transition-transform duration-150 ${
                                pen.color === c ? "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-popover" : "hover:scale-105"
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
                            onClick={() => choosePen({width: w})}
                            className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-150 ${
                                pen.width === w ? "bg-accent" : "hover:bg-accent/60"
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
