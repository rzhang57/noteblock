import {useEffect, useRef, useState} from "react";
import {Pen} from "lucide-react";
import type {Block, ImageContent, Stroke} from "@/types/Note.ts";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {NoteService} from "@/services/NoteService.ts";
import {ImageAnnotator} from "./ImageAnnotator.tsx";
import {overlay} from "./strokeGeometry.ts";

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
    const imgRef = useRef<HTMLImageElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const [natural, setNatural] = useState({w: 0, h: 0});

    // Strokes are anchored to natural-image pixels, so the overlay is drawn in that space and a
    // viewBox scales it to whatever size the image is displayed at. Measuring the rendered box
    // instead would read zero height until the image loads, which is when the annotations are
    // wanted most, and would size strokes in view pixels rather than image pixels.
    useEffect(() => {
        const el = imgRef.current;
        if (!el) return;
        const read = () => setNatural({w: el.naturalWidth, h: el.naturalHeight});
        if (el.complete && el.naturalWidth > 0) read();
        el.addEventListener("load", read);
        return () => el.removeEventListener("load", read);
    }, [content?.url]);

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

    const drawn = overlay(strokes, natural);

    if (!content?.url) {
        return <div className="py-2 text-[13px] text-ink-faint">Image is missing its source.</div>;
    }

    return (
        <>
            <div ref={trackRef} className="my-1 flex justify-center">
                <div
                    className="group/img relative cursor-pointer overflow-hidden rounded-lg"
                    style={{width: `${scale * 100}%`}}
                    onClick={() => !resizeGestureRef.current && setEditing(true)}
                >
                    <img ref={imgRef} src={content.url} alt="" className="block w-full object-contain"/>

                    {drawn && (
                        <svg
                            className="pointer-events-none absolute inset-0 h-full w-full"
                            viewBox={drawn.viewBox}
                        >
                            {drawn.paths.map((points, i) => (
                                <polyline
                                    key={i}
                                    points={points}
                                    fill="none"
                                    stroke={strokes[i].color}
                                    strokeWidth={strokes[i].width}
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
