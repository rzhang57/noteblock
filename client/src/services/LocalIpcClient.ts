export const localIpcClient = {
    folder: {
        create(payload: { name: string; parent_id: string | null }) {
            return window.noteblock.local.folder.create(payload)
        },
        get(id: string) {
            return window.noteblock.local.folder.get(id)
        },
        update(payload: { current_id: string; name?: string; parent_id?: string | null }) {
            return window.noteblock.local.folder.update(payload)
        },
        delete(id: string) {
            return window.noteblock.local.folder.delete(id)
        },
    },
    note: {
        create(payload: { title: string; folder_id: string }) {
            return window.noteblock.local.note.create(payload)
        },
        get(id: string) {
            return window.noteblock.local.note.get(id)
        },
        update(payload: { id: string; title?: string; folder_id?: string; blocks?: Array<{ id: string; index: number }> }) {
            return window.noteblock.local.note.update(payload)
        },
        delete(id: string) {
            return window.noteblock.local.note.delete(id)
        },
    },
    block: {
        create(noteId: string, payload: { type: "text" | "canvas" | "image"; index: number; content: unknown }) {
            return window.noteblock.local.block.create(noteId, payload)
        },
        update(noteId: string, blockId: string, payload: { type: "text" | "canvas" | "image"; content: unknown }) {
            return window.noteblock.local.block.update(noteId, blockId, payload)
        },
        delete(noteId: string, blockId: string) {
            return window.noteblock.local.block.delete(noteId, blockId)
        },
    },
    asset: {
        uploadImage(payload: { filename: string; data_base64: string }) {
            return window.noteblock.local.asset.uploadImage(payload)
        },
    },
}
