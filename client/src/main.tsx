import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import {applyStoredTheme} from "@/theme/useTheme.ts";
import {NoteProvider} from "@/context/NoteContext.tsx";

// import.meta.env.DEV is statically false in a build, so the mock is dropped from the bundle
async function bootstrap() {
    document.documentElement.dataset.platform = navigator.userAgent.includes("Macintosh") ? "mac" : "other";
    applyStoredTheme();
    if (import.meta.env.DEV && !("noteblock" in window)) {
        const {installMockBridge} = await import("./dev/mockBridge.ts");
        installMockBridge();
    }

    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <NoteProvider>
                <App/>
            </NoteProvider>
        </StrictMode>,
    )
}

bootstrap();
