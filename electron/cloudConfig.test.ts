import {beforeEach, describe, expect, it, vi} from "vitest"
import {createStore, maskedHost, validate} from "./cloudConfig.js"

const CONFIG = {
    host: "db.qwertyuiopasdfgh.supabase.co",
    port: "5432",
    database: "postgres",
    user: "noteblock_sync",
    password: "placeholder-not-a-real-password",
    schema: "public",
}

// Reversible so a truncated file decrypts to a plaintext prefix, the way a real interrupted write
// would rather than throwing cleanly.
function fakeSafeStorage(available = true) {
    return {
        isEncryptionAvailable: () => available,
        encryptString: (s: string) => Buffer.from(`enc:${s}`),
        decryptString: (b: Buffer) => {
            const raw = b.toString()
            if (!raw.startsWith("enc:")) throw new Error("not encrypted by this key")
            return raw.slice(4)
        },
    }
}

function fakeFs() {
    const files = new Map<string, Buffer>()
    const modes = new Map<string, number>()
    return {
        files,
        modes,
        existsSync: (p: string) => files.has(p),
        readFileSync: (p: string) => {
            const buf = files.get(p)
            if (!buf) throw Object.assign(new Error("ENOENT"), {name: "Error"})
            return buf
        },
        writeFileSync: (p: string, data: Buffer, opts?: {mode?: number}) => {
            files.set(p, Buffer.from(data))
            if (opts?.mode !== undefined) modes.set(p, opts.mode)
        },
        renameSync: (from: string, to: string) => {
            const buf = files.get(from)
            if (!buf) throw new Error("ENOENT")
            files.set(to, buf)
            files.delete(from)
            modes.set(to, modes.get(from) ?? 0)
        },
        mkdirSync: () => undefined,
        rmSync: (p: string) => {
            files.delete(p)
        },
    }
}

function makeStore(overrides: {fs?: ReturnType<typeof fakeFs>; safeStorage?: ReturnType<typeof fakeSafeStorage>} = {}) {
    const fs = overrides.fs ?? fakeFs()
    const safeStorage = overrides.safeStorage ?? fakeSafeStorage()
    const store = createStore({
        fs,
        safeStorage,
        userDataPath: () => "/userdata",
        dataPath: () => "/data",
    })
    return {fs, safeStorage, store}
}

describe("maskedHost", () => {
    // The identifying label sits in a different position per provider, so each of these would leak
    // it under a rule that masks by index.
    it.each([
        ["db.qwertyuiopasdfgh.supabase.co", "***.supabase.co"],
        ["qwertyuiopasdfgh.pooler.supabase.com", "***.supabase.com"],
        ["acme-prod.cluster-abc123.us-east-1.rds.amazonaws.com", "***.amazonaws.com"],
    ])("hides everything before the registrable domain of %s", (host, masked) => {
        expect(maskedHost(host)).toBe(masked)
        expect(maskedHost(host)).not.toContain(host.split(".")[0])
    })

    it("leaves a bare registrable domain alone, there being nothing in front of it", () => {
        expect(maskedHost("example.com")).toBe("example.com")
    })

    it("masks all but the first two characters of a single-label host", () => {
        expect(maskedHost("localhost")).toBe("lo***")
    })

    it("returns an empty string for a missing host rather than throwing", () => {
        expect(maskedHost("")).toBe("")
        expect(maskedHost(undefined as unknown as string)).toBe("")
    })
})

describe("validate", () => {
    it("accepts a well-formed config", () => {
        expect(() => validate(CONFIG)).not.toThrow()
    })

    it.each(["host", "port", "database", "user", "password", "schema"])("rejects a blank %s", (field) => {
        expect(() => validate({...CONFIG, [field]: "   "})).toThrow(new RegExp(`Missing ${field}`))
    })

    it.each([
        ["a space", "db.example.com extra"],
        ["a connection-string separator", "db.example.com?sslmode=disable"],
        ["a password delimiter", "db.example.com:5432"],
    ])("rejects a host containing %s", (_label, host) => {
        expect(() => validate({...CONFIG, host})).toThrow(/Host may only contain/)
    })

    it.each(["database", "schema", "user"])("rejects %s containing a quote", (field) => {
        expect(() => validate({...CONFIG, [field]: `public' --`})).toThrow(/not allowed/)
    })

    it.each(["0", "65536", "-1", "54 32", "abc"])("rejects port %s", (port) => {
        expect(() => validate({...CONFIG, port})).toThrow()
    })

    // Main puts the host in a native confirmation dialog before anything is saved.
    it("rejects a host longer than a name the DNS could resolve", () => {
        expect(() => validate({...CONFIG, host: "a".repeat(254)})).toThrow(/Host may only contain/)
    })
})

describe("cloud config store", () => {
    let consoleError: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    })

    it("round-trips a saved config", () => {
        const {store} = makeStore()
        store.write(CONFIG)
        expect(store.read()).toEqual(CONFIG)
    })

    it("refuses to save when the platform has no secure storage", () => {
        const {store, fs} = makeStore({safeStorage: fakeSafeStorage(false)})
        expect(() => store.write(CONFIG)).toThrow(/no secure storage/)
        expect(fs.files.size).toBe(0)
    })

    it("rejects an invalid config before anything reaches disk", () => {
        const {store, fs} = makeStore()
        expect(() => store.write({...CONFIG, host: "db.example.com?sslmode=disable"})).toThrow()
        expect(fs.files.size).toBe(0)
    })

    // The named guarantee is that a half-written file never replaces a good one, so the test has
    // to interrupt a write rather than inspect the tidy end state, which looks the same either way.
    it("keeps the saved config intact when a write dies half way through", () => {
        const {store, fs} = makeStore()
        store.write(CONFIG)

        const realWrite = fs.writeFileSync
        fs.writeFileSync = (p: string, data: Buffer, opts?: {mode?: number}) => {
            realWrite(p, data.subarray(0, 12), opts)
            throw new Error("ENOSPC")
        }

        expect(() => store.write({...CONFIG, host: "db.newnewnewnewnew.supabase.co"})).toThrow(/ENOSPC/)
        expect(store.read()).toEqual(CONFIG)
    })

    it("writes the config readable only by its owner", () => {
        const {store, fs} = makeStore()
        store.write(CONFIG)
        expect(fs.modes.get(store.file())).toBe(0o600)
    })

    it.each([
        ["a truncated ciphertext", (c: string) => c.slice(0, 40)],
        ["a plaintext that was never json", () => CONFIG.password],
    ])("falls back to local storage on %s without quoting its contents", (_label, corrupt) => {
        const {store, fs} = makeStore()
        store.write(CONFIG)
        fs.files.set(store.file(), Buffer.from(`enc:${corrupt(JSON.stringify(CONFIG))}`))

        expect(store.read()).toBeNull()
        expect(store.status()).toEqual({configured: false, host: null})

        const logged = consoleError.mock.calls.flat().map(String).join(" ")
        expect(logged).not.toContain(CONFIG.password)
        expect(logged).not.toContain(CONFIG.host)
    })

    // An older build, or a hand-edited file, can hold something that decrypts and parses but would
    // never pass the dialog. environment() must not hand it to the child.
    it("treats a saved config that no longer validates as absent", () => {
        const {store, fs} = makeStore()
        store.write(CONFIG)
        fs.files.set(store.file(), Buffer.from(`enc:${JSON.stringify({...CONFIG, password: ""})}`))

        expect(store.read()).toBeNull()
        expect(store.status()).toEqual({configured: false, host: null})
        expect(store.environment(1, {}).BLUEPRINT_DB_HOST).toBeUndefined()
    })

    it("treats a file encrypted under another key as absent", () => {
        const {store, fs} = makeStore()
        fs.files.set(store.file(), Buffer.from("some other app's bytes"))
        expect(store.read()).toBeNull()
    })

    it("reports a masked host and never the password", () => {
        const {store} = makeStore()
        store.write(CONFIG)

        const status = store.status()
        expect(status).toEqual({configured: true, host: "***.supabase.co"})
        expect(JSON.stringify(status)).not.toContain(CONFIG.password)
    })

    it("forgets the config on clear", () => {
        const {store} = makeStore()
        store.write(CONFIG)
        store.clear()
        expect(store.status()).toEqual({configured: false, host: null})
    })
})

describe("child process environment", () => {
    it("hands the saved config to the cloud service and drops the sqlite fallback", () => {
        const {store} = makeStore()
        store.write(CONFIG)

        const env = store.environment(41234, {BLUEPRINT_DB_SQLITE_PATH: "/stale/cloud.sqlite"})

        expect(env.PORT).toBe("41234")
        expect(env.BLUEPRINT_DB_HOST).toBe(CONFIG.host)
        expect(env.BLUEPRINT_DB_PORT).toBe(CONFIG.port)
        expect(env.BLUEPRINT_DB_DATABASE).toBe(CONFIG.database)
        expect(env.BLUEPRINT_DB_USERNAME).toBe(CONFIG.user)
        expect(env.BLUEPRINT_DB_PASSWORD).toBe(CONFIG.password)
        expect(env.BLUEPRINT_DB_SCHEMA).toBe(CONFIG.schema)
        expect(env).not.toHaveProperty("BLUEPRINT_DB_SQLITE_PATH")
    })

    it("requires TLS rather than inheriting whatever the ambient environment says", () => {
        const {store} = makeStore()
        store.write(CONFIG)

        const env = store.environment(1, {BLUEPRINT_DB_SSLMODE: "disable"})

        expect(env.BLUEPRINT_DB_SSLMODE).toBe("require")
    })

    // validate() only sees the six fields, so anything else the caller sends must not survive the
    // round trip and reach the child as an environment variable.
    it("requires TLS even when the caller saved an sslmode of its own", () => {
        const {store} = makeStore()
        store.write({...CONFIG, sslmode: "disable"} as never)

        expect(store.read()).toEqual(CONFIG)
        expect(store.environment(1, {}).BLUEPRINT_DB_SSLMODE).toBe("require")
    })

    it("overrides an ambient database pointing somewhere else", () => {
        const {store} = makeStore()
        store.write(CONFIG)

        const env = store.environment(1, {
            BLUEPRINT_DB_HOST: "attacker.example.com",
            BLUEPRINT_DB_PASSWORD: "ambient",
        })

        expect(env.BLUEPRINT_DB_HOST).toBe(CONFIG.host)
        expect(env.BLUEPRINT_DB_PASSWORD).toBe(CONFIG.password)
    })

    it("anchors uploaded images to the data directory, not the child's cwd", () => {
        const {store} = makeStore()
        store.write(CONFIG)

        const env = store.environment(1, {})

        expect(env.BLOB_FILE_DIR?.replace(/\\/g, "/")).toBe("/data/cloud-images")
    })

    it("falls back to a local sqlite database when nothing is configured", () => {
        const {store} = makeStore()

        const env = store.environment(1, {})

        expect(env.BLUEPRINT_DB_SQLITE_PATH?.replace(/\\/g, "/")).toBe("/data/cloud.sqlite")
    })

    it("leaves a developer's ambient postgres alone when nothing is configured", () => {
        const {store} = makeStore()

        const env = store.environment(1, {BLUEPRINT_DB_HOST: "127.0.0.1"})

        expect(env).not.toHaveProperty("BLUEPRINT_DB_SQLITE_PATH")
        expect(env.BLUEPRINT_DB_HOST).toBe("127.0.0.1")
    })
})
