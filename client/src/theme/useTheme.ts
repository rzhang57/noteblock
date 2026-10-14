import {useSyncExternalStore} from "react";
import {loadThemePreference, resolveTheme, saveThemePreference, type ResolvedTheme, type ThemePreference} from "./themePreference.ts";

const DARK_QUERY = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();
let preference = loadThemePreference();
let resolved = resolveTheme(preference, DARK_QUERY.matches);

function apply() {
    resolved = resolveTheme(preference, DARK_QUERY.matches);
    document.documentElement.dataset.theme = resolved;
    listeners.forEach(listener => listener());
}

DARK_QUERY.addEventListener("change", apply);

export function applyStoredTheme() {
    apply();
}

export function setThemePreference(next: ThemePreference) {
    preference = next;
    saveThemePreference(next);
    apply();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useThemePreference(): ThemePreference {
    return useSyncExternalStore(subscribe, () => preference);
}

export function useResolvedTheme(): ResolvedTheme {
    return useSyncExternalStore(subscribe, () => resolved);
}
