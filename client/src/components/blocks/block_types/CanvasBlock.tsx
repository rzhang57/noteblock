import React, {
    useRef,
    useEffect,
    useState,
    useCallback
} from 'react';
import {
    Stage,
    Layer,
    Line,
    Rect,
    Ellipse,
    Text,
    Transformer
} from 'react-konva';
import type {Block} from '@/types/Note';
import {NoteService} from '@/services/NoteService';
import {useNoteContext} from '@/context/NoteContext';

interface CanvasBlockProps {
    block: Block;
}

type Tool = 'pen' | 'eraser' | 'rect' | 'ellipse' | 'text' | 'select';

interface BaseStroke {
    id: string;
    color: string;
    width: number;
    tool: Tool;
}

interface FreehandStroke extends BaseStroke {
    tool: 'pen' | 'eraser';
    points: number[];
}

interface RectShape extends BaseStroke {
    tool: 'rect';
    x: number;
    y: number;
    w: number;
    h: number;
}

interface EllipseShape extends BaseStroke {
    tool: 'ellipse';
    x: number;
    y: number;
    rx: number;
    ry: number;
}

interface TextShape extends BaseStroke {
    tool: 'text';
    x: number;
    y: number;
    text: string;
    fontSize: number;
}

type Stroke = FreehandStroke | RectShape | EllipseShape | TextShape;

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
    const [tool, setTool] = useState<Tool>('pen');
    const stageRef = useRef<any>(null);
    const saveTimeoutRef = useRef<number | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const transformerRef = useRef<any>(null);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const selectionStart = useRef<{ x: number; y: number } | null>(null);
    const [selectionRect, setSelectionRect] = useState<{
        x: number;
        y: number;
        w: number;
        h: number;
        visible: boolean
    }>({
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        visible: false
    });

    const canvasWidth = 800;
    const canvasHeight = 450;

    useEffect(() => {
        if (!block.content) {
            setStrokes([]);
            return;
        }
        try {
            let parsed: any = block.content;
            if (typeof block.content === 'string') parsed = JSON.parse(block.content);
            if (parsed && Array.isArray(parsed.strokes)) setStrokes(parsed.strokes);
            else setStrokes([]);
        } catch {
            setStrokes([]);
        }
    }, [block.content]);

    const persist = useCallback(
        async (data: Stroke[]) => {
            if (!selectedNoteId) return;
            const payload: CanvasContent = {strokes: data, width: canvasWidth, height: canvasHeight};
            try {
                await NoteService.updateBlock(selectedNoteId, block.id, {
                    type: 'canvas',
                    content: payload
                });
            } catch (e) {
                console.error('Failed to save canvas:', e);
            }
        },
        [selectedNoteId, block.id]
    );

    useEffect(() => {
        if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = window.setTimeout(() => {
            persist(strokes);
        }, 600);
        return () => {
            if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
        };
    }, [strokes, persist]);

    const startFreehand = (x: number, y: number): FreehandStroke => ({
        id: `stroke_${Date.now()}_${Math.random()}`,
        tool: tool === 'eraser' ? 'eraser' : 'pen',
        color: tool === 'eraser' ? 'rgba(0,0,0,1)' : strokeColor,
        width: strokeWidth,
        points: [x, y]
    });

    const startRect = (x: number, y: number): RectShape => ({
        id: `rect_${Date.now()}_${Math.random()}`,
        tool: 'rect',
        color: strokeColor,
        width: strokeWidth,
        x,
        y,
        w: 0,
        h: 0
    });

    const startEllipse = (x: number, y: number): EllipseShape => ({
        id: `ellipse_${Date.now()}_${Math.random()}`,
        tool: 'ellipse',
        color: strokeColor,
        width: strokeWidth,
        x,
        y,
        rx: 0,
        ry: 0
    });

    const createText = (x: number, y: number): TextShape => ({
        id: `text_${Date.now()}_${Math.random()}`,
        tool: 'text',
        color: strokeColor,
        width: 1,
        x,
        y,
        text: '',
        fontSize: 20
    });

    const commitStroke = (stroke: Stroke | null) => {
        if (!stroke) return;
        if ((stroke as any).points && (stroke as FreehandStroke).points.length < 4) return;
        setStrokes(prev => [...prev, stroke]);
    };

    const setSingleSelection = (id: string | null) => {
        setSelectedIds(id ? [id] : []);
    };
    const toggleSelection = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleMouseDown = (e: any) => {
        if (!stageRef.current) return;
        const stage = e.target.getStage();
        const pos = stage.getPointerPosition();
        if (!pos) return;

        if (tool === 'select') {
            if (e.target === stage) {
                setEditingTextId(null);
                setIsSelecting(true);
                selectionStart.current = {x: pos.x, y: pos.y};
                setSelectionRect({x: pos.x, y: pos.y, w: 0, h: 0, visible: true});
                if (!e.evt.shiftKey) setSingleSelection(null);
            }
            return;
        }

        if (tool === 'text') {
            if (editingTextId) finalizeTextEdit();
            const shape = createText(pos.x, pos.y);
            setStrokes(prev => [...prev, shape]);
            setSingleSelection(shape.id);
            setEditingTextId(shape.id);
            return;
        }

        setIsDrawing(true);
        let stroke: Stroke;
        if (tool === 'pen' || tool === 'eraser') stroke = startFreehand(pos.x, pos.y);
        else if (tool === 'rect') stroke = startRect(pos.x, pos.y);
        else stroke = startEllipse(pos.x, pos.y);
        setCurrentStroke(stroke);
        setSingleSelection(null);
        setEditingTextId(null);
    };

    const handleMouseMove = (e: any) => {
        if (isSelecting && selectionStart.current) {
            const stage = e.target.getStage();
            const p = stage.getPointerPosition();
            if (!p) return;
            const sx = selectionStart.current.x;
            const sy = selectionStart.current.y;
            setSelectionRect({
                x: Math.min(sx, p.x),
                y: Math.min(sy, p.y),
                w: Math.abs(p.x - sx),
                h: Math.abs(p.y - sy),
                visible: true
            });
            return;
        }

        if (!isDrawing || !currentStroke) return;
        const stage = e.target.getStage();
        const point = stage.getPointerPosition();
        if (!point) return;

        setCurrentStroke(prev => {
            if (!prev) return prev;
            if (prev.tool === 'pen' || prev.tool === 'eraser')
                return {...prev, points: [...prev.points, point.x, point.y]};
            if (prev.tool === 'rect')
                return {...prev, w: point.x - prev.x, h: point.y - prev.y};
            if (prev.tool === 'ellipse')
                return {...prev, rx: Math.abs(point.x - prev.x), ry: Math.abs(point.y - prev.y)};
            return prev;
        });
    };

    const finalizeSelection = () => {
        if (!stageRef.current) return;
        const box = selectionRect;
        if (!box.visible || box.w < 2 || box.h < 2) {
            setSelectionRect(r => ({...r, visible: false}));
            return;
        }
        const nodes: any[] = [];
        selectedIds.forEach(() => {
        });

        strokes.forEach(s => {
            const node = stageRef.current.findOne(`#${s.id}`);
            if (!node) return;
            const r = node.getClientRect({skipStroke: false});
            const overlaps =
                r.x + r.width >= box.x &&
                r.x <= box.x + box.w &&
                r.y + r.height >= box.y &&
                r.y <= box.y + box.h;
            if (overlaps) nodes.push(s.id);
        });

        setSelectedIds(prev => {
            const base = new Set(prev);
            nodes.forEach(id => base.add(id));
            return Array.from(base);
        });
        setSelectionRect(r => ({...r, visible: false}));
    };

    const handleMouseUp = () => {
        if (isSelecting) {
            setIsSelecting(false);
            finalizeSelection();
            selectionStart.current = null;
        }
        if (!isDrawing) return;
        setIsDrawing(false);
        commitStroke(currentStroke);
        setCurrentStroke(null);
    };

    const handleMouseLeave = () => {
        if (isSelecting) {
            setIsSelecting(false);
            finalizeSelection();
            selectionStart.current = null;
        }
        if (!isDrawing) return;
        setIsDrawing(false);
        commitStroke(currentStroke);
        setCurrentStroke(null);
    };

    const clearCanvas = () => {
        setStrokes([]);
        setCurrentStroke(null);
        setSelectedIds([]);
        setEditingTextId(null);
        persist([]);
    };

    const undoLastStroke = () => {
        setStrokes(prev => {
            const next = prev.slice(0, -1);
            setSelectedIds(ids => ids.filter(id => next.find(s => s.id === id)));
            persist(next);
            return next;
        });
    };

    useEffect(() => {
        if (!transformerRef.current || !stageRef.current) return;
        const t = transformerRef.current;
        const stage = stageRef.current;
        const nodes = selectedIds
            .map(id => stage.findOne(`#${id}`))
            .filter(Boolean);
        t.nodes(nodes);
        t.getLayer()?.batchDraw();
    }, [selectedIds, strokes]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {


            if (editingTextId) {
                if (e.key === 'Escape') {
                    finalizeTextEdit();
                    return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    finalizeTextEdit();
                    return;
                }
                if (e.key === 'Backspace') {
                    e.preventDefault();
                    setStrokes(prev =>
                        prev.map(s =>
                            s.id === editingTextId && s.tool === 'text'
                                ? {...s, text: s.text.slice(0, -1)}
                                : s
                        )
                    );
                    return;
                }
                if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
                    e.preventDefault();
                    const ch = e.key;
                    setStrokes(prev =>
                        prev.map(s =>
                            s.id === editingTextId && s.tool === 'text'
                                ? {...s, text: s.text + ch}
                                : s
                        )
                    );
                }
                return;
            }

            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
                setStrokes(prev => {
                    const next = prev.filter(s => !selectedIds.includes(s.id));
                    persist(next);
                    return next;
                });
                setSelectedIds([]);
            } else if (e.key === 'Escape') {
                setSelectedIds([]);
                setEditingTextId(null);
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                undoLastStroke();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [selectedIds, editingTextId, persist]);

    const finalizeTextEdit = () => {
        if (!editingTextId) return;
        setStrokes(prev => {
            const target = prev.find(s => s.id === editingTextId) as TextShape | undefined;
            if (target && target.text.trim() === '') {
                const next = prev.filter(s => s.id !== editingTextId);
                return next;
            }
            return prev;
        });
        setEditingTextId(null);
    };

    const handleShapeClick = (id: string, e: any) => {
        if (tool === 'select') {
            if (e.evt.shiftKey) toggleSelection(id);
            else setSingleSelection(id);
            e.cancelBubble = true;
        } else if (tool === 'text' && editingTextId === id) {
        }
    };

    const updateShapePosition = (id: string, attrs: Partial<RectShape | EllipseShape | TextShape>) => {
        setStrokes(prev =>
            prev.map(s => {
                if (s.id !== id) return s;
                if (s.tool === 'rect') return {...s, ...attrs} as RectShape;
                if (s.tool === 'ellipse') return {...s, ...attrs} as EllipseShape;
                if (s.tool === 'text') return {...s, ...attrs} as TextShape;
                return s;
            })
        );
    };

    const handleTransformEnd = (node: any) => {
        selectedIds.forEach(id => {
            const stroke = strokes.find(s => s.id === id);
            if (!stroke) return;
            if (stroke.tool === 'rect') {
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();
                updateShapePosition(id, {
                    x: node.x(),
                    y: node.y(),
                    w: (stroke as RectShape).w * scaleX,
                    h: (stroke as RectShape).h * scaleY
                });
            } else if (stroke.tool === 'ellipse') {
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();
                updateShapePosition(id, {
                    x: node.x(),
                    y: node.y(),
                    rx: (stroke as EllipseShape).rx * scaleX,
                    ry: (stroke as EllipseShape).ry * scaleY
                });
            } else if (stroke.tool === 'text') {
                const scale = node.scaleX();
                updateShapePosition(id, {
                    x: node.x(),
                    y: node.y(),
                    fontSize: Math.max(8, (stroke as TextShape).fontSize * scale)
                });
            }
            node.scaleX(1);
            node.scaleY(1);
        });
    };

    const isSelected = (id: string) => selectedIds.includes(id);

    return (
        <div className="border rounded-lg p-4 bg-white inline-block">
            <div className="flex flex-wrap items-center gap-3 mb-4 p-2 bg-gray-50 rounded">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Tool:</label>
                    <select
                        className="border rounded px-2 py-1 text-sm"
                        value={tool}
                        onChange={e => {
                            if (editingTextId) finalizeTextEdit();
                            setTool(e.target.value as Tool);
                            setSelectedIds([]);
                        }}
                    >
                        <option value="pen">Pen</option>
                        <option value="eraser">Eraser</option>
                        <option value="rect">Rectangle</option>
                        <option value="ellipse">Ellipse</option>
                        <option value="text">Text</option>
                        <option value="select">Select</option>
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Color:</label>
                    <input
                        type="color"
                        value={strokeColor}
                        disabled={tool === 'eraser'}
                        onChange={e => setStrokeColor(e.target.value)}
                        className="w-8 h-8 border rounded cursor-pointer disabled:opacity-40"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Size:</label>
                    <input
                        type="range"
                        min="1"
                        max="40"
                        value={strokeWidth}
                        onChange={e => setStrokeWidth(Number(e.target.value))}
                        className="w-24"
                    />
                    <span className="text-sm w-6 text-center">{strokeWidth}</span>
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

            <div
                className="border border-gray-300 rounded overflow-hidden"
                style={{width: canvasWidth, height: canvasHeight, position: 'relative'}}
            >
                <Stage
                    width={canvasWidth}
                    height={canvasHeight}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                    ref={stageRef}
                    className="cursor-crosshair select-none"
                >
                    <Layer>
                        {strokes.map(stroke => {
                            if (stroke.tool === 'pen' || stroke.tool === 'eraser') {
                                return (
                                    <Line
                                        id={stroke.id}
                                        key={stroke.id}
                                        points={stroke.points}
                                        stroke={stroke.tool === 'eraser' ? 'white' : stroke.color}
                                        strokeWidth={stroke.width}
                                        tension={0.5}
                                        lineCap="round"
                                        lineJoin="round"
                                        globalCompositeOperation={
                                            stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
                                        }
                                        onClick={e => handleShapeClick(stroke.id, e)}
                                    />
                                );
                            }
                            if (stroke.tool === 'rect') {
                                return (
                                    <Rect
                                        id={stroke.id}
                                        key={stroke.id}
                                        x={Math.min(stroke.x, stroke.x + stroke.w)}
                                        y={Math.min(stroke.y, stroke.y + stroke.h)}
                                        width={Math.abs(stroke.w)}
                                        height={Math.abs(stroke.h)}
                                        stroke={stroke.color}
                                        strokeWidth={stroke.width}
                                        draggable={tool === 'select' && isSelected(stroke.id)}
                                        onDragEnd={e =>
                                            updateShapePosition(stroke.id, {x: e.target.x(), y: e.target.y()})
                                        }
                                        onTransformEnd={e => handleTransformEnd(e.target)}
                                        onClick={e => handleShapeClick(stroke.id, e)}
                                    />
                                );
                            }
                            if (stroke.tool === 'ellipse') {
                                return (
                                    <Ellipse
                                        id={stroke.id}
                                        key={stroke.id}
                                        x={stroke.x}
                                        y={stroke.y}
                                        radiusX={stroke.rx}
                                        radiusY={stroke.ry}
                                        stroke={stroke.color}
                                        strokeWidth={stroke.width}
                                        draggable={tool === 'select' && isSelected(stroke.id)}
                                        onDragEnd={e =>
                                            updateShapePosition(stroke.id, {x: e.target.x(), y: e.target.y()})
                                        }
                                        onTransformEnd={e => handleTransformEnd(e.target)}
                                        onClick={e => handleShapeClick(stroke.id, e)}
                                    />
                                );
                            }
                            if (stroke.tool === 'text') {
                                const isEditing = editingTextId === stroke.id;
                                return (
                                    <Text
                                        id={stroke.id}
                                        key={stroke.id}
                                        x={stroke.x}
                                        y={stroke.y}
                                        text={
                                            isEditing
                                                ? stroke.text + (Math.floor(Date.now() / 500) % 2 ? '|' : ' ')
                                                : stroke.text
                                        }
                                        fontSize={stroke.fontSize}
                                        fill={stroke.color}
                                        draggable={tool === 'select' && isSelected(stroke.id)}
                                        onDragEnd={e =>
                                            updateShapePosition(stroke.id, {x: e.target.x(), y: e.target.y()})
                                        }
                                        onClick={e => {
                                            if (tool === 'text') {
                                                if (editingTextId !== stroke.id) {
                                                    setEditingTextId(stroke.id);
                                                }
                                            } else {
                                                handleShapeClick(stroke.id, e);
                                            }
                                        }}
                                        onDblClick={e => {
                                            if (tool === 'select') {
                                                setEditingTextId(stroke.id);
                                                setSingleSelection(stroke.id);
                                            }
                                            e.cancelBubble = true;
                                        }}
                                    />
                                );
                            }
                            return null;
                        })}

                        {currentStroke && (currentStroke.tool === 'pen' || currentStroke.tool === 'eraser') && (
                            <Line
                                points={currentStroke.points}
                                stroke={currentStroke.tool === 'eraser' ? 'white' : currentStroke.color}
                                strokeWidth={currentStroke.width}
                                tension={0.5}
                                lineCap="round"
                                lineJoin="round"
                                globalCompositeOperation={
                                    currentStroke.tool === 'eraser' ? 'destination-out' : 'source-over'
                                }
                            />
                        )}

                        {currentStroke && currentStroke.tool === 'rect' && (
                            <Rect
                                x={Math.min(currentStroke.x, currentStroke.x + currentStroke.w)}
                                y={Math.min(currentStroke.y, currentStroke.y + currentStroke.h)}
                                width={Math.abs(currentStroke.w)}
                                height={Math.abs(currentStroke.h)}
                                stroke={currentStroke.color}
                                strokeWidth={currentStroke.width}
                                dash={[4, 4]}
                            />
                        )}

                        {currentStroke && currentStroke.tool === 'ellipse' && (
                            <Ellipse
                                x={currentStroke.x}
                                y={currentStroke.y}
                                radiusX={currentStroke.rx}
                                radiusY={currentStroke.ry}
                                stroke={currentStroke.color}
                                strokeWidth={currentStroke.width}
                                dash={[4, 4]}
                            />
                        )}

                        {/* selection marquee */}
                        {selectionRect.visible && (
                            <Rect
                                x={selectionRect.x}
                                y={selectionRect.y}
                                width={selectionRect.w}
                                height={selectionRect.h}
                                stroke="#3b82f6"
                                strokeWidth={1}
                                dash={[4, 4]}
                                listening={false}
                                fill="rgba(59,130,246,0.1)"
                            />
                        )}

                        <Transformer
                            ref={transformerRef}
                            rotateEnabled={false}
                            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                            onTransformEnd={e => handleTransformEnd(e.target)}
                        />
                    </Layer>
                </Stage>
            </div>
        </div>
    );
};