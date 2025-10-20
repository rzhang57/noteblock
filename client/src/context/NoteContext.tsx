import {createContext, useState, useContext, type ReactNode, useEffect} from 'react';
import {NoteService} from "@/services/NoteService.ts";

interface NoteContextType {
    selectedNoteId: string | null;
    setSelectedNoteId: (id: string | null) => void;
    noteTitle: string | null;
    setNoteTitle: (title: string) => void;
}

const NoteContext = createContext<NoteContextType | undefined>(undefined);

export const NoteProvider = ({children}: { children: ReactNode }) => {
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(() => {
        return localStorage.getItem('selectedNoteId');
    });
    const [noteTitle, setNoteTitle] = useState<string | null>(null);

    useEffect(() => {
        if (selectedNoteId) {
            localStorage.setItem('selectedNoteId', selectedNoteId);
            NoteService.getNote(selectedNoteId)
                .then(note => setNoteTitle(note.title))
                .catch(err => {
                    console.error("Failed to fetch note title:", err);
                    setNoteTitle(null);
                    setSelectedNoteId(null);
                    localStorage.removeItem('selectedNoteId');
                });
        } else {
            localStorage.removeItem('selectedNoteId');
            setNoteTitle(null);
        }
    }, [selectedNoteId]);

    return (
        <NoteContext.Provider value={{selectedNoteId, setSelectedNoteId, noteTitle, setNoteTitle}}>
            {children}
        </NoteContext.Provider>
    );
};

export const useNoteContext = () => {
    const context = useContext(NoteContext);
    if (context === undefined) {
        throw new Error('useNoteContext must be used within a NoteProvider');
    }
    return context;
};