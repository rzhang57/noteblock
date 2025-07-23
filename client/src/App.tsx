import './App.css'
import {Sidebar} from "./components/Sidebar";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {MainContentPanel} from "@/components/ContentPanel.tsx";

export default function App() {

    const {selectedNoteId, setSelectedNoteId} = useNoteContext();

    // const handleNoteSelect = {}
    //
    // const handleNavigateRoot = {}
    //
    // const handleFolderToggle = {}
    //
    // const navigateBack = {}
    //
    // const navigateForward = {}

    return (
        <div className="h-screen w-full bg-gray-50 flex flex-col">
            {/* Navigation Header */}

            {/* Main Layout */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <Sidebar/>


                {/* Main Content */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Top Bar */}
                    <div className="border-b p-4 bg-white flex items-center justify-between">
                        <h1 className="text-lg font-semibold text-gray-800">Noteblock</h1>
                        {/* Navigation buttons can go here */}
                    </div>

                    {/* Content Panel */}
                    <div className="flex-1 overflow-auto p-6">
                        {/* Main content will be rendered here */}
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

