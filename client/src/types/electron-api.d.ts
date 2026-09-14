export {}

import type {BlockType} from "./Note"

declare global {
    interface Window {
        noteblock: {
            local: {
                folder: {
                    create: (payload: { name: string; parent_id: string | null }) => Promise<any>
                    get: (id: string) => Promise<any>
                    tree: () => Promise<any>
                    update: (payload: { current_id: string; name?: string; parent_id?: string | null }) => Promise<any>
                    delete: (id: string) => Promise<any>
                }
                note: {
                    create: (payload: { title: string; folder_id: string | null }) => Promise<any>
                    get: (id: string) => Promise<any>
                    update: (payload: { id: string; title?: string; folder_id?: string | null; blocks?: Array<{ id: string; index: number }> }) => Promise<any>
                    delete: (id: string) => Promise<any>
                }
                block: {
                    create: (noteId: string, payload: { type: BlockType; index: number; content: unknown }) => Promise<any>
                    update: (noteId: string, blockId: string, payload: { type: BlockType; content: unknown }) => Promise<any>
                    delete: (noteId: string, blockId: string) => Promise<any>
                }
                sync: {
                    focus: (noteId: string | null) => Promise<{ note_id: string }>
                }
                asset: {
                    uploadImage: (payload: { filename: string; data_base64: string }) => Promise<{ url: string }>
                }
            }
            cloud: {
                configure: (config: CloudDatabaseConfig) => Promise<CloudStatus>
                status: () => Promise<CloudStatus>
                clear: () => Promise<CloudStatus>
            }
        }
    }
}

export interface CloudDatabaseConfig {
    host: string
    port: string
    database: string
    user: string
    password: string
    schema: string
}

// The password is write-only across the bridge; only whether one is set and a masked host come back.
export interface CloudStatus {
    configured: boolean
    host: string | null
}
