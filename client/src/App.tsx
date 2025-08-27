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
                            <p className="text-gray-500">Select a note to view its content.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

