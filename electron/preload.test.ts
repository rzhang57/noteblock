import {readFileSync} from "node:fs"
import {beforeAll, beforeEach, describe, expect, it, vi} from "vitest"

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()

// preload.js is CommonJS loaded by Electron, not by Vite: its `require("electron")` never reaches
// vi.mock, so the file is evaluated here with the require it will actually be given.
function loadPreload() {
    const source = readFileSync(new URL("./preload.js", import.meta.url), "utf8")
    const stubRequire = (id: string) => {
        if (id !== "electron") throw new Error(`preload must not require ${id}`)
        return {contextBridge: {exposeInMainWorld}, ipcRenderer: {invoke}}
    }
    const module = {exports: {}}
    new Function("require", "module", "exports", source)(stubRequire, module, module.exports)
}

type CloudBridge = {
    configure: (config: Record<string, string>) => Promise<unknown>
    status: () => Promise<unknown>
    clear: () => Promise<unknown>
}

type Bridge = {
    local: {folder: {get: (id: string) => Promise<unknown>}}
    cloud: CloudBridge
}

describe("electron preload bridge", () => {
    let api: Bridge

    beforeAll(() => {
        loadPreload()
        expect(exposeInMainWorld).toHaveBeenCalledTimes(1)
        const [key, exposed] = exposeInMainWorld.mock.calls[0]
        expect(key).toBe("noteblock")
        api = exposed
    })

    beforeEach(() => {
        invoke.mockReset()
    })

    it("exposes local API and forwards calls to ipcRenderer.invoke", async () => {
        invoke.mockResolvedValue({id: "root"})

        await api.local.folder.get("root")

        expect(invoke).toHaveBeenCalledWith("local:call", {
            method: "folder.get",
            params: {id: "root"},
        })
    })

    // The password crosses this boundary once, inbound. A getter added here would put it back in
    // reach of any script running in the renderer.
    it("gives the renderer no way to read the cloud credential back", () => {
        expect(Object.keys(api.cloud).sort()).toEqual(["clear", "configure", "status"])
    })

    it("sends the connection details on their own channel, not through local:call", async () => {
        invoke.mockResolvedValue({configured: true, host: "***.supabase.co"})
        const config = {
            host: "db.example.supabase.co",
            port: "5432",
            database: "postgres",
            user: "noteblock_sync",
            password: "hunter2",
            schema: "public",
        }

        await api.cloud.configure(config)

        expect(invoke).toHaveBeenCalledWith("cloud:configure", config)
        expect(invoke).toHaveBeenCalledTimes(1)
    })

    it("asks for status and clears without sending a payload", async () => {
        invoke.mockResolvedValue({configured: false, host: null})

        await api.cloud.status()
        await api.cloud.clear()

        expect(invoke.mock.calls).toEqual([["cloud:status"], ["cloud:clear"]])
    })
})
