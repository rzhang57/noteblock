import React from "react";

interface NoteContextType {
    selectedNoteId: string | undefined | null;
    setSelectedNoteId: (id: string | null) => void;
    noteTitle: string | undefined | null;
    setNoteTitle: (title: string) => void;
}

const NoteContext = React.createContext<NoteContextType | undefined>(undefined);

export const NoteProvider: React.FC<React.PropsWithChildren> = ({children}) => {
    const [selectedNoteId, setSelectedNoteId] = React.useState<string | null>(null);
    const [noteTitle, setNoteTitle] = React.useState<string | undefined>(undefined);

    return (
        <NoteContext.Provider value={{selectedNoteId, setSelectedNoteId, noteTitle, setNoteTitle}}>
            {children}
        </NoteContext.Provider>
    );
}

export const useNoteContext = (): NoteContextType => {
    const context = React.useContext(NoteContext);
    if (!context) {
        throw new Error("useNoteContext must be used within a NoteProvider");
    }
    return context;
}