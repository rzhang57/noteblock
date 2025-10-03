import './App.css'
import {Sidebar} from "./components/Sidebar";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {MainContentPanel} from "@/components/ContentPanel.tsx";
import {useState} from "react";

export default function App() {

    const {selectedNoteId} = useNoteContext();
    const [sidebarOpen, setSidebarOpen] = useState(true);

    return (
        <div className="h-screen w-full bg-white flex flex-col">
            <div className="flex flex-1 overflow-hidden">
                <div
                    className={`transition-all duration-300 ${sidebarOpen ? "w-64" : "w-12"} overflow-hidden relative`}>
                    <Sidebar/>
                    <button
                        onClick={() => setSidebarOpen((open) => !open)}
                        aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                    >
                        {sidebarOpen ? "<" : ">"}
                    </button>
                </div>
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-auto p-6">
                        {selectedNoteId ? (
                            <div className="text-gray-800">
                                <MainContentPanel/>
                            </div>
                        ) : (
                            <div className={"flex flex-col items-center justify-center h-full"}>
                                <h3 className="text-xl font-bold text-foreground mb-2 tracking-wide">Welcome to
                                    noteblock</h3>
                                <p className="text-muted-foreground mb-6 text-balance leading-relaxed">
                                    Select a note from the sidebar to start editing, or create a new one to begin your
                                    block-based
                                    note-taking journey.
                                </p>
                            </div>

                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

