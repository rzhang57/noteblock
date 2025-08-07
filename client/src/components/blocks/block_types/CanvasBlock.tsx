import React, {useRef, useEffect, useState} from 'react';
import {Stage, Layer, Line} from 'react-konva';
import type {Block} from '@/types/Note';
import {NoteService} from '@/services/NoteService';
import {useNoteContext} from '@/context/NoteContext';

interface CanvasBlockProps {
    block: Block;
}

interface Stroke {
    points: number[];
    color: string;
    width: number;
    id: string;
}

interface CanvasContent {
    strokes: Stroke[];
    width: number;
    height: number;
}

export const CanvasBlock: React.FC<CanvasBlockProps> = ({block}) => {
    const {selectedNoteId} = useNoteContext();
    const [isDrawing, setIsDrawing] = useState(false);
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
    const [strokeColor, setStrokeColor] = useState('#000000');
    const [strokeWidth, setStrokeWidth] = useState(2);
    const stageRef = useRef<any>(null);

    const canvasWidth = 800;
    const canvasHeight = 400;

    // Parse existing canvas content on mount
    useEffect(() => {
        if (block.content) {
            try {
                const contentString = JSON.stringify(block.content);
                const canvasContent: CanvasContent = JSON.parse(contentString);
                setStrokes(canvasContent.strokes || []);
            } catch (err) {
                console.error('Failed to parse canvas content:', err);
                setStrokes([]);
            }
        }
    }, [block.content]);

    // Save strokes to backend
    const saveCanvas = async () => {
        if (!selectedNoteId) return;

        const canvasContent: CanvasContent = {
            strokes,
            width: canvasWidth,
            height: canvasHeight
        };

        try {
            await NoteService.updateBlock(selectedNoteId, block.id, {
                type: "canvas",
                content: canvasContent
            });
        } catch (err) {
            console.error('Failed to save canvas:', err);
        }
    };

    // Auto-save after strokes change
    useEffect(() => {
        if (strokes.length > 0) {
            const timeoutId = setTimeout(saveCanvas, 1000);
            return () => clearTimeout(timeoutId);
        }
    }, [strokes]);

    const handleMouseDown = (e: any) => {
        if (!stageRef.current) return;

        setIsDrawing(true);
        const pos = e.target.getStage().getPointerPosition();
        const newStroke: Stroke = {
            points: [pos.x, pos.y],
            color: strokeColor,
            width: strokeWidth,
            id: `stroke_${Date.now()}_${Math.random()}`
        };
        setCurrentStroke(newStroke);
    };

    const handleMouseMove = (e: any) => {
        if (!isDrawing || !currentStroke || !stageRef.current) return;

        const stage = e.target.getStage();
        const point = stage.getPointerPosition();
        const newPoints = currentStroke.points.concat([point.x, point.y]);

        setCurrentStroke({
            ...currentStroke,
            points: newPoints
        });
    };

    const handleMouseUp = () => {
        if (!isDrawing || !currentStroke) return;

        setIsDrawing(false);
        setStrokes(prevStrokes => [...prevStrokes, currentStroke]);
        setCurrentStroke(null);
    };

    const clearCanvas = () => {
        setStrokes([]);
        setCurrentStroke(null);
    };

    const undoLastStroke = () => {
        setStrokes(prevStrokes => prevStrokes.slice(0, -1));
    };

    return (
        <div className="border rounded-lg p-4 bg-white">
            {/* Canvas Controls */}
            <div className="flex items-center gap-4 mb-4 p-2 bg-gray-50 rounded">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Color:</label>
                    <input
                        type="color"
                        value={strokeColor}
                        onChange={(e) => setStrokeColor(e.target.value)}
                        className="w-8 h-8 border rounded cursor-pointer"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Size:</label>
                    <input
                        type="range"
                        min="1"
                        max="20"
                        value={strokeWidth}
                        onChange={(e) => setStrokeWidth(Number(e.target.value))}
                        className="w-20"
                    />
                    <span className="text-sm w-6">{strokeWidth}</span>
                </div>

                <button
                    onClick={undoLastStroke}
                    disabled={strokes.length === 0}
                    className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 disabled:opacity-50 rounded"
                >
                    Undo
                </button>

                <button
                    onClick={clearCanvas}
                    disabled={strokes.length === 0}
                    className="px-3 py-1 text-sm bg-red-200 hover:bg-red-300 disabled:opacity-50 rounded"
                >
                    Clear
                </button>
            </div>

            {/* Konva Canvas */}
            <div className="border border-gray-300 rounded overflow-hidden">
                <Stage
                    width={canvasWidth}
                    height={canvasHeight}
                    onMouseDown={handleMouseDown}
                    onMousemove={handleMouseMove}
                    onMouseup={handleMouseUp}
                    ref={stageRef}
                    className="cursor-crosshair"
                >
                    <Layer>
                        {/* Render saved strokes */}
                        {strokes.map((stroke) => (
                            <Line
                                key={stroke.id}
                                points={stroke.points}
                                stroke={stroke.color}
                                strokeWidth={stroke.width}
                                tension={0.5}
                                lineCap="round"
                                lineJoin="round"
                                globalCompositeOperation="source-over"
                            />
                        ))}

                        {/* Render current stroke being drawn */}
                        {currentStroke && (
                            <Line
                                points={currentStroke.points}
                                stroke={currentStroke.color}
                                strokeWidth={currentStroke.width}
                                tension={0.5}
                                lineCap="round"
                                lineJoin="round"
                                globalCompositeOperation="source-over"
                            />
                        )}
                    </Layer>
                </Stage>
            </div>
        </div>
    );
};