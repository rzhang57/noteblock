import {beforeEach, describe, expect, it, vi} from "vitest"

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()

vi.mock("electron", () => ({
    contextBridge: {exposeInMainWorld},
    ipcRenderer: {invoke},
}))

describe("electron preload bridge", () => {
    beforeEach(() => {
        exposeInMainWorld.mockReset()
        invoke.mockReset()
    })

    it("exposes local API and forwards calls to ipcRenderer.invoke", async () => {
        invoke.mockResolvedValue({id: "root"})
        await import("./preload.js")

        expect(exposeInMainWorld).toHaveBeenCalledTimes(1)
        const [key, api] = exposeInMainWorld.mock.calls[0]
        expect(key).toBe("noteblock")

        await api.local.folder.get("root")
        expect(invoke).toHaveBeenCalledWith("local:call", {
            method: "folder.get",
            params: {id: "root"},
        })
    })
})
