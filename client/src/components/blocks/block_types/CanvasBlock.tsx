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
    isLocked?: boolean;
}

export const CanvasBlock: React.FC<CanvasBlockProps> = ({block}) => {
    const {selectedNoteId} = useNoteContext();

    // sizing
    const MIN_W = 800;
    const MIN_H = 450;
    const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({
        width: MIN_W,
        height: MIN_H
    });
    const [maxWidth, setMaxWidth] = useState<number>(Infinity);
    const [maxHeight, setMaxHeight] = useState<number>(Infinity);
    const boundsRef = useRef<HTMLDivElement | null>(null);
    const [isLocked, setIsLocked] = useState(false);

    // drawing state
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

    // resize handle state
    const [isResizing, setIsResizing] = useState(false);
    const resizeStateRef = useRef<{
        startX: number;
        startY: number;
        startW: number;
        startH: number;
    } | null>(null);

    // load content
    useEffect(() => {
        if (!block.content) {
            setStrokes([]);
            setCanvasSize({width: MIN_W, height: MIN_H});
            setIsLocked(false);
            return;
        }
        try {
            let parsed: any = block.content;
            if (typeof block.content === 'string') parsed = JSON.parse(block.content);

            if (parsed && Array.isArray(parsed.strokes)) setStrokes(parsed.strokes);
            else setStrokes([]);

            const w = typeof parsed?.width === 'number' ? parsed.width : MIN_W;
            const h = typeof parsed?.height === 'number' ? parsed.height : MIN_H;
            setCanvasSize({
                width: Math.max(MIN_W, w),
                height: Math.max(MIN_H, h)
            });

            setIsLocked(!!parsed?.isLocked);
        } catch {
            setStrokes([]);
            setCanvasSize({width: MIN_W, height: MIN_H});
            setIsLocked(false);
        }
    }, [block.content]);

    // observe available space from content panel to clamp max dimensions
    useEffect(() => {
        if (!boundsRef.current) return;

        const el = boundsRef.current;
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                const w = Math.floor(entry.contentRect.width);
                const h = Math.floor(entry.contentRect.height);
                setMaxWidth(w);
                setMaxHeight(h);

                // clamp current size if needed
                setCanvasSize(prev => {
                    const clampedW = Math.min(Math.max(prev.width, MIN_W), w);
                    const clampedH = Math.min(Math.max(prev.height, MIN_H), h);
                    return (prev.width !== clampedW || prev.height !== clampedH)
                        ? {width: clampedW, height: clampedH}
                        : prev;
                });
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const persist = useCallback(
        async (data: Stroke[], width: number, height: number, locked: boolean) => {
            if (!selectedNoteId) return;
            const payload: CanvasContent = {strokes: data, width, height, isLocked: locked};
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
            persist(strokes, canvasSize.width, canvasSize.height, isLocked);
        }, 600);
        return () => {
            if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
        };
    }, [strokes, canvasSize, isLocked, persist]);

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
        if (!stageRef.current || isResizing) return;
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
        persist([], canvasSize.width, canvasSize.height, isLocked);
    };

    const undoLastStroke = () => {
        setStrokes(prev => {
            const next = prev.slice(0, -1);
            setSelectedIds(ids => ids.filter(id => next.find(s => s.id === id)));
            persist(next, canvasSize.width, canvasSize.height, isLocked);
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
                    persist(next, canvasSize.width, canvasSize.height, isLocked);
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
    }, [selectedIds, editingTextId, persist, canvasSize.width, canvasSize.height]);

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

    // resize handlers
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isResizing || !resizeStateRef.current) return;
            const dx = e.clientX - resizeStateRef.current.startX;
            const dy = e.clientY - resizeStateRef.current.startY;

            const nextW = Math.min(
                Math.max(MIN_W, resizeStateRef.current.startW + dx),
                isFinite(maxWidth) ? maxWidth : resizeStateRef.current.startW + dx
            );

            const nextH = Math.min(
                Math.max(MIN_H, resizeStateRef.current.startH + dy),
                isFinite(maxHeight) ? maxHeight : resizeStateRef.current.startH + dy
            );

            setCanvasSize({width: nextW, height: nextH});
        };
        const onUp = () => {
            if (isResizing) {
                setIsResizing(false);
                resizeStateRef.current = null;
            }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [isResizing, maxWidth, maxHeight]);

    const beginResize = (e: React.MouseEvent) => {
        if (isLocked) return;

        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        resizeStateRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startW: canvasSize.width,
            startH: canvasSize.height
        };
    };

    return (
        <div className="p-4 bg-white inline-block w-full">
            {/* Lock toggle outside the main toolbar */}
            <div className="flex justify-end mb-2">
                <button
                    onClick={() => setIsLocked(!isLocked)}
                    className={`p-2 transition-colors ${
                        isLocked
                            ? 'bg-red-100 hover:bg-red-200 text-red-700'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                    }`}
                    title={isLocked ? "Unlock canvas" : "Lock canvas"}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        {isLocked ? (
                            <path
                                d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z"/>
                        ) : (
                            <path
                                d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6H9c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z"/>
                        )}
                    </svg>
                </button>
            </div>

            {/* Main toolbar - only show when unlocked */}
            {!isLocked && (
                <div className="flex flex-wrap items-center gap-3 mb-4 p-2 bg-gray-50">
                    <div className="flex items-center gap-1 p-1 bg-gray-100 border">
                        <button
                            onClick={() => {
                                if (editingTextId) finalizeTextEdit();
                                setTool('pen');
                                setSelectedIds([]);
                            }}
                            className={`p-2 transition-colors ${
                                tool === 'pen'
                                    ? 'bg-blue-500 text-white shadow-sm'
                                    : 'hover:bg-gray-200 text-gray-700'
                            }`}
                            title="Pen Tool"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path
                                    d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                            </svg>
                        </button>

                        <button
                            onClick={() => {
                                if (editingTextId) finalizeTextEdit();
                                setTool('eraser');
                                setSelectedIds([]);
                            }}
                            className={`p-2 transition-colors ${
                                tool === 'eraser'
                                    ? 'bg-blue-500 text-white shadow-sm'
                                    : 'hover:bg-gray-200 text-gray-700'
                            }`}
                            title="Eraser Tool"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path
                                    d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 0 1-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0M4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53-6.36-6.36-3.54 3.54c-.78.78-.78 2.05 0 2.82z"/>
                            </svg>
                        </button>

                        <button
                            onClick={() => {
                                if (editingTextId) finalizeTextEdit();
                                setTool('rect');
                                setSelectedIds([]);
                            }}
                            className={`p-2 transition-colors ${
                                tool === 'rect'
                                    ? 'bg-blue-500 text-white shadow-sm'
                                    : 'hover:bg-gray-200 text-gray-700'
                            }`}
                            title="Rectangle Tool"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            </svg>
                        </button>

                        <button
                            onClick={() => {
                                if (editingTextId) finalizeTextEdit();
                                setTool('ellipse');
                                setSelectedIds([]);
                            }}
                            className={`p-2 transition-colors ${
                                tool === 'ellipse'
                                    ? 'bg-blue-500 text-white shadow-sm'
                                    : 'hover:bg-gray-200 text-gray-700'
                            }`}
                            title="Ellipse Tool"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/>
                            </svg>
                        </button>

                        <button
                            onClick={() => {
                                if (editingTextId) finalizeTextEdit();
                                setTool('text');
                                setSelectedIds([]);
                            }}
                            className={`p-2 transition-colors ${
                                tool === 'text'
                                    ? 'bg-blue-500 text-white shadow-sm'
                                    : 'hover:bg-gray-200 text-gray-700'
                            }`}
                            title="Text Tool"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M5 4v3h5.5v12h3V7H19V4z"/>
                            </svg>
                        </button>

                        <button
                            onClick={() => {
                                if (editingTextId) finalizeTextEdit();
                                setTool('select');
                            }}
                            className={`p-2 transition-colors ${
                                tool === 'select'
                                    ? 'bg-blue-500 text-white shadow-sm'
                                    : 'hover:bg-gray-200 text-gray-700'
                            }`}
                            title="Select Tool"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M2 2h20v20H2V2zm18 18V4H4v16h16z"/>
                                <path d="M8 8h8v8H8z" fill="none" stroke="currentColor" strokeWidth="1"
                                      strokeDasharray="2,2"/>
                            </svg>
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium">Color:</label>
                        <input
                            type="color"
                            value={strokeColor}
                            disabled={tool === 'eraser'}
                            onChange={e => setStrokeColor(e.target.value)}
                            className="w-8 h-8 border cursor-pointer disabled:opacity-40"
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
                        className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                    >
                        Undo
                    </button>

                    <button
                        onClick={clearCanvas}
                        disabled={strokes.length === 0}
                        className="px-3 py-1 text-sm bg-red-200 hover:bg-red-300 disabled:opacity-50"
                    >
                        Clear
                    </button>
                </div>
            )}

            {/* bounds container spans the content panel dimensions */}
            <div ref={boundsRef} className="w-full h-full">
                <div
                    className="border border-gray-300 overflow-hidden relative mx-auto"
                    style={{width: canvasSize.width, height: canvasSize.height}}
                >
                    <Stage
                        width={canvasSize.width}
                        height={canvasSize.height}
                        onMouseDown={isLocked ? undefined : handleMouseDown}
                        onMouseMove={isLocked ? undefined : handleMouseMove}
                        onMouseUp={isLocked ? undefined : handleMouseUp}
                        onMouseLeave={isLocked ? undefined : handleMouseLeave}
                        ref={stageRef}
                        className={isLocked ? "select-none" : "cursor-crosshair select-none"}
                    >
                        <Layer>
                            {selectionRect.visible && (
                                <Rect
                                    x={selectionRect.x}
                                    y={selectionRect.y}
                                    width={selectionRect.w}
                                    height={selectionRect.h}
                                    fill="rgba(0, 123, 255, 0.1)"
                                    stroke="blue"
                                    strokeWidth={1}
                                    dash={[5, 5]}
                                />
                            )}

                            {strokes.map(stroke => {
                                if (stroke.tool === 'pen' || stroke.tool === 'eraser') {
                                    const freehand = stroke as FreehandStroke;
                                    return (
                                        <Line
                                            key={stroke.id}
                                            id={stroke.id}
                                            points={freehand.points}
                                            stroke={freehand.color}
                                            strokeWidth={freehand.width}
                                            tension={0.5}
                                            lineCap="round"
                                            lineJoin="round"
                                            globalCompositeOperation={
                                                freehand.tool === 'eraser' ? 'destination-out' : 'source-over'
                                            }
                                            onClick={e => handleShapeClick(stroke.id, e)}
                                            draggable={tool === 'select' && isSelected(stroke.id)}
                                        />
                                    );
                                } else if (stroke.tool === 'rect') {
                                    const rect = stroke as RectShape;
                                    return (
                                        <Rect
                                            key={stroke.id}
                                            id={stroke.id}
                                            x={rect.x}
                                            y={rect.y}
                                            width={rect.w}
                                            height={rect.h}
                                            stroke={rect.color}
                                            strokeWidth={rect.width}
                                            fill="transparent"
                                            onClick={e => handleShapeClick(stroke.id, e)}
                                            draggable={tool === 'select' && isSelected(stroke.id)}
                                            onDragEnd={e => updateShapePosition(stroke.id, {
                                                x: e.target.x(),
                                                y: e.target.y()
                                            })}
                                        />
                                    );
                                } else if (stroke.tool === 'ellipse') {
                                    const ellipse = stroke as EllipseShape;
                                    return (
                                        <Ellipse
                                            key={stroke.id}
                                            id={stroke.id}
                                            x={ellipse.x}
                                            y={ellipse.y}
                                            radiusX={ellipse.rx}
                                            radiusY={ellipse.ry}
                                            stroke={ellipse.color}
                                            strokeWidth={ellipse.width}
                                            fill="transparent"
                                            onClick={e => handleShapeClick(stroke.id, e)}
                                            draggable={tool === 'select' && isSelected(stroke.id)}
                                            onDragEnd={e => updateShapePosition(stroke.id, {
                                                x: e.target.x(),
                                                y: e.target.y()
                                            })}
                                        />
                                    );
                                } else if (stroke.tool === 'text') {
                                    const text = stroke as TextShape;
                                    return (
                                        <Text
                                            key={stroke.id}
                                            id={stroke.id}
                                            x={text.x}
                                            y={text.y}
                                            text={text.text}
                                            fontSize={text.fontSize}
                                            fill={text.color}
                                            onClick={e => handleShapeClick(stroke.id, e)}
                                            draggable={tool === 'select' && isSelected(stroke.id)}
                                            onDragEnd={e => updateShapePosition(stroke.id, {
                                                x: e.target.x(),
                                                y: e.target.y()
                                            })}
                                        />
                                    );
                                }
                                return null;
                            })}

                            {currentStroke && (
                                <>
                                    {(currentStroke.tool === 'pen' || currentStroke.tool === 'eraser') && (
                                        <Line
                                            points={(currentStroke as FreehandStroke).points}
                                            stroke={currentStroke.color}
                                            strokeWidth={currentStroke.width}
                                            tension={0.5}
                                            lineCap="round"
                                            lineJoin="round"
                                            globalCompositeOperation={
                                                currentStroke.tool === 'eraser' ? 'destination-out' : 'source-over'
                                            }
                                        />
                                    )}
                                    {currentStroke.tool === 'rect' && (
                                        <Rect
                                            x={(currentStroke as RectShape).x}
                                            y={(currentStroke as RectShape).y}
                                            width={(currentStroke as RectShape).w}
                                            height={(currentStroke as RectShape).h}
                                            stroke={currentStroke.color}
                                            strokeWidth={currentStroke.width}
                                            fill="transparent"
                                        />
                                    )}
                                    {currentStroke.tool === 'ellipse' && (
                                        <Ellipse
                                            x={(currentStroke as EllipseShape).x}
                                            y={(currentStroke as EllipseShape).y}
                                            radiusX={(currentStroke as EllipseShape).rx}
                                            radiusY={(currentStroke as EllipseShape).ry}
                                            stroke={currentStroke.color}
                                            strokeWidth={currentStroke.width}
                                            fill="transparent"
                                        />
                                    )}
                                </>
                            )}

                            <Transformer
                                ref={transformerRef}
                                onTransformEnd={handleTransformEnd}
                            />
                        </Layer>
                    </Stage>

                    {/* Vertical resize handle - only show when unlocked */}
                    {!isLocked && (
                        <div
                            onMouseDown={beginResize}
                            onClick={e => e.stopPropagation()}
                            title="Drag to resize canvas height"
                            className="absolute bottom-1 left-1/2 -translate-x-1/2 w-8 h-3 bg-blue-500 hover:bg-blue-600
                                   cursor-ns-resize flex items-center justify-center shadow-lg opacity-70 hover:opacity-100 transition-opacity"
                        >
                            <svg width="12" height="8" viewBox="0 0 12 8" className="text-white">
                                <path d="M6 0L2 3h8L6 0z" fill="currentColor"/>
                                <path d="M6 8L2 5h8L6 8z" fill="currentColor"/>
                            </svg>
                        </div>
                    )}
                </div>

                <div className="text-xs text-gray-500 mt-1 text-center">
                    {Math.round(canvasSize.width)} × {Math.round(canvasSize.height)}
                </div>
            </div>
        </div>
    );
};