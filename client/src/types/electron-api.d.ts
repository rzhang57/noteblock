export {}

type BlockType = "text" | "canvas" | "image"

declare global {
    interface Window {
        noteblock: {
            local: {
                folder: {
                    create: (payload: { name: string; parent_id: string | null }) => Promise<any>
                    get: (id: string) => Promise<any>
                    update: (payload: { current_id: string; name?: string; parent_id?: string | null }) => Promise<any>
                    delete: (id: string) => Promise<any>
                }
                note: {
                    create: (payload: { title: string; folder_id: string }) => Promise<any>
                    get: (id: string) => Promise<any>
                    update: (payload: { id: string; title?: string; folder_id?: string; blocks?: Array<{ id: string; index: number }> }) => Promise<any>
                    delete: (id: string) => Promise<any>
                }
                block: {
                    create: (noteId: string, payload: { type: BlockType; index: number; content: unknown }) => Promise<any>
                    update: (noteId: string, blockId: string, payload: { type: BlockType; content: unknown }) => Promise<any>
                    delete: (noteId: string, blockId: string) => Promise<any>
                }
                asset: {
                    uploadImage: (payload: { filename: string; data_base64: string }) => Promise<{ url: string }>
                }
            }
        }
    }
}
