import {useEffect} from "react";

const IS_MAC = navigator.userAgent.includes("Macintosh");

export function useCommandKey(key: string, onPress: () => void) {
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const command = IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
            if (!command || e.shiftKey || e.altKey || e.repeat || e.key.toLowerCase() !== key) return;
            e.preventDefault();
            onPress();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [key, onPress]);
}
