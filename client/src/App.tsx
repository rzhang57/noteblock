import './App.css'
import {Sidebar} from "./components/Sidebar";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {MainContentPanel} from "@/components/ContentPanel.tsx";
import {NoteEmptyState} from "@/components/NoteEmptyState.tsx";

export default function App() {
    const {selectedNoteId} = useNoteContext();

    return (
        <div className="flex h-screen w-full flex-col bg-background">
            <div className="flex flex-1 overflow-hidden">
                <Sidebar/>
                <div className="flex flex-1 flex-col overflow-hidden">
                    <div className="flex-1 overflow-auto">
                        {selectedNoteId ? (
                            <div className="text-ink">
                                <MainContentPanel/>
                            </div>
                        ) : (
                            <NoteEmptyState/>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
