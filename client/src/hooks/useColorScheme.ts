import {useEffect, useState} from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function useColorScheme(): "light" | "dark" {
    const [dark, setDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

    useEffect(() => {
        const query = window.matchMedia(DARK_QUERY);
        const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, []);

    return dark ? "dark" : "light";
}
