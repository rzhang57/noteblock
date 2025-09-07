import {
    headingsPlugin,
    linkPlugin,
    listsPlugin,
    markdownShortcutPlugin,
    MDXEditor,
    quotePlugin,
    codeBlockPlugin,
    codeMirrorPlugin, imagePlugin
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {NoteService} from "@/services/NoteService.ts";
import {useState, useRef, useEffect} from "react";
import type {Block, TextContent} from "@/types/Note.ts";

export function TextBlock({block}: { block: Block }) {
    const {selectedNoteId} = useNoteContext();
    const editorRef = useRef<any>(null);
    const [content, setContent] = useState(() => {
        const textContent = block.content as TextContent;
        return textContent.text ?? "";
    });

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key === '`') {
                e.preventDefault();
                insertCodeBlock();
            }
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                insertCodeBlock();
            }
        };

        document.addEventListener('keydown', handleGlobalKeyDown);
        return () => document.removeEventListener('keydown', handleGlobalKeyDown);
    }, [content]);

    async function imageUploadHandler(image: File) {
        return await NoteService.uploadImage(image);
    }

    const handleBlur = async () => {
        if (!selectedNoteId) return;
        const dbTextContent = block.content as TextContent;
        if (content !== dbTextContent.text) {
            try {
                await NoteService.updateBlock(selectedNoteId, block.id, {
                    type: block.type,
                    content: {
                        text: content,
                    },
                });
            } catch (err) {
                console.error("Failed to save block:", err);
            }
        }
    };

    const insertCodeBlock = () => {
        const currentContent = content;
        const codeBlockMarkdown = currentContent.endsWith('\n') ? '```\n\n```\n' : '\n```\n\n```\n';
        setContent(prev => prev + codeBlockMarkdown);
    };

    return (
        <div className="p-2 bg-white w-[834px]">
            <MDXEditor
                ref={editorRef}
                markdown={content}
                onChange={setContent}
                onBlur={handleBlur}
                className="mdxeditor"
                plugins={[
                    headingsPlugin(),
                    listsPlugin(),
                    linkPlugin(),
                    quotePlugin(),
                    codeBlockPlugin({
                        defaultCodeBlockLanguage: 'text'
                    }),
                    codeMirrorPlugin({
                        codeBlockLanguages: {
                            '': 'Plain text',
                            text: 'Plain text',
                            ts: 'TypeScript',
                            python: 'Python',
                            js: 'JavaScript',
                            java: 'Java',
                            go: 'Go',
                            cpp: 'C++',
                            c: 'C',
                            csharp: 'C#',
                            html: 'HTML',
                            css: 'CSS',
                            sql: 'SQL',
                        }
                    }),
                    imagePlugin({imageUploadHandler}),
                    markdownShortcutPlugin(),
                ]}
            />
        </div>
    );
}