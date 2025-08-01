import {
    headingsPlugin,
    linkPlugin,
    listsPlugin,
    markdownShortcutPlugin,
    MDXEditor,
    quotePlugin
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import {useNoteContext} from "@/context/NoteContext";
import {NoteService} from "@/services/NoteService";
import {useState} from "react";
import type {Block, TextContent} from "@/types/Note";

export function TextBlock({block}: { block: Block }) {
    const {selectedNoteId} = useNoteContext();
    const [content, setContent] = useState(() => {
        const textContent = block.content as TextContent;
        return textContent.text ?? "";
    });

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

    return (
        <div className="border border-gray-200 rounded p-2 bg-white">
            <MDXEditor
                markdown={content}
                onChange={setContent}
                onBlur={handleBlur}
                className="mdxeditor"
                plugins={[headingsPlugin(), listsPlugin(), linkPlugin(), quotePlugin(), markdownShortcutPlugin()]}
            />
        </div>
    );
}
