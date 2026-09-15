import type {Stroke} from "@/types/Note.ts";

// Points are 0..1 and widths are natural-image pixels, so everything that draws a stroke has to
// draw it in natural-image space and let the element scale it. Two copies of this mapping drifted
// once already: the annotator scaled widths and the preview did not.
export function strokePath(stroke: Stroke, w: number, h: number): string {
    return stroke.points.map(([x, y]) => `${(x * w).toFixed(2)},${(y * h).toFixed(2)}`).join(" ");
}

// One box in, both outputs out, so a caller cannot pass the rendered rect to one and the natural
// size to the other - which is exactly how the widths came to disagree. A zero in either dimension
// makes the viewBox invalid and the browser silently draws nothing, so that case has no overlay.
export function overlay(strokes: Stroke[], natural: {w: number; h: number}):
    {viewBox: string; paths: string[]} | null {
    if (strokes.length === 0 || natural.w <= 0 || natural.h <= 0) return null;

    return {
        viewBox: `0 0 ${natural.w} ${natural.h}`,
        paths: strokes.map(stroke => strokePath(stroke, natural.w, natural.h)),
    };
}

// Undo allocates a new array even when it removes nothing, so identity cannot stand in for
// "edited": closing on a fresh array writes the block and pushes a note nobody changed.
export function strokesEqual(a: Stroke[], b: Stroke[]): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;

    return a.every((stroke, i) => {
        const other = b[i];
        return stroke.color === other.color
            && stroke.width === other.width
            && stroke.points.length === other.points.length
            && stroke.points.every(([x, y], j) => x === other.points[j][0] && y === other.points[j][1]);
    });
}

export type Commit = {close: true} | {save: Stroke[]};

// A stroke still under the pointer lives outside the draft and has not been committed yet;
// leaving it out throws away a line the user can see on screen.
export function commitAction(draft: Stroke[], active: Stroke | null, original: Stroke[]): Commit {
    const committed = active && active.points.length > 1 ? [...draft, active] : draft;
    return strokesEqual(committed, original) ? {close: true} : {save: committed};
}

export type KeyAction = "commit" | "undo" | "zoom-in" | "zoom-out" | "zoom-reset" | null;

// Escape is read before the chord, so Ctrl+Escape still commits rather than falling through.
export function keyAction(e: {key: string; ctrlKey: boolean; metaKey: boolean}): KeyAction {
    if (e.key === "Escape" || e.key === "Enter") return "commit";

    if (!(e.ctrlKey || e.metaKey)) return null;
    if (e.key.toLowerCase() === "z") return "undo";
    if (e.key === "=" || e.key === "+") return "zoom-in";
    if (e.key === "-") return "zoom-out";
    if (e.key === "0") return "zoom-reset";
    return null;
}
