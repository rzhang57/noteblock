import {beforeEach, describe, expect, it, vi} from "vitest"
import {CloudService} from "./CloudService"

const CONFIG = {
    host: "db.example.supabase.co",
    port: "5432",
    database: "postgres",
    user: "noteblock_sync",
    password: "placeholder-not-a-real-password",
    schema: "public",
}

describe("CloudService", () => {
    let cloud: {configure: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn>}

    beforeEach(() => {
        cloud = {
            configure: vi.fn().mockResolvedValue({configured: true, host: "***.supabase.co"}),
            status: vi.fn().mockResolvedValue({configured: true, host: "***.supabase.co"}),
            clear: vi.fn().mockResolvedValue({configured: false, host: "cleared-sentinel"}),
        }
        ;(globalThis as any).window = {noteblock: {cloud}}
    })

    it("sends the connection details to the main process unaltered", async () => {
        const status = await CloudService.configure({...CONFIG})

        expect(cloud.configure).toHaveBeenCalledWith(CONFIG)
        expect(status).toEqual({configured: true, host: "***.supabase.co"})
    })

    // Configuring is a restart of the cloud service, not a local write: a rejection has to surface
    // so the dialog can say the database refused the connection.
    it("propagates a refused connection rather than reporting success", async () => {
        cloud.configure.mockRejectedValue(new Error("Saved, but the database did not accept the connection."))

        await expect(CloudService.configure({...CONFIG})).rejects.toThrow(/did not accept the connection/)
    })

    // Distinctive values: a wrapper that returned a plausible default instead of the bridge result
    // would pass against {configured: false, host: null}.
    it("reads status through the bridge", async () => {
        expect(await CloudService.status()).toEqual({configured: true, host: "***.supabase.co"})
        expect(cloud.status).toHaveBeenCalledWith()
    })

    it("clears through the bridge", async () => {
        expect(await CloudService.clear()).toEqual({configured: false, host: "cleared-sentinel"})
        expect(cloud.clear).toHaveBeenCalledWith()
    })
})
