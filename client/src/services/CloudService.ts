import type {CloudDatabaseConfig, CloudStatus} from "@/types/electron-api";

// The cloud database is configured in the Electron main process, not the sidecar: only the cloud
// service needs the credential, and main is the only place it is ever held.
export const CloudService = {
    async status(): Promise<CloudStatus> {
        return window.noteblock.cloud.status();
    },

    async configure(config: CloudDatabaseConfig): Promise<CloudStatus> {
        return window.noteblock.cloud.configure(config);
    },

    async clear(): Promise<CloudStatus> {
        return window.noteblock.cloud.clear();
    },
};
