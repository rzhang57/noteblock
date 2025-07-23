// TODO: holds context for currently open note - metadata and blocks

import React from "react";

interface NoteContextType {
    selectedNoteId: string | null;
    setSelectedNoteId: (id: string | null) => void;
}

const NoteContext = React.createContext<NoteContextType | undefined>(undefined);

export const NoteProvider: React.FC<React.PropsWithChildren> = ({children}) => {
    const [selectedNoteId, setSelectedNoteId] = React.useState<string | null>(null);

    return (
        <NoteContext.Provider value={{selectedNoteId, setSelectedNoteId}}>
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