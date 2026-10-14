import {useEffect, useRef, useState} from "react";
import {CloudService} from "@/services/CloudService";
import type {CloudStatus} from "@/types/electron-api";
import {THEME_PREFERENCES, type ThemePreference} from "@/theme/themePreference.ts";
import {setThemePreference, useThemePreference} from "@/theme/useTheme.ts";
import {CloudDatabasePanel} from "./CloudDatabasePanel.tsx";

const THEME_LABELS: Record<ThemePreference, string> = {system: "System", light: "Light", dark: "Dark"};

export function SettingsSheet({onClose}: {onClose: () => void}) {
    const [view, setView] = useState<"general" | "sync">("general");
    const [status, setStatus] = useState<CloudStatus | null>(null);
    const [statusError, setStatusError] = useState<string | null>(null);
    const theme = useThemePreference();
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        dialog?.showModal();
        return () => dialog?.close();
    }, []);

    useEffect(() => {
        CloudService.status().then(setStatus).catch((err) => setStatusError(err.message));
    }, []);

    return (
        <dialog
            ref={dialogRef}
            className="sheet"
            aria-labelledby="settings-title"
            // Native closes (a second Escape) must reach React; the StrictMode close-and-reopen in the effect must not.
            onClose={() => !dialogRef.current?.open && onClose()}
            onCancel={(e) => {
                e.preventDefault();
                if (view === "sync") setView("general");
                else onClose();
            }}
        >
            {view === "sync" ? (
                <CloudDatabasePanel
                    status={status}
                    onStatus={(next) => {
                        setStatus(next);
                        setStatusError(null);
                    }}
                    onBack={() => setView("general")}
                />
            ) : (
                <div className="sheet-form">
                    <h2 id="settings-title" className="sheet-title">Settings</h2>

                    <div className="sheet-field">
                        <span className="sheet-label">Appearance</span>
                        <div className="segmented" role="radiogroup" aria-label="Appearance">
                            {THEME_PREFERENCES.map(preference => (
                                <button
                                    key={preference}
                                    type="button"
                                    role="radio"
                                    aria-checked={theme === preference}
                                    onClick={() => setThemePreference(preference)}
                                >
                                    {THEME_LABELS[preference]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="sheet-field">
                        <span className="sheet-label">Sync</span>
                        <div className="sheet-control">
                            {statusError ? (
                                <p className="sheet-note" data-tone="failed">{statusError}</p>
                            ) : (
                                <p className="sheet-note" data-tone={status?.configured ? undefined : "unready"}>
                                    <span className="readiness-dot"/>
                                    {status?.configured ? <>Connected to <code>{status.host}</code></> : "Local only"}
                                </p>
                            )}
                            <button type="button" className="push-button" onClick={() => setView("sync")}>
                                Sync Database…
                            </button>
                        </div>
                    </div>

                    <div className="sheet-buttons">
                        <button type="button" className="push-button" data-default onClick={onClose}>
                            Done
                        </button>
                    </div>
                </div>
            )}
        </dialog>
    );
}
