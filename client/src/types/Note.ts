export type BlockType = "text" | "image" | "canvas";

export interface CanvasContent {
    data: Record<string, any>;
}

export interface TextContent {
    text: string;
}

export interface ImageContent {
    url: string;
    data?: Record<string, any>;
}

export type BlockContent = CanvasContent | TextContent | ImageContent;

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
    folder_id: string;
    blocks: Block[];
}