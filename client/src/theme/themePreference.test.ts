import {afterEach, describe, expect, it, vi} from "vitest"

import {loadThemePreference, resolveTheme, saveThemePreference} from "./themePreference"

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

describe("theme preference", () => {
    it("round-trips a chosen preference", () => {
        vi.stubGlobal("localStorage", memoryStorage() as unknown as Storage)
        saveThemePreference("dark")
        expect(loadThemePreference()).toBe("dark")
    })

    it("follows the system when nothing is stored", () => {
        vi.stubGlobal("localStorage", memoryStorage() as unknown as Storage)
        expect(loadThemePreference()).toBe("system")
    })

    it("ignores a stored value it does not recognise", () => {
        vi.stubGlobal("localStorage", memoryStorage({"noteblock.theme": "sepia"}) as unknown as Storage)
        expect(loadThemePreference()).toBe("system")
    })

    it("falls back to the system when storage throws", () => {
        vi.stubGlobal("localStorage", {
            getItem: () => {
                throw new Error("blocked")
            },
        } as unknown as Storage)
        expect(loadThemePreference()).toBe("system")
    })

    it("resolves system to whatever the OS prefers, and an explicit choice to itself", () => {
        expect(resolveTheme("system", true)).toBe("dark")
        expect(resolveTheme("system", false)).toBe("light")
        expect(resolveTheme("light", true)).toBe("light")
        expect(resolveTheme("dark", false)).toBe("dark")
    })
})
