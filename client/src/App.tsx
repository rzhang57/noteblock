import {useCallback, useState, type CSSProperties} from "react";
import {Sidebar} from "./components/Sidebar";
import {SettingsSheet} from "@/components/settings/SettingsSheet.tsx";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {MainContentPanel} from "@/components/ContentPanel.tsx";
import {NoteEmptyState} from "@/components/NoteEmptyState.tsx";
import {DragRegion} from "@/components/window/DragRegion.tsx";
import {NewItemButton} from "@/components/window/NewItemButton.tsx";
import {SidebarToggle} from "@/components/window/SidebarToggle.tsx";
import {requestNewItem, type NewItemKind} from "@/components/window/createItem.ts";
import {useCommandKey} from "@/components/window/useCommandKey.ts";
import {useSidebarLayout} from "@/components/window/useSidebarLayout.ts";

export default function App() {
    const {selectedNoteId} = useNoteContext();
    const sidebar = useSidebarLayout();
    const {reveal} = sidebar;
    const createItem = useCallback((kind: NewItemKind) => {
        reveal();
        requestNewItem(kind);
    }, [reveal]);
    const newNote = useCallback(() => createItem("note"), [createItem]);
    useCommandKey("n", newNote);
    const [showSettings, setShowSettings] = useState(false);
    const openSettings = useCallback(() => setShowSettings(true), []);
    useCommandKey(",", openSettings);

    return (
        <div
            className="window"
            data-sidebar={sidebar.open ? "open" : "closed"}
            data-resizing={sidebar.resizing || undefined}
            style={{"--sidebar-width": `${sidebar.width}px`} as CSSProperties}
        >
            <aside className="sidebar-pane" inert={!sidebar.open}>
                <Sidebar onOpenSettings={openSettings}/>
            </aside>
            <main className="reader">
                <DragRegion/>
                <div className="reader-scroll">
                    {selectedNoteId ? <MainContentPanel/> : <NoteEmptyState onNewNote={newNote}/>}
                </div>
            </main>
            {sidebar.open && (
                <div className="sidebar-resize-handle" style={{left: sidebar.width - 3}} onMouseDown={sidebar.startResize}/>
            )}
            <SidebarToggle open={sidebar.open} onToggle={sidebar.toggle}/>
            <NewItemButton onCreate={createItem}/>
            {showSettings && <SettingsSheet onClose={() => setShowSettings(false)}/>}
        </div>
    );
}
