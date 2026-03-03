import {beforeEach, describe, expect, it, vi} from "vitest"
import {localIpcClient} from "./LocalIpcClient"

describe("LocalIpcClient", () => {
    beforeEach(() => {
        ;(globalThis as any).window = {
            noteblock: {
                local: {
                    folder: {
                        create: vi.fn().mockResolvedValue({id: "f1"}),
                        get: vi.fn().mockResolvedValue({id: "root"}),
                        update: vi.fn().mockResolvedValue({id: "f1", name: "Updated"}),
                        delete: vi.fn().mockResolvedValue({}),
                    },
                    note: {
                        create: vi.fn().mockResolvedValue({id: "n1"}),
                        get: vi.fn().mockResolvedValue({id: "n1"}),
                        update: vi.fn().mockResolvedValue({id: "n1"}),
                        delete: vi.fn().mockResolvedValue({}),
                    },
                    block: {
                        create: vi.fn().mockResolvedValue({id: "b1"}),
                        update: vi.fn().mockResolvedValue({id: "b1"}),
                        delete: vi.fn().mockResolvedValue({}),
                    },
                    asset: {
                        uploadImage: vi.fn().mockResolvedValue({url: "noteblock-image:///x.png"}),
                    },
                },
            },
        }
    })

    it("forwards folder and note requests to preload APIs", async () => {
        await localIpcClient.folder.get("root")
        await localIpcClient.note.create({title: "A", folder_id: "root"})

        expect(window.noteblock.local.folder.get).toHaveBeenCalledWith("root")
        expect(window.noteblock.local.note.create).toHaveBeenCalledWith({title: "A", folder_id: "root"})
    })

    it("forwards block/image requests to preload APIs", async () => {
        await localIpcClient.block.update("n1", "b1", {type: "text", content: {text: "x"}})
        await localIpcClient.asset.uploadImage({filename: "x.png", data_base64: "AQID"})

        expect(window.noteblock.local.block.update).toHaveBeenCalledWith("n1", "b1", {type: "text", content: {text: "x"}})
        expect(window.noteblock.local.asset.uploadImage).toHaveBeenCalledWith({filename: "x.png", data_base64: "AQID"})
    })
})
