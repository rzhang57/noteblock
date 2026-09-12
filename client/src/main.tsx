import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import {NoteProvider} from "@/context/NoteContext.tsx";

// import.meta.env.DEV is statically false in a build, so the mock is dropped from the bundle
async function bootstrap() {
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
