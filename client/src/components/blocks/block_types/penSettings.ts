export const PEN_COLORS = ["#e0452c", "#f0a202", "#2f9e44", "#1c7ed6", "#7048e8", "#1a1a1a"];
export const PEN_WIDTHS = [3, 6, 11];

const STORAGE_KEY = "noteblock.annotator.pen";

export interface PenSettings {
    color: string;
    width: number;
}

export const DEFAULT_PEN: PenSettings = {color: PEN_COLORS[0], width: PEN_WIDTHS[1]};

// Reading the property itself throws when a browser has site data blocked, not just the call.
function storage(): Storage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

// One pen shared by every image rather than one per block: picking a colour is a preference
// about how you annotate, not a property of the thing being annotated.
export function loadPen(): PenSettings {
    try {
        const raw = storage()?.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_PEN;

        const stored = JSON.parse(raw) as Partial<PenSettings>;

        // A value dropped from the palette would otherwise draw in a colour nothing can select.
        return {
            color: PEN_COLORS.includes(stored?.color as string) ? stored.color as string : DEFAULT_PEN.color,
            width: PEN_WIDTHS.includes(stored?.width as number) ? stored.width as number : DEFAULT_PEN.width,
        };
    } catch {
        return DEFAULT_PEN;
    }
}

export function savePen(pen: PenSettings): void {
    try {
        storage()?.setItem(STORAGE_KEY, JSON.stringify(pen));
    } catch {
        /* empty */
    }
}
