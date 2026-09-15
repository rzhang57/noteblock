import {describe, expect, it} from "vitest";
import type {Stroke} from "@/types/Note.ts";
import {commitAction, keyAction, overlay, strokePath, strokesEqual} from "./strokeGeometry.ts";

const stroke = (points: [number, number][], width = 6): Stroke => ({color: "#e0452c", width, points});
const NATURAL = {w: 770, h: 199};
const key = (k: string, chord = false) => ({key: k, ctrlKey: chord, metaKey: false});

describe("stroke geometry", () => {
    it("maps 0..1 points onto the natural image box", () => {
        expect(strokePath(stroke([[0, 0], [0.5, 0.5], [1, 1]]), 770, 199))
            .toBe("0.00,0.00 385.00,99.50 770.00,199.00");
    });

    it("places a point at the fraction of the box it was given", () => {
        const [x, y] = strokePath(stroke([[0.25, 0.75]]), 400, 800).split(",").map(Number);

        expect(x / 400).toBeCloseTo(0.25);
        expect(y / 800).toBeCloseTo(0.75);
    });
});

describe("overlay", () => {
    // The widths disagreed because the preview drew into the rendered box while the annotator drew
    // into the natural one. Taking a single box is what makes that mistake unavailable.
    it("puts the paths and the viewBox in the same coordinate space", () => {
        const drawn = overlay([stroke([[1, 1]])], NATURAL)!;

        expect(drawn.viewBox).toBe("0 0 770 199");
        expect(drawn.paths).toEqual(["770.00,199.00"]);
    });

    it("draws one path per stroke, in order", () => {
        const drawn = overlay([stroke([[0, 0]]), stroke([[1, 1]])], NATURAL)!;

        expect(drawn.paths).toEqual(["0.00,0.00", "770.00,199.00"]);
    });

    // A viewBox with a zero side disables rendering entirely, so the overlay has to wait rather
    // than emit one - the strokes would vanish instead of arriving late.
    it.each([
        ["nothing drawn", [], NATURAL],
        ["an unmeasured image", [stroke([[0.5, 0.5]])], {w: 0, h: 0}],
        ["a zero width", [stroke([[0.5, 0.5]])], {w: 0, h: 199}],
        ["a zero height", [stroke([[0.5, 0.5]])], {w: 770, h: 0}],
    ])("renders no overlay for %s", (_label, strokes, natural) => {
        expect(overlay(strokes as Stroke[], natural)).toBeNull();
    });
});

describe("strokesEqual", () => {
    it("compares content, not identity", () => {
        const a = [stroke([[0.1, 0.2]])];

        expect(strokesEqual(a, structuredClone(a))).toBe(true);
        expect(strokesEqual(a, a)).toBe(true);
    });

    it.each([
        ["a different point", [stroke([[0.1, 0.3]])]],
        ["a different width", [stroke([[0.1, 0.2]], 11)]],
        ["an extra stroke", [stroke([[0.1, 0.2]]), stroke([[0.4, 0.4]])]],
        ["nothing at all", []],
    ])("sees %s as a change", (_label, other) => {
        expect(strokesEqual([stroke([[0.1, 0.2]])], other as Stroke[])).toBe(false);
    });
});

describe("commitAction", () => {
    const saved = [stroke([[0.1, 0.2]])];

    it("saves a stroke that was added", () => {
        const drawn = stroke([[0.5, 0.5], [0.6, 0.6]]);

        expect(commitAction([...saved, drawn], null, saved)).toEqual({save: [...saved, drawn]});
    });

    // Undo allocates a new array even when it removes nothing, so an identity check would report a
    // change here and write a note nobody edited.
    it("closes without writing when the content is unchanged", () => {
        expect(commitAction([...saved], null, saved)).toEqual({close: true});
        expect(commitAction([], null, [])).toEqual({close: true});
    });

    it("keeps a stroke that is still under the pointer", () => {
        const active = stroke([[0.7, 0.7], [0.8, 0.8]]);

        expect(commitAction(saved, active, saved)).toEqual({save: [...saved, active]});
    });

    it("drops a pointer-down that never became a line", () => {
        expect(commitAction(saved, stroke([[0.7, 0.7]]), saved)).toEqual({close: true});
    });

    it("saves the removal when everything was undone", () => {
        expect(commitAction([], null, saved)).toEqual({save: []});
    });
});

describe("keyAction", () => {
    it.each([
        ["Escape", key("Escape"), "commit"],
        ["Enter", key("Enter"), "commit"],
        // Escape is read first, so a stray modifier still commits rather than being swallowed.
        ["Ctrl+Escape", key("Escape", true), "commit"],
        ["Ctrl+z", key("z", true), "undo"],
        ["Ctrl+Z with shift held", key("Z", true), "undo"],
        ["Ctrl+=", key("=", true), "zoom-in"],
        ["Ctrl++", key("+", true), "zoom-in"],
        ["Ctrl+-", key("-", true), "zoom-out"],
        ["Ctrl+0", key("0", true), "zoom-reset"],
    ])("maps %s", (_label, event, action) => {
        expect(keyAction(event)).toBe(action);
    });

    it.each([
        ["an unmodified z", key("z")],
        ["an unmodified zoom key", key("0")],
        ["a letter nothing is bound to", key("q", true)],
        ["a bare arrow key", key("ArrowLeft")],
    ])("ignores %s", (_label, event) => {
        expect(keyAction(event)).toBeNull();
    });

    it("treats cmd as ctrl", () => {
        expect(keyAction({key: "z", ctrlKey: false, metaKey: true})).toBe("undo");
    });
});
