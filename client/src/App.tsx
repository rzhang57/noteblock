import './App.css'
import {Sidebar} from "./components/Sidebar";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {MainContentPanel} from "@/components/ContentPanel.tsx";

export default function App() {

    const {selectedNoteId} = useNoteContext();

    return (
        <div className="h-screen w-full bg-gray-50 flex flex-col">
            {/* Navigation Header */}

            {/* Main Layout */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <Sidebar/>


                {/* Main Content */}
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

