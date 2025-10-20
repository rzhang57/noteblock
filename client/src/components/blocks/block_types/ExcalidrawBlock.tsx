import React, {useEffect, useState, useCallback, useRef} from "react";
import {Excalidraw} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {Block} from "@/types/Note";
import {NoteService} from "@/services/NoteService";
import {useNoteContext} from "@/context/NoteContext";
import type {AppState, BinaryFiles} from "@excalidraw/excalidraw/types";
import type {OrderedExcalidrawElement} from "@excalidraw/excalidraw/element/types";

interface ExcalidrawBlockProps {
    block: Block;
}

interface ExcalidrawContent {
    elements: readonly OrderedExcalidrawElement[];
    appState?: Partial<AppState>;
    files?: BinaryFiles;
}

export const ExcalidrawBlock: React.FC<ExcalidrawBlockProps> = ({block}) => {
    const {selectedNoteId} = useNoteContext();
    const [excalidrawState, setExcalidrawState] = useState<ExcalidrawContent | null>(null);
    const saveTimeout = useRef<number | null>(null);
    const [layoutKey, setLayoutKey] = useState(0);
    const hasUnsavedChanges = useRef(false);
    const latestContentRef = useRef<ExcalidrawContent | null>(null);

    const saveContent = useCallback(async (content: ExcalidrawContent | null) => {
        if (!selectedNoteId || !content || !hasUnsavedChanges.current) return;

        try {
            await NoteService.updateBlock(selectedNoteId, block.id, {
                type: "canvas",
                content: content,
            });
            hasUnsavedChanges.current = false;
        } catch (error) {
            console.error('Error saving Excalidraw data:', error);
        }
    }, [selectedNoteId, block.id]);

    useEffect(() => {
        const handleLayoutChange = () => {
            setTimeout(() => {
                setLayoutKey(prev => prev + 1);
            }, 350);
        };

        window.addEventListener('resize', handleLayoutChange);
        window.addEventListener('sidebarToggle', handleLayoutChange);

        return () => {
            window.removeEventListener('resize', handleLayoutChange);
            window.removeEventListener('sidebarToggle', handleLayoutChange);
        };
    }, []);

    useEffect(() => {
        let data: ExcalidrawContent;
        if (block.content) {
            try {
                data = block.content as unknown as ExcalidrawContent;
            } catch (error) {
                console.error('Error loading Excalidraw data:', error);
                data = {elements: [], appState: {}, files: {}};
            }
        } else {
            data = {elements: [], appState: {}, files: {}};
        }
        setExcalidrawState(data);
        latestContentRef.current = data;
        hasUnsavedChanges.current = false;
    }, [block.content]);

    useEffect(() => {
        // Cleanup function to save on unmount
        return () => {
            if (saveTimeout.current) {
                clearTimeout(saveTimeout.current);
            }
            saveContent(latestContentRef.current);
        };
    }, [saveContent]);

    const handleChange = useCallback((elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
        const currentContent: ExcalidrawContent = {
            elements: elements,
            appState: {
                viewBackgroundColor: appState.viewBackgroundColor,
                currentItemRoundness: appState.currentItemRoundness,
                currentItemStrokeWidth: appState.currentItemStrokeWidth,
            },
            files: files,
        };
        setExcalidrawState(currentContent);
        latestContentRef.current = currentContent;
        hasUnsavedChanges.current = true;

        if (saveTimeout.current) {
            clearTimeout(saveTimeout.current);
        }

        saveTimeout.current = window.setTimeout(() => {
            saveContent(currentContent);
        }, 1000);
    }, [saveContent]);

    return (
        <div style={{height: "800px", width: "100%", backgroundColor: "white"}}>
            {excalidrawState && (
                <Excalidraw
                    key={layoutKey}
                    initialData={excalidrawState}
                    onChange={handleChange}
                />
            )}
        </div>
    );
};