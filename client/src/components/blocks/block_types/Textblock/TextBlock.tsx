import {
    headingsPlugin,
    linkPlugin,
    listsPlugin,
    markdownShortcutPlugin,
    MDXEditor,
    quotePlugin,
    thematicBreakPlugin,
    codeBlockPlugin,
    imagePlugin,
    useCodeBlockEditorContext,
    type CodeBlockEditorDescriptor,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import {BareCodeMirror, LanguagePicker} from "../CodeMirrorEditor.tsx";
import {LANGUAGE_MAP} from "../codeLanguages";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {NoteService} from "@/services/NoteService.ts";
import {useState, useRef, useEffect, useCallback} from "react";
import type {Block, TextContent} from "@/types/Note.ts";
import {TbCopy, TbCopyCheckFilled, TbTrash} from "react-icons/tb";
import {
    $isListItemNode,
    $isListNode,
    $createListNode,
    $createListItemNode,
    type ListItemNode,
    type ListNode,
} from "@lexical/list";
import {
    $getNodeByKey,
    $getRoot,
    $isElementNode,
    ElementNode,
    $createParagraphNode,
    $createTextNode,
    $getSelection,
    $isRangeSelection,
    KEY_TAB_COMMAND,
    COMMAND_PRIORITY_CRITICAL,
    type LexicalEditor,
    type LexicalNode,
} from "lexical";

function HeaderedBareEditor({
                                code,
                                language,
                                languageMap
                            }: {
    code: string;
    language?: string;
    languageMap: Record<string, string>;
}) {
    const {setCode, setLanguage, parentEditor, lexicalNode} = useCodeBlockEditorContext();
    const [copied, setCopied] = useState(false);
    const [isSelected, setIsSelected] = useState(false);

    useEffect(() => {
        return parentEditor.registerUpdateListener(({editorState}) => {
            editorState.read(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection)) {
                    setIsSelected(false);
                    return;
                }

                const nodes = selection.getNodes();
                const nodeKey = lexicalNode.getKey();

                const selected = nodes.some(node => {
                    let current = node;
                    while (current) {
                        if (current.getKey() === nodeKey) return true;
                        const parent = current.getParent();
                        if (!parent) break;
                        current = parent;
                    }
                    return false;
                });

                setIsSelected(selected);
            });
        });
    }, [parentEditor, lexicalNode]);

    const deleteCodeBlock = useCallback(() => {
        parentEditor.update(() => {
            const node = $getNodeByKey(lexicalNode.getKey());
            if (!node) return;

            const next = node.getNextSibling();
            if (next) {
                if ($isElementNode(next as ElementNode)) (next as ElementNode).selectStart();
                else (next as any).select?.();
            } else {
                const prev = node.getPreviousSibling();
                if (prev) {
                    if ($isElementNode(prev as ElementNode)) (prev as ElementNode).selectEnd();
                    else (prev as any).select?.();
                } else {
                    const root = $getRoot();
                    const p = $createParagraphNode().append($createTextNode(""));
                    root.append(p);
                    p.selectStart();
                }
            }

            node.remove();
        });

        requestAnimationFrame(() => parentEditor.focus());
    }, [parentEditor, lexicalNode]);

    const moveCaretBeforeBlock = useCallback(() => {
        const cm = document.querySelector('[data-nb-codeblock] .cm-editor') as HTMLElement | null;
        cm?.blur();

        parentEditor.update(() => {
            const node = $getNodeByKey(lexicalNode.getKey());
            if (!node) return;

            const prev = node.getPreviousSibling();
            if (prev) {
                if ($isElementNode(prev as ElementNode)) (prev as ElementNode).selectEnd();
                else (prev as any).select?.();
            } else {
                $getRoot().selectStart();
            }
        });

        requestAnimationFrame(() => parentEditor.focus());
    }, [parentEditor, lexicalNode]);

    return (
        <div
            data-nb-codeblock
            style={{
                overflow: "hidden",
                borderRadius: 8,
                background: "var(--secondary)",
                margin: "1rem 0",
                boxShadow: isSelected ? "0 0 0 2px var(--ink)" : "none",
                transition: "box-shadow 0.12s ease"
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "6px 8px 2px 10px",
                    background: "transparent",
                    transition: "opacity 0.12s ease"
                }}
            >
                <div style={{display: "flex", alignItems: "center", gap: 8}}>
                    <span style={{fontSize: 11, color: "var(--ink-faint)"}}>Language</span>
                    <LanguagePicker value={language} options={languageMap} onChange={(v) => setLanguage(v)}/>
                </div>
                <div style={{display: "flex", alignItems: "center", gap: 8}}>
                    <button
                        onClick={async () => {
                            await navigator.clipboard.writeText(code);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 3000);
                        }}
                        style={{
                            fontSize: 11,
                            color: "var(--ink-muted)",
                            background: "transparent",
                            border: "none",
                            borderRadius: 4,
                            padding: "3px 6px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 6
                        }}
                    >
                        {copied ? <TbCopyCheckFilled style={{marginRight: 4}}/> : <TbCopy style={{marginRight: 4}}/>}
                        {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                        onClick={deleteCodeBlock}
                        style={{
                            fontSize: 14,
                            color: "var(--ink-faint)",
                            background: "transparent",
                            border: "none",
                            borderRadius: 4,
                            padding: "3px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            transition: "color 0.2s"
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "var(--destructive)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--ink-faint)";
                        }}
                    >
                        <TbTrash/>
                    </button>
                </div>
            </div>

            <div style={{padding: "2px 10px 10px"}}>
                <BareCodeMirror
                    code={code}
                    language={language}
                    onChange={setCode}
                    onExitUp={moveCaretBeforeBlock}
                />
            </div>
        </div>
    );
}

const bareDescriptor = (languageMap: Record<string, string>): CodeBlockEditorDescriptor => ({
    priority: 100,
    match: () => true,
    Editor: (p: any) => <HeaderedBareEditor code={p.code} language={p.language} languageMap={languageMap}/>
});

function closestListItem(node: LexicalNode): LexicalNode | null {
    let current: LexicalNode | null = node;
    while (current) {
        if (current.getType() === "listitem") return current;
        current = current.getParent();
    }
    return null;
}

function nestedListOf(item: ListItemNode): ListNode | null {
    const child = item.getFirstChild();
    return child && $isListNode(child) ? child : null;
}

// requiring a previous sibling to nest under is what caps indentation at one level
function indentListItem(item: ListItemNode) {
    const parentList = item.getParent();
    if (!$isListNode(parentList)) return;

    const previous = item.getPreviousSibling();
    if (!previous || !$isListItemNode(previous)) return;

    const existing = nestedListOf(previous);
    if (existing) {
        existing.append(item);
    } else {
        const nested = $createListNode(parentList.getListType());
        const wrapper = $createListItemNode();
        nested.append(item);
        wrapper.append(nested);
        previous.insertAfter(wrapper);
    }
    item.selectEnd();
}

function outdentListItem(item: ListItemNode) {
    const parentList = item.getParent();
    if (!$isListNode(parentList)) return;

    const wrapper = parentList.getParent();
    if (!$isListItemNode(wrapper)) return;

    wrapper.insertAfter(item);
    if (parentList.getChildrenSize() === 0) wrapper.remove();
    item.selectEnd();
}

const FENCE = "```";

function countFences(markdown: string): number {
    return markdown.split("\n").filter(line => line.trimStart().startsWith(FENCE)).length;
}

export function TextBlock({block, onSpawnCodeBlock, onSpawnImageBlock}: {
    block: Block;
    onSpawnCodeBlock?: () => void;
    onSpawnImageBlock?: (url: string) => void;
}) {
    const {selectedNoteId} = useNoteContext();
    const editorRef = useRef<any>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const [content, setContent] = useState(() => {
        const textContent = block.content as TextContent;
        return textContent.text ?? "";
    });
    const contentRef = useRef(content);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const previouslyFocused = useRef(false);

    useEffect(() => {
        const editor = editorRef.current?.getEditorState?.()?.editor;
        if (!editor) return;

        // @ts-ignore
        return editor.registerUpdateListener(({editorState}) => {
            editorState.read(() => {
                const selection = $getSelection();
                const hasFocus = $isRangeSelection(selection) && selection.getNodes().length > 0;

                if (!hasFocus && previouslyFocused.current) {
                    window.dispatchEvent(new CustomEvent('blockUnfocused'));
                }

                previouslyFocused.current = hasFocus;
            });
        });
    }, []);

    // without this Tab falls through to the default handler and inserts a literal tab character
    useEffect(() => {
        let unregister: (() => void) | undefined;
        let frame = 0;

        const attach = () => {
            // MDXEditor's ref does not expose the Lexical instance; the contenteditable root does
            const root = hostRef.current?.querySelector("[contenteditable]") as
                (HTMLElement & { __lexicalEditor?: LexicalEditor }) | null;
            const editor = root?.__lexicalEditor;
            if (!editor) {
                frame = requestAnimationFrame(attach);
                return;
            }

            const onTab = editor.registerCommand<KeyboardEvent>(
                KEY_TAB_COMMAND,
                (event) => {
                    const selection = $getSelection();
                    if (!$isRangeSelection(selection)) return false;
                    const item = closestListItem(selection.anchor.getNode());
                    if (!item || !$isListItemNode(item)) return false;

                    event.preventDefault();
                    editor.update(() => {
                        if (event.shiftKey) outdentListItem(item);
                        else indentListItem(item);
                    });
                    return true;
                },
                COMMAND_PRIORITY_CRITICAL
            );

            unregister = onTab;
        };

        attach();
        return () => {
            cancelAnimationFrame(frame);
            unregister?.();
        };
    }, []);

    // capture phase, so MDXEditor's imagePlugin never gets a chance to inline the paste
    useEffect(() => {
        const host = hostRef.current;
        if (!host || !onSpawnImageBlock) return;

        const onPaste = (event: ClipboardEvent) => {
            const file = [...(event.clipboardData?.files ?? [])].find(f => f.type.startsWith("image/"));
            if (!file) return;

            event.preventDefault();
            event.stopPropagation();
            NoteService.uploadImage(file)
                .then(onSpawnImageBlock)
                .catch(err => console.error("Failed to upload pasted image:", err));
        };

        host.addEventListener("paste", onPaste, true);
        return () => host.removeEventListener("paste", onPaste, true);
    }, [onSpawnImageBlock]);

    useEffect(() => {
        contentRef.current = content;
    }, [content]);

    useEffect(() => {
        if (!selectedNoteId) return;

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(async () => {
            const dbTextContent = block.content as TextContent;
            if (content !== dbTextContent.text) {
                try {
                    await NoteService.updateBlock(selectedNoteId, block.id, {
                        type: block.type,
                        content: {text: content}
                    });
                } catch (err) {
                    console.error("Failed to save block:", err);
                }
            }
        }, 500);

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [content, selectedNoteId, block.id, block.type]);

    // the fence is stripped back out so a code block never exists both inline and as a block
    const handleChange = (newContent: string) => {
        if (onSpawnCodeBlock && countFences(newContent) > countFences(contentRef.current)) {
            const stripped = newContent
                .split("\n")
                .filter(line => !line.trimStart().startsWith(FENCE))
                .join("\n");
            setContent(stripped);
            editorRef.current?.setMarkdown?.(stripped);
            onSpawnCodeBlock();
            return;
        }
        setContent(newContent);
    }

    const handleBlur = async () => {
        if (!selectedNoteId) return;
        const dbTextContent = block.content as TextContent;
        const currentContent = contentRef.current;
        if (currentContent !== dbTextContent.text) {
            try {
                await NoteService.updateBlock(selectedNoteId, block.id, {
                    type: block.type,
                    content: {text: currentContent}
                });
            } catch (err) {
                console.error("Failed to save block:", err);
            }
        }
    };

    async function imageUploadHandler(image: File) {
        return await NoteService.uploadImage(image);
    }


    return (
        <div className="w-full" ref={hostRef}>
            <MDXEditor
                ref={editorRef}
                markdown={content}
                onChange={handleChange}
                onBlur={handleBlur}
                className="mdxeditor"
                plugins={[
                    headingsPlugin(),
                    listsPlugin(),
                    linkPlugin(),
                    quotePlugin(),
                    thematicBreakPlugin(),
                    codeBlockPlugin({
                        defaultCodeBlockLanguage: "text",
                        codeBlockEditorDescriptors: [bareDescriptor(LANGUAGE_MAP)]
                    }),
                    imagePlugin({
                        imageUploadHandler: imageUploadHandler,
                        EditImageToolbar: () => null
                    }),
                    markdownShortcutPlugin()
                ]}
            />
        </div>
    );
}
