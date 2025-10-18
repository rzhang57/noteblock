import React, {} from 'react';
import type {Block} from '@/types/Note';
import {Excalidraw} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

interface CanvasBlockProps {
    block: Block;
}

export const ExcalidrawBlock: React.FC<CanvasBlockProps> = ({block}) => {
    return (
        <div style={{height: "800px", width: "100%", maxWidth: "100%"}}>
            <Excalidraw/>
        </div>
    );
};