import {describe, expect, it, vi} from "vitest"

vi.mock("./LocalIpcClient", () => ({
    localIpcClient: {
        note: {
            get: vi.fn().mockResolvedValue({id: "n1"}),
            create: vi.fn().mockResolvedValue({id: "n1"}),
            update: vi.fn().mockResolvedValue({id: "n1"}),
            delete: vi.fn().mockResolvedValue({}),
        },
        block: {
            create: vi.fn().mockResolvedValue({id: "b1"}),
            update: vi.fn().mockResolvedValue({id: "b1"}),
            delete: vi.fn().mockResolvedValue({}),
        },
        asset: {
            uploadImage: vi.fn().mockResolvedValue({url: "noteblock-image:///img.png"}),
        },
    },
}))

import {localIpcClient} from "./LocalIpcClient"
import {NoteService} from "./NoteService"

describe("NoteService", () => {
    it("maps note.update blocks down to id/index for IPC payload", async () => {
        await NoteService.updateNote({
            id: "note-1",
            title: "T",
            folder_id: "root",
            blocks: [
                {
                    id: "b1",
                    type: "text",
                    index: 2,
                    content: {text: "x"},
                    created_at: "",
                    updated_at: "",
                },
            ],
        })

        expect(localIpcClient.note.update).toHaveBeenCalledWith({
            id: "note-1",
            title: "T",
            folder_id: "root",
            blocks: [{id: "b1", index: 2}],
        })
    })

    it("encodes image upload and returns ipc url", async () => {
        const fakeImage = {
            name: "img.png",
            arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        } as File
        const url = await NoteService.uploadImage(fakeImage)

        expect(localIpcClient.asset.uploadImage).toHaveBeenCalled()
        expect(url).toBe("noteblock-image:///img.png")
    })
})
