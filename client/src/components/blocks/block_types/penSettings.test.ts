import {afterEach, describe, expect, it, vi} from "vitest"

import {DEFAULT_PEN, loadPen, PEN_COLORS, PEN_WIDTHS, savePen} from "./penSettings"

function useStorage(impl: Partial<Storage>) {
    vi.stubGlobal("localStorage", impl as Storage)
}

function memoryStorage(seed: Record<string, string> = {}) {
    const items = {...seed}
    return {
        getItem: (k: string) => items[k] ?? null,
        setItem: (k: string, v: string) => {
            items[k] = v
        },
        items,
    }
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("pen settings", () => {
    it("round-trips a chosen pen", () => {
        const store = memoryStorage()
        useStorage(store)

        savePen({color: PEN_COLORS[3], width: PEN_WIDTHS[2]})

        expect(loadPen()).toEqual({color: PEN_COLORS[3], width: PEN_WIDTHS[2]})
    })

    it("keeps one pen for every image rather than one per block", () => {
        const store = memoryStorage()
        useStorage(store)

        savePen({color: PEN_COLORS[1], width: PEN_WIDTHS[0]})

        expect(Object.keys(store.items)).toHaveLength(1)
    })

    it("falls back when nothing has been stored yet", () => {
        useStorage(memoryStorage())

        expect(loadPen()).toEqual(DEFAULT_PEN)
    })

    it("falls back rather than drawing with a value no longer in the palette", () => {
        useStorage(memoryStorage({
            "noteblock.annotator.pen": JSON.stringify({color: "#123456", width: 999}),
        }))

        expect(loadPen()).toEqual(DEFAULT_PEN)
    })

    it("keeps the half of a stored pen that is still valid", () => {
        useStorage(memoryStorage({
            "noteblock.annotator.pen": JSON.stringify({color: PEN_COLORS[2], width: 999}),
        }))

        expect(loadPen()).toEqual({color: PEN_COLORS[2], width: DEFAULT_PEN.width})
    })

    it("falls back on malformed json", () => {
        useStorage(memoryStorage({"noteblock.annotator.pen": "not json at all"}))

        expect(loadPen()).toEqual(DEFAULT_PEN)
    })

    // A private window throws on read and on write; the annotator still has to open and work.
    it("survives storage that throws", () => {
        useStorage({
            getItem: () => {
                throw new DOMException("denied")
            },
            setItem: () => {
                throw new DOMException("denied")
            },
        })

        expect(loadPen()).toEqual(DEFAULT_PEN)
        expect(() => savePen({color: PEN_COLORS[0], width: PEN_WIDTHS[0]})).not.toThrow()
    })

    it("survives storage being absent entirely", () => {
        vi.stubGlobal("localStorage", undefined)

        expect(loadPen()).toEqual(DEFAULT_PEN)
        expect(() => savePen({color: PEN_COLORS[0], width: PEN_WIDTHS[0]})).not.toThrow()
    })
})
