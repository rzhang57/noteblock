import {beforeEach, describe, expect, it, vi} from "vitest"
import {createCloudSetup} from "./cloudSetup.js"

const CONFIG = {
    host: "db.qwertyuiopasdfgh.supabase.co",
    port: "5432",
    database: "postgres",
    user: "noteblock_sync",
    password: "placeholder-not-a-real-password",
    schema: "public",
}

const OLD = {...CONFIG, host: "db.oldoldoldoldoldo.supabase.co"}

function harness({saved = null, reachable = true} = {}) {
    const log: string[] = []
    let stored: Record<string, string> | null = saved

    const store = {
        read: () => stored,
        write: vi.fn((config: Record<string, string>) => {
            stored = config
            log.push(`write:${config.host}`)
        }),
        clear: vi.fn(() => {
            stored = null
            log.push("clear")
        }),
        status: () => (stored ? {configured: true, host: stored.host} : {configured: false, host: null}),
    }

    const setup = createCloudSetup({
        store,
        confirm: vi.fn(async () => true),
        stopSidecar: vi.fn(async () => log.push("stopSidecar")),
        startSidecar: vi.fn(async ({resetCursors}: {resetCursors: boolean}) =>
            log.push(`startSidecar:reset=${resetCursors}`)),
        restartCloud: vi.fn(async () => log.push("restartCloud")),
        isReachable: vi.fn(async () => {
            log.push("probe")
            return reachable
        }),
    })

    return {setup, store, log, saved: () => stored}
}

describe("cloud setup ordering", () => {
    let confirmed: ReturnType<typeof harness>

    beforeEach(() => {
        confirmed = harness()
    })

    it("stops the sidecar before the cloud service changes database", async () => {
        await confirmed.setup.configure(CONFIG, null)

        expect(confirmed.log.indexOf("stopSidecar")).toBeLessThan(confirmed.log.indexOf("restartCloud"))
    })

    // A reset delivered before the destination has answered is unrecoverable: the cursors that
    // describe the old database are gone whether or not the new one ever works.
    it("does not reset the cursors until the database has answered", async () => {
        await confirmed.setup.configure(CONFIG, null)

        expect(confirmed.log).toEqual([
            "stopSidecar",
            `write:${CONFIG.host}`,
            "restartCloud",
            "probe",
            "startSidecar:reset=true",
        ])
    })

    it("puts the previous database back when the new one never answers", async () => {
        const h = harness({saved: OLD, reachable: false})

        await expect(h.setup.configure(CONFIG, null)).rejects.toThrow(/did not accept the connection/)

        expect(h.saved()).toEqual(OLD)
        expect(h.log).toEqual([
            "stopSidecar",
            `write:${CONFIG.host}`,
            "restartCloud",
            "probe",
            `write:${OLD.host}`,
            "restartCloud",
            "startSidecar:reset=false",
        ])
    })

    it("leaves nothing configured when the first attempt never answers", async () => {
        const h = harness({reachable: false})

        await expect(h.setup.configure(CONFIG, null)).rejects.toThrow()

        expect(h.saved()).toBeNull()
        expect(h.log.filter((step) => step === "clear")).toHaveLength(1)
    })

    it("brings the sidecar back even when the attempt failed", async () => {
        const h = harness({reachable: false})

        await expect(h.setup.configure(CONFIG, null)).rejects.toThrow()

        expect(h.log.at(-1)).toBe("startSidecar:reset=false")
    })

    // The sidecar is already down by the time the store is asked to save, so every path out of
    // here has to bring it back - an app with no backend cannot read or write a single note.
    it("brings the local backend back when the credential cannot be saved at all", async () => {
        const log: string[] = []
        const setup = createCloudSetup({
            store: {
                read: () => null,
                write: () => {
                    throw new Error("This system has no secure storage available")
                },
                clear: () => log.push("clear"),
                status: () => ({configured: false, host: null}),
            },
            confirm: async () => true,
            stopSidecar: async () => log.push("stopSidecar"),
            startSidecar: async ({resetCursors}: {resetCursors: boolean}) =>
                log.push(`startSidecar:reset=${resetCursors}`),
            restartCloud: async () => log.push("restartCloud"),
            isReachable: async () => true,
        })

        await expect(setup.configure(CONFIG, null)).rejects.toThrow(/no secure storage/)
        expect(log).toEqual(["stopSidecar", "clear", "restartCloud", "startSidecar:reset=false"])
    })

    it("brings the local backend back even when restoring the old database fails too", async () => {
        const log: string[] = []
        let writes = 0
        const setup = createCloudSetup({
            store: {
                read: () => OLD,
                write: () => {
                    writes++
                    throw new Error(writes === 1 ? "ENOSPC" : "ENOSPC on revert")
                },
                clear: () => log.push("clear"),
                status: () => ({configured: true, host: OLD.host}),
            },
            confirm: async () => true,
            stopSidecar: async () => log.push("stopSidecar"),
            startSidecar: async ({resetCursors}: {resetCursors: boolean}) =>
                log.push(`startSidecar:reset=${resetCursors}`),
            restartCloud: async () => log.push("restartCloud"),
            isReachable: async () => true,
        })

        await expect(setup.configure(CONFIG, null)).rejects.toThrow(/ENOSPC/)
        expect(log.at(-1)).toBe("startSidecar:reset=false")
    })

    it("refuses a config the store would not accept, before touching anything", async () => {
        await expect(confirmed.setup.configure({...CONFIG, host: "db.example.com?sslmode=disable"}, null))
            .rejects.toThrow(/Host may only contain/)

        expect(confirmed.log).toEqual([])
    })
})

describe("cloud setup confirmation", () => {
    function declining(saved: Record<string, string> | null = null) {
        const log: string[] = []
        let stored = saved
        const setup = createCloudSetup({
            store: {
                read: () => stored,
                write: () => log.push("write"),
                clear: () => log.push("clear"),
                status: () => (stored ? {configured: true, host: stored.host} : {configured: false, host: null}),
            },
            confirm: async () => false,
            stopSidecar: async () => log.push("stopSidecar"),
            startSidecar: async () => log.push("startSidecar"),
            restartCloud: async () => log.push("restartCloud"),
            isReachable: async () => true,
        })
        return {setup, log}
    }

    it("writes nothing when the user cancels the confirmation", async () => {
        const h = declining()

        expect(await h.setup.configure(CONFIG, null)).toEqual({configured: false, host: null})
        expect(h.log).toEqual([])
    })

    it("keeps syncing when the user cancels a disconnect", async () => {
        const h = declining(OLD)

        expect(await h.setup.clear(null)).toEqual({configured: true, host: OLD.host})
        expect(h.log).toEqual([])
    })

    it("asks with the host masked, never the password", async () => {
        const confirm = vi.fn(async () => false)
        const setup = createCloudSetup({
            store: {read: () => null, write: () => {}, clear: () => {}, status: () => ({configured: false, host: null})},
            confirm,
            stopSidecar: async () => {},
            startSidecar: async () => {},
            restartCloud: async () => {},
            isReachable: async () => true,
        })

        await setup.configure(CONFIG, "context")

        const [context, message, detail] = confirm.mock.calls[0] as unknown as string[]
        expect(context).toBe("context")
        expect(message).toContain("***.supabase.co")
        expect(`${message} ${detail}`).not.toContain(CONFIG.password)
        expect(`${message} ${detail}`).not.toContain("qwertyuiopasdfgh")
    })
})

describe("disconnecting", () => {
    it("resets the cursors so the next database does not inherit them", async () => {
        const h = harness({saved: OLD})

        expect(await h.setup.clear(null)).toEqual({configured: false, host: null})
        expect(h.log).toEqual(["stopSidecar", "clear", "restartCloud", "startSidecar:reset=true"])
    })

    it("does nothing when there is nothing configured", async () => {
        const h = harness()

        expect(await h.setup.clear(null)).toEqual({configured: false, host: null})
        expect(h.log).toEqual([])
    })
})
