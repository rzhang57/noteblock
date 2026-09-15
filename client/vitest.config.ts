import {defineConfig, mergeConfig} from "vitest/config"
import viteConfig from "./vite.config"

// electron/ is outside this root but inside the client CI path filter, so its tests only ever run
// if they are named here.
export default mergeConfig(viteConfig, defineConfig({
    test: {
        include: ["src/**/*.test.{ts,tsx}", "../electron/**/*.test.ts"],
    },
}))
