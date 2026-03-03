import {describe, expect, it, vi} from "vitest"

vi.mock("./LocalIpcClient", () => ({
    localIpcClient: {
        folder: {
            create: vi.fn().mockResolvedValue({id: "f1"}),
            get: vi.fn().mockResolvedValue({id: "root"}),
            update: vi.fn().mockResolvedValue({id: "f1"}),
            delete: vi.fn().mockResolvedValue({}),
        },
    },
}))

import {localIpcClient} from "./LocalIpcClient"
import {FolderService} from "./FolderService"

describe("FolderService", () => {
    it("routes CRUD calls through local IPC client", async () => {
        await FolderService.createFolder({name: "Work", parent_id: "root"})
        await FolderService.getFolder("root")
        await FolderService.updateFolder({current_id: "f1", name: "Work2"})
        await FolderService.deleteFolder("f1")

        expect(localIpcClient.folder.create).toHaveBeenCalledWith({name: "Work", parent_id: "root"})
        expect(localIpcClient.folder.get).toHaveBeenCalledWith("root")
        expect(localIpcClient.folder.update).toHaveBeenCalledWith({current_id: "f1", name: "Work2"})
        expect(localIpcClient.folder.delete).toHaveBeenCalledWith("f1")
    })
})
