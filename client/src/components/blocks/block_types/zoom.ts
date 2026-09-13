export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
const STEP = 1.25;

export interface Size {
    w: number;
    h: number;
}

export function clampZoom(zoom: number): number {
    if (!Number.isFinite(zoom) || zoom <= 0) return 1;

    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function stepZoom(zoom: number, direction: 1 | -1): number {
    return clampZoom(direction > 0 ? zoom * STEP : zoom / STEP);
}

// A trackpad pinch arrives as a ctrl-wheel too, and its deltas run far larger than a mouse
// notch, so the per-event factor is bounded rather than applied raw.
export function wheelZoom(zoom: number, deltaY: number): number {
    if (!Number.isFinite(deltaY) || deltaY === 0) return clampZoom(zoom);

    const bounded = Math.max(-100, Math.min(100, deltaY));

    return clampZoom(zoom * Math.exp(-bounded / 300));
}

// Proportional rather than a pixel inset, so the image keeps the same share of the surface at
// every viewport size instead of looking cramped on a small one and lost on a large one.
const FIT_MARGIN = 0.9;

// Small images scale up rather than being left at natural size — a 200px screenshot is the
// case that makes the annotator unusable, and capping fit at 1 would preserve exactly that.
export function fitZoom(natural: Size, viewport: Size): number {
    if (natural.w <= 0 || natural.h <= 0 || viewport.w <= 0 || viewport.h <= 0) return 1;

    return clampZoom(Math.min(viewport.w / natural.w, viewport.h / natural.h) * FIT_MARGIN);
}

export interface Anchor {
    scrollLeft: number;
    scrollTop: number;
    pointerX: number;
    pointerY: number;
}

// Keeps whatever sits under the cursor under the cursor, so zooming reads as moving toward
// the detail rather than toward the top-left corner.
export function anchoredScroll(anchor: Anchor, from: number, to: number): {left: number; top: number} {
    const ratio = to / from;

    return {
        left: Math.max(0, (anchor.scrollLeft + anchor.pointerX) * ratio - anchor.pointerX),
        top: Math.max(0, (anchor.scrollTop + anchor.pointerY) * ratio - anchor.pointerY),
    };
}
