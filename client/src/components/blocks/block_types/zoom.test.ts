import {describe, expect, it} from "vitest"

import {anchoredScroll, clampZoom, fitZoom, MAX_ZOOM, MIN_ZOOM, stepZoom, wheelZoom} from "./zoom"

describe("zoom", () => {
    it("clamps to a usable range", () => {
        expect(clampZoom(500)).toBe(MAX_ZOOM)
        expect(clampZoom(0.0001)).toBe(MIN_ZOOM)
        expect(clampZoom(2)).toBe(2)
    })

    it("falls back rather than propagating a broken zoom", () => {
        expect(clampZoom(Number.NaN)).toBe(1)
        expect(clampZoom(0)).toBe(1)
        expect(clampZoom(-3)).toBe(1)
    })

    it("steps in and out symmetrically", () => {
        const zoomed = stepZoom(1, 1)

        expect(zoomed).toBeGreaterThan(1)
        expect(stepZoom(zoomed, -1)).toBeCloseTo(1, 10)
    })

    it("stops stepping at the bounds", () => {
        expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM)
        expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM)
    })

    it("zooms in on a negative wheel and out on a positive one", () => {
        expect(wheelZoom(1, -100)).toBeGreaterThan(1)
        expect(wheelZoom(1, 100)).toBeLessThan(1)
    })

    // A trackpad pinch arrives as a ctrl-wheel with deltas far larger than a mouse notch.
    it("keeps a huge pinch delta to a sane single step", () => {
        const pinched = wheelZoom(1, -4000)

        expect(pinched).toBeLessThanOrEqual(2)
        expect(pinched).toBeGreaterThan(1)
    })

    it("scales a small image up to fill the viewport", () => {
        expect(fitZoom({w: 200, h: 100}, {w: 800, h: 600})).toBe(4)
    })

    it("scales a large image down to fit", () => {
        expect(fitZoom({w: 4000, h: 2000}, {w: 800, h: 600})).toBeCloseTo(0.2, 10)
    })

    it("does not divide by an unmeasured image or viewport", () => {
        expect(fitZoom({w: 0, h: 0}, {w: 800, h: 600})).toBe(1)
        expect(fitZoom({w: 200, h: 100}, {w: 0, h: 0})).toBe(1)
    })

    it("keeps the point under the cursor under the cursor", () => {
        // 100px into the content at 1x; at 2x that point sits 200px in, so the scroll offset
        // has to grow by exactly the amount that keeps it beneath a cursor 40px into the view.
        const {left} = anchoredScroll({scrollLeft: 60, scrollTop: 0, pointerX: 40, pointerY: 0}, 1, 2)

        expect(left).toBe(160)
    })

    it("never scrolls to a negative offset when zooming out", () => {
        const {left, top} = anchoredScroll({scrollLeft: 0, scrollTop: 0, pointerX: 40, pointerY: 30}, 4, 1)

        expect(left).toBe(0)
        expect(top).toBe(0)
    })
})
