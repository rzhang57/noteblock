import {useState} from "react";
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

interface CloudDatabasePanelProps {
    status: CloudStatus | null;
    onStatus: (status: CloudStatus) => void;
    onBack: () => void;
}

export function CloudDatabasePanel({status, onStatus, onBack}: CloudDatabasePanelProps) {
    const [config, setConfig] = useState<CloudDatabaseConfig>(EMPTY);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        setError(null);
        try {
            onStatus(await CloudService.configure(config));
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
            onStatus(await CloudService.clear());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }

    return (
        <form
            className="sheet-form"
            onSubmit={(e) => {
                e.preventDefault();
                if (!status?.configured) save();
            }}
        >
            <h2 id="settings-title" className="sheet-title">Sync Database</h2>
            <p className="sheet-intro">
                Connects this machine to a Postgres database for sync. The password is stored in your
                operating system's keychain. This is a developer setting, not an account: anyone who can
                use this computer can read the database.
            </p>

            {status?.configured ? (
                <div className="sheet-field">
                    <span className="sheet-label">Status</span>
                    <p className="sheet-note">
                        <span className="readiness-dot"/>
                        Connected to <code>{status.host}</code>
                    </p>
                </div>
            ) : (
                FIELDS.map(({key, label, type}) => (
                    <label key={key} className="sheet-field">
                        <span className="sheet-label">{label}</span>
                        <input
                            type={type ?? "text"}
                            className="text-field"
                            value={config[key]}
                            onChange={(e) => setConfig({...config, [key]: e.target.value})}
                        />
                    </label>
                ))
            )}

            {error && <p className="sheet-note" data-tone="failed">{error}</p>}

            <div className="sheet-buttons">
                {status?.configured && (
                    <button type="button" className="link-button" onClick={disconnect}>
                        Disconnect and use local storage
                    </button>
                )}
                <button type="button" className="push-button" onClick={onBack} disabled={saving}>
                    Back
                </button>
                {!status?.configured && (
                    <button type="submit" className="push-button" data-default disabled={saving}>
                        {saving ? "Connecting…" : "Connect"}
                    </button>
                )}
            </div>
        </form>
    );
}
