import {useEffect, useRef, useState} from "react";
import {Pen} from "lucide-react";
import type {Block, ImageContent, Stroke} from "@/types/Note.ts";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {NoteService} from "@/services/NoteService.ts";
import {ImageAnnotator} from "./ImageAnnotator.tsx";

const MIN_SCALE = 0.2;
const MAX_SCALE = 1;

export function ImageBlock({block}: { block: Block }) {
    const {selectedNoteId} = useNoteContext();
    const content = block.content as ImageContent;
    const [strokes, setStrokes] = useState<Stroke[]>(content?.strokes ?? []);
    const [scale, setScale] = useState(content?.scale ?? MAX_SCALE);
    const [editing, setEditing] = useState(false);
    const scaleRef = useRef(content?.scale ?? MAX_SCALE);
    // Click arrives after pointerup, so this outlives the gesture and drops a tick later.
    const resizeGestureRef = useRef(false);
    const figureRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState({w: 0, h: 0});

    useEffect(() => {
        const el = figureRef.current;
        if (!el) return;
        const measure = () => setBox({w: el.clientWidth, h: el.clientHeight});
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        measure();
        return () => observer.disconnect();
    }, []);

    const persist = async (next: Partial<ImageContent>) => {
        if (!selectedNoteId) return;
        try {
            await NoteService.updateBlock(selectedNoteId, block.id, {
                type: "image",
                content: {url: content.url, strokes, scale, ...next}
            });
        } catch (err) {
            console.error("Failed to save image block:", err);
        }
    };

    const saveStrokes = async (next: Stroke[]) => {
        setStrokes(next);
        setEditing(false);
        await persist({strokes: next});
    };

    const startResize = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const track = trackRef.current;
        if (!track) return;
        const trackWidth = track.clientWidth;
        resizeGestureRef.current = true;

        const onMove = (move: PointerEvent) => {
            const rect = track.getBoundingClientRect();
            const next = (move.clientX - rect.left) / trackWidth;
            scaleRef.current = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
            setScale(scaleRef.current);
        };
        const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            persist({scale: scaleRef.current});
            setTimeout(() => {
                resizeGestureRef.current = false;
            }, 0);
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    };

    if (!content?.url) {
        return <div className="py-2 text-[13px] text-ink-faint">Image is missing its source.</div>;
    }

    return (
        <>
            <div ref={trackRef} className="my-1 flex justify-center">
                <div
                    ref={figureRef}
                    className="group/img relative cursor-pointer overflow-hidden rounded-lg"
                    style={{width: `${scale * 100}%`}}
                    onClick={() => !resizeGestureRef.current && setEditing(true)}
                >
                    <img src={content.url} alt="" className="block w-full object-contain"/>

                    {strokes.length > 0 && (
                        <svg className="pointer-events-none absolute inset-0 h-full w-full">
                            {strokes.map((s, i) => (
                                <polyline
                                    key={i}
                                    points={s.points.map(([x, y]) => `${x * box.w},${y * box.h}`).join(" ")}
                                    fill="none"
                                    stroke={s.color}
                                    strokeWidth={s.width}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            ))}
                        </svg>
                    )}

                    <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded-md bg-ink/75 px-2 py-1 text-[11px] font-medium text-paper opacity-0 transition-opacity duration-150 group-hover/img:opacity-100">
                        <Pen size={12}/>
                        Annotate
                    </div>

                    <div
                        onPointerDown={startResize}
                        className="absolute right-0 top-1/2 h-12 w-2 -translate-y-1/2 cursor-ew-resize rounded-full bg-ink/60 opacity-0 transition-opacity duration-150 group-hover/img:opacity-100"
                        role="separator"
                        aria-label="Resize image"
                    />
                </div>
            </div>

            {editing && (
                <ImageAnnotator
                    url={content.url}
                    strokes={strokes}
                    onSave={saveStrokes}
                    onClose={() => setEditing(false)}
                />
            )}
        </>
    );
}
