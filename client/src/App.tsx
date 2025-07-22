import {useCallback, useState} from 'react'
import './App.css'
import {NotebookSidebar} from "./components/Sidebar";

export default function App() {

    const handleNoteSelect = {}

    const handleNavigateRoot = {}

    const handleFolderToggle = {}

    const navigateBack = {}

    const navigateForward = {}

    return (
        <div className="h-screen w-full bg-gray-50 flex flex-col">
            {/* Navigation Header */}

            {/* Main Layout */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <NotebookSidebar selectedNoteId={null} onNoteSelect={function (noteId: string): void {
                    console.log("Selected note ID:", noteId);
                }}/>


                {/* Main Content */}
            </div>
        </div>
    )
}

