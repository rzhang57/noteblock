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
    elements: OrderedExcalidrawElement[];
    appState?: Partial<AppState>;
    files?: BinaryFiles;
}

export const ExcalidrawBlock: React.FC<ExcalidrawBlockProps> = ({block}) => {
    const {selectedNoteId} = useNoteContext();
    const [initialData, setInitialData] = useState<ExcalidrawContent | null>(null);
    const saveTimeout = useRef<number | null>(null);

    useEffect(() => {
        if (block.content) {
            try {
                const data = block.content as unknown as ExcalidrawContent;

                setInitialData({
                    elements: data.elements || [],
                    appState: data.appState || {},
                    files: data.files || {},
                });
            } catch (error) {
                console.error('Error loading Excalidraw data:', error);
                setInitialData({
                    elements: [],
                    appState: {},
                    files: {},
                });
            }
        } else {
            setInitialData({
                elements: [],
                appState: {},
                files: {},
            });
        }
    }, [block.content]);

    const handleChange = useCallback((elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
        if (!selectedNoteId) return;

        if (saveTimeout.current) {
            clearTimeout(saveTimeout.current);
        }

        saveTimeout.current = window.setTimeout(async () => {
            try {
                // Send as object, backend will stringify it
                await NoteService.updateBlock(selectedNoteId, block.id, {
                    type: "canvas",
                    content: {
                        elements: elements,
                        appState: {
                            viewBackgroundColor: appState.viewBackgroundColor,
                            currentItemRoundness: appState.currentItemRoundness,
                            currentItemStrokeWidth: appState.currentItemStrokeWidth,
                            // Don't save collaborators or other runtime state
                        },
                        files: files,
                    },
                });
            } catch (error) {
                console.error('Error saving Excalidraw data:', error);
            }
        }, 1000);
    }, [selectedNoteId, block.id]);

    return (
        <div style={{height: "800px", width: "100%", backgroundColor: "white"}}>
            {initialData && (
                <Excalidraw
                    initialData={initialData}
                    onChange={handleChange}
                />
            )}
        </div>
    );
};