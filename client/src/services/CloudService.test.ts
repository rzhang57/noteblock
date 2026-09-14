import {beforeEach, describe, expect, it, vi} from "vitest"
import {CloudService} from "./CloudService"

describe("CloudService", () => {
    beforeEach(() => {
        ;(globalThis as any).window = {
            noteblock: {
                cloud: {
                    configure: vi.fn().mockResolvedValue({configured: true, host: "db.***.supabase.co"}),
                    status: vi.fn().mockResolvedValue({configured: false, host: null}),
                    clear: vi.fn().mockResolvedValue({configured: false, host: null}),
                },
            },
        }
    })

    it("sends the connection details to the main process", async () => {
        const config = {
            host: "db.example.supabase.co",
            port: "5432",
            database: "postgres",
            user: "noteblock_sync",
            password: "hunter2",
            schema: "public",
        }

        const status = await CloudService.configure(config)

        expect(window.noteblock.cloud.configure).toHaveBeenCalledWith(config)
        expect(status.configured).toBe(true)
    })

    // The password is write-only across the bridge: nothing the renderer can call returns it.
    it("never receives the password back", async () => {
        const status = await CloudService.status()

        expect(Object.keys(status)).toEqual(["configured", "host"])
        expect(JSON.stringify(status)).not.toContain("hunter2")
    })
})
