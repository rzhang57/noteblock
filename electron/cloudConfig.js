const path = require("path")

const FIELDS = ["host", "port", "database", "user", "password", "schema"]

// Everything but the registrable domain. The identifying label is not always in the same position
// - db.<ref>.supabase.co, <ref>.pooler.supabase.com, <project>.rds.amazonaws.com - so masking by
// index leaks it for every shape but the first.
function maskedHost(host) {
    if (typeof host !== "string" || host === "") return ""

    const labels = host.split(".")
    if (labels.length < 2) return `${labels[0].slice(0, 2)}***`
    if (labels.length === 2) return host

    return ["***", ...labels.slice(-2)].join(".")
}

function validate(config) {
    for (const field of FIELDS) {
        if (!config || typeof config[field] !== "string" || config[field].trim() === "") {
            throw new Error(`Missing ${field}`)
        }
    }
    if (!/^\d+$/.test(config.port) || Number(config.port) < 1 || Number(config.port) > 65535) {
        throw new Error("Port must be a number between 1 and 65535")
    }
    if (!/^[A-Za-z0-9.\-_]+$/.test(config.host) || config.host.length > 253) {
        throw new Error("Host may only contain letters, digits, dots, hyphens and underscores")
    }
    for (const field of ["database", "schema", "user"]) {
        if (!/^[A-Za-z0-9._\-@]+$/.test(config[field])) {
            throw new Error(`${field} contains characters that are not allowed`)
        }
    }
}

function createStore({fs, safeStorage, userDataPath, dataPath}) {
    const file = () => path.join(userDataPath(), "cloud-config.enc")

    function read() {
        try {
            if (!fs.existsSync(file()) || !safeStorage.isEncryptionAvailable()) return null
            const config = JSON.parse(safeStorage.decryptString(fs.readFileSync(file())))
            validate(config)
            return config
        } catch (err) {
            // Name only: a truncated ciphertext can decrypt to a plaintext prefix, and the parser
            // quotes what it choked on.
            console.error("[cloud-config] unreadable, falling back to local storage:", err.name)
            return null
        }
    }

    function write(config) {
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error("This system has no secure storage available, so the password cannot be saved")
        }
        validate(config)

        // Rebuilt from FIELDS rather than persisted as given: an extra key from the caller would
        // otherwise survive the round trip and reach environment() unvalidated.
        const saved = Object.fromEntries(FIELDS.map((field) => [field, config[field]]))

        const target = file()
        const tmp = `${target}.tmp`
        fs.mkdirSync(path.dirname(target), {recursive: true})
        // Written aside and renamed: writeFileSync truncates in place, so a crash mid-write would
        // leave a short file that reads as "not configured" and silently downgrades sync.
        fs.writeFileSync(tmp, safeStorage.encryptString(JSON.stringify(saved)), {mode: 0o600})
        fs.renameSync(tmp, target)
    }

    function clear() {
        fs.rmSync(file(), {force: true})
    }

    // Saved configuration wins over the ambient environment: it is what the user set deliberately.
    function environment(port, processEnv) {
        const env = {...processEnv, PORT: String(port)}
        const saved = read()

        if (saved) {
            env.BLUEPRINT_DB_HOST = saved.host
            env.BLUEPRINT_DB_PORT = saved.port
            env.BLUEPRINT_DB_DATABASE = saved.database
            env.BLUEPRINT_DB_USERNAME = saved.user
            env.BLUEPRINT_DB_PASSWORD = saved.password
            env.BLUEPRINT_DB_SCHEMA = saved.schema
            // Not configurable and not inherited: a database reached over the internet gets TLS,
            // and an sslmode the caller could choose is just a way to turn it off.
            env.BLUEPRINT_DB_SSLMODE = "require"
            // Images would otherwise land relative to the child's working directory.
            env.BLOB_FILE_DIR = path.join(dataPath(), "cloud-images")
            delete env.BLUEPRINT_DB_SQLITE_PATH
            return env
        }

        if (!env.BLUEPRINT_DB_HOST) {
            env.BLUEPRINT_DB_SQLITE_PATH = path.join(dataPath(), "cloud.sqlite")
        }
        return env
    }

    function status() {
        const saved = read()
        return saved ? {configured: true, host: maskedHost(saved.host)} : {configured: false, host: null}
    }

    return {read, write, clear, environment, status, file}
}

module.exports = {createStore, maskedHost, validate, FIELDS}
