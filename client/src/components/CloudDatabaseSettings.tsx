import {useEffect, useState} from "react";
import {CloudService} from "@/services/CloudService";
import type {CloudDatabaseConfig, CloudStatus} from "@/types/electron-api";

const EMPTY: CloudDatabaseConfig = {
    host: "",
    port: "5432",
    database: "postgres",
    user: "",
    password: "",
    schema: "public",
};

const FIELDS: {key: keyof CloudDatabaseConfig; label: string; type?: string}[] = [
    {key: "host", label: "Host"},
    {key: "port", label: "Port"},
    {key: "database", label: "Database"},
    {key: "schema", label: "Schema"},
    {key: "user", label: "User"},
    {key: "password", label: "Password", type: "password"},
];

export function CloudDatabaseSettings({onClose}: {onClose: () => void}) {
    const [status, setStatus] = useState<CloudStatus | null>(null);
    const [config, setConfig] = useState<CloudDatabaseConfig>(EMPTY);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        CloudService.status().then(setStatus).catch((err) => setError(err.message));
    }, []);

    async function save() {
        setSaving(true);
        setError(null);
        try {
            setStatus(await CloudService.configure(config));
            setConfig({...EMPTY});
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    }

    async function disconnect() {
        setError(null);
        try {
            setStatus(await CloudService.clear());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-md rounded-lg bg-paper p-5 shadow-lg">
                <h2 className="text-[15px] font-semibold text-ink">Sync database</h2>
                <p className="mt-1 text-[12px] leading-snug text-ink/60">
                    Connects this machine to a Postgres database for sync. The password is stored in your
                    operating system's keychain. This is a developer setting, not an account — anyone who can
                    use this computer can read the database.
                </p>

                {status?.configured ? (
                    <div className="mt-4 rounded border border-ink/10 p-3">
                        <p className="text-[13px] text-ink">
                            Connected to <span className="font-mono">{status.host}</span>
                        </p>
                        <button
                            className="mt-2 text-[12px] text-ink/70 underline"
                            onClick={disconnect}
                        >
                            Disconnect and use local storage
                        </button>
                    </div>
                ) : (
                    <div className="mt-4 space-y-2">
                        {FIELDS.map(({key, label, type}) => (
                            <label key={key} className="block">
                                <span className="text-[12px] text-ink/70">{label}</span>
                                <input
                                    type={type ?? "text"}
                                    value={config[key]}
                                    onChange={(e) => setConfig({...config, [key]: e.target.value})}
                                    className="mt-0.5 w-full rounded border border-ink/15 bg-paper px-2 py-1 text-[13px] text-ink"
                                />
                            </label>
                        ))}
                    </div>
                )}

                {error && <p className="mt-3 text-[12px] text-red-600">{error}</p>}

                <div className="mt-5 flex justify-end gap-2">
                    <button className="px-3 py-1 text-[13px] text-ink/70" onClick={onClose}>
                        Close
                    </button>
                    {!status?.configured && (
                        <button
                            className="rounded bg-ink px-3 py-1 text-[13px] text-paper disabled:opacity-50"
                            disabled={saving}
                            onClick={save}
                        >
                            {saving ? "Connecting…" : "Connect"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
