import {describe, expect, it, vi} from "vitest"

vi.mock("./LocalIpcClient", () => ({
    localIpcClient: {
        folder: {
            create: vi.fn().mockResolvedValue({id: "f1"}),
            get: vi.fn().mockResolvedValue({id: "f1"}),
            tree: vi.fn().mockResolvedValue({id: "", parent_id: null, children: [], notes: []}),
            update: vi.fn().mockResolvedValue({id: "f1"}),
            delete: vi.fn().mockResolvedValue({}),
        },
    },
}))

import {localIpcClient} from "./LocalIpcClient"
import {FolderService} from "./FolderService"

describe("FolderService", () => {
    it("routes CRUD calls through local IPC client", async () => {
        await FolderService.createFolder({name: "Work", parent_id: null})
        await FolderService.getFolder("f1")
        await FolderService.updateFolder({current_id: "f1", name: "Work2"})
        await FolderService.deleteFolder("f1")

        expect(localIpcClient.folder.create).toHaveBeenCalledWith({name: "Work", parent_id: null})
        expect(localIpcClient.folder.get).toHaveBeenCalledWith("f1")
        expect(localIpcClient.folder.update).toHaveBeenCalledWith({current_id: "f1", name: "Work2"})
        expect(localIpcClient.folder.delete).toHaveBeenCalledWith("f1")
    })

    it("asks for a synthesized tree rather than a folder with a magic id", async () => {
        const tree = await FolderService.getTree()

        expect(localIpcClient.folder.tree).toHaveBeenCalledWith()
        expect(tree.parent_id).toBeNull()
    })
})
