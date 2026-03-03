const { contextBridge, ipcRenderer } = require("electron")

function callLocal(method, params) {
    return ipcRenderer.invoke("local:call", { method, params })
}

contextBridge.exposeInMainWorld("noteblock", {
    local: {
        folder: {
            create: (payload) => callLocal("folder.create", payload),
            get: (id) => callLocal("folder.get", { id }),
            update: (payload) => callLocal("folder.update", payload),
            delete: (id) => callLocal("folder.delete", { id }),
        },
        note: {
            create: (payload) => callLocal("note.create", payload),
            get: (id) => callLocal("note.get", { id }),
            update: (payload) => callLocal("note.update", payload),
            delete: (id) => callLocal("note.delete", { id }),
        },
        block: {
            create: (noteId, payload) => callLocal("block.create", { note_id: noteId, ...payload }),
            update: (noteId, blockId, payload) => callLocal("block.update", { note_id: noteId, block_id: blockId, ...payload }),
            delete: (noteId, blockId) => callLocal("block.delete", { note_id: noteId, block_id: blockId }),
        },
        asset: {
            uploadImage: (payload) => callLocal("asset.uploadImage", payload),
        },
    },
})
