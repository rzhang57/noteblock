export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

const STORAGE_KEY = "noteblock.theme";

// Reading the property itself throws when a browser has site data blocked, not just the call.
function storage(): Storage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

export function loadThemePreference(): ThemePreference {
    try {
        const stored = storage()?.getItem(STORAGE_KEY);
        return THEME_PREFERENCES.find(preference => preference === stored) ?? "system";
    } catch {
        return "system";
    }
}

export function saveThemePreference(preference: ThemePreference) {
    try {
        storage()?.setItem(STORAGE_KEY, preference);
    } catch (err) {
        console.error("Failed to save theme preference:", err);
    }
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
    if (preference === "system") return systemPrefersDark ? "dark" : "light";
    return preference;
}
