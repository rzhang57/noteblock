export type BlockType = "text" | "image" | "canvas" | "code";

export interface CanvasContent {
    data: Record<string, any>;
}

export interface TextContent {
    text: string;
}

export interface Stroke {
    color: string;
    width: number;
    // normalised to 0..1 of the image box so annotations survive any display size
    points: [number, number][];
}

export interface ImageContent {
    url: string;
    strokes?: Stroke[];
    scale?: number;
    data?: Record<string, any>;
}

export interface CodeContent {
    code: string;
    language: string;
}

export type BlockContent = CanvasContent | TextContent | CodeContent | ImageContent;

export interface Block {
    id: string;
    type: BlockType;
    index: number;
    content: BlockContent;
    created_at: string;
    updated_at: string;
}

export interface Note {
    id: string;
    title: string;
    folder_id: string | null;
    blocks: Block[];
}