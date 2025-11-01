import {
    headingsPlugin,
    linkPlugin,
    listsPlugin,
    markdownShortcutPlugin,
    MDXEditor,
    quotePlugin,
    codeBlockPlugin,
    imagePlugin,
    useCodeBlockEditorContext,
    type CodeBlockEditorDescriptor,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {NoteService} from "@/services/NoteService.ts";
import {useState, useRef, useEffect, useMemo, useRef as useDomRef, useCallback} from "react";
import type {Block, TextContent} from "@/types/Note.ts";
import {EditorState, Compartment} from "@codemirror/state";
import {EditorView, keymap, drawSelection, highlightActiveLine} from "@codemirror/view";
import {defaultKeymap, history, historyKeymap, indentWithTab} from "@codemirror/commands";
import {indentOnInput, bracketMatching, syntaxHighlighting, defaultHighlightStyle} from "@codemirror/language";
import {closeBrackets, closeBracketsKeymap} from "@codemirror/autocomplete";
import {javascript} from "@codemirror/lang-javascript";
import {python} from "@codemirror/lang-python";
import {java} from "@codemirror/lang-java";
import {go as golang} from "@codemirror/lang-go";
import {html} from "@codemirror/lang-html";
import {css} from "@codemirror/lang-css";
import {sql} from "@codemirror/lang-sql";
import {cpp} from "@codemirror/lang-cpp";
import {TbCopy, TbCopyCheckFilled, TbTrash} from "react-icons/tb";
import {
    $getNodeByKey,
    $getRoot,
    $isElementNode,
    ElementNode,
    $createParagraphNode,
    $createTextNode,
    $getSelection,
    $isRangeSelection,
} from "lexical";

function LanguagePicker({
                            value,
                            onChange,
                            options
                        }: {
    value: string | undefined;
    onChange: (lang: string) => void;
    options: Record<string, string>;
}) {
    return (
        <select
            value={value ?? "text"}
            onChange={(e) => onChange(e.target.value)}
            style={{
                background: "#eaeaea",
                color: "#444444",
                border: "1px solid #333",
                padding: "4px 8px",
                fontSize: 12
            }}
        >
            {Object.entries(options).map(([k, label]) => (
                <option key={k} value={k}>
                    {label}
                </option>
            ))}
        </select>
    );
}

type BareEditorProps = {
    code: string;
    language?: string;
    onChange: (next: string) => void;
    onExitUp?: () => void;
    onExitDown?: () => void;
};

function langExtensionFor(key?: string) {
    switch (key) {
        case "js":
        case "jsx":
            return javascript({jsx: true, typescript: false});
        case "ts":
        case "tsx":
            return javascript({jsx: key === "tsx", typescript: true});
        case "python":
            return python();
        case "java":
            return java();
        case "go":
            return golang();
        case "html":
            return html();
        case "css":
            return css();
        case "sql":
            return sql();
        case "c":
        case "cpp":
            return cpp();
        case "csharp":
            return [];
        case "text":
        default:
            return [];
    }
}

function BareCodeMirror({code, language, onChange, onExitUp}: BareEditorProps) {
    const host = useDomRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const langCompartment = useRef(new Compartment()).current;

    useEffect(() => {
        if (!host.current) return;

        const startState = EditorState.create({
            doc: code,
            extensions: [
                keymap.of([...historyKeymap, indentWithTab, ...defaultKeymap, ...closeBracketsKeymap]),
                history(),
                drawSelection(),
                highlightActiveLine(),
                indentOnInput(),
                bracketMatching(),
                closeBrackets(),
                syntaxHighlighting(defaultHighlightStyle),
                keymap.of([
                    {
                        key: "Backspace",
                        run: (view) => {
                            if (view.state.selection.main.from === 0) {
                                onExitUp?.();
                                return true;
                            }
                            return false;
                        }
                    }
                ]),
                EditorView.domEventHandlers({
                    paste: (event) => {
                        event.stopPropagation();
                        return false;
                    },
                    cut: (event) => {
                        event.stopPropagation();
                        return false;
                    },
                    copy: (event) => {
                        event.stopPropagation();
                        return false;
                    },
                    keydown: (event) => {
                        if ((event.metaKey || event.ctrlKey) && (event.key === 'z' || event.key === 'Z')) {
                            event.stopPropagation();
                        }
                        return false;
                    }
                }),
                EditorView.theme(
                    {
                        "&": {
                            backgroundColor: "#f5f5f5",
                            color: "#1f1f1f",
                            fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                            fontSize: "14px"
                        },
                        ".cm-gutters": {display: "none !important"},
                        ".cm-content": {caretColor: "#444444"},
                        ".cm-cursor": {borderLeftColor: "#444444"},
                        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
                            backgroundColor: "#c9c9c9"
                        }
                    },
                    {dark: false}
                ),
                langCompartment.of(langExtensionFor(language))
            ]
        });

        const view = new EditorView({
            state: startState,
            parent: host.current,
            dispatch: (tr) => {
                view.update([tr]);
                if (tr.docChanged) onChange(view.state.doc.toString());
            }
        });

        viewRef.current = view;

        const contentElement = view.contentDOM;
        (contentElement as any).cmView = {view};

        // Auto-focus the editor on mount
        requestAnimationFrame(() => {
            view.focus();
            view.dispatch({selection: {anchor: 0, head: 0}});
        });

        return () => {
            view.destroy();
            viewRef.current = null;
        };
    }, []);

    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        const current = view.state.doc.toString();
        if (current !== code) {
            view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: code}});
        }
    }, [code]);

    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
            effects: langCompartment.reconfigure(langExtensionFor(language))
        });
    }, [language]);

    return <div ref={host}/>;
}

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
                border: isSelected ? "2px solid #2383e2" : "1px solid #333",
                background: "#ffffff",
                margin: "1rem 0",
                boxShadow: isSelected ? "0 0 0 1px #2383e2" : "none",
                transition: "border-color 0.1s, box-shadow 0.1s"
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "8px 10px",
                    background: isSelected ? "#d4e5f7" : "#d3d3d3",
                    borderBottom: "1px solid #2a2a2a",
                    transition: "background-color 0.1s"
                }}
            >
                <div style={{display: "flex", alignItems: "center", gap: 8}}>
                    <span style={{fontSize: 12, color: "#444444"}}>Language:</span>
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
                            fontSize: 12,
                            color: "#444444",
                            background: "#eaeaea",
                            border: "1px solid #333",
                            padding: "4px 8px",
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
                            color: "#666666",
                            background: "transparent",
                            border: "none",
                            padding: "4px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            transition: "color 0.2s"
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#dc3545";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#666666";
                        }}
                    >
                        <TbTrash/>
                    </button>
                </div>
            </div>

            <div style={{padding: 10}}>
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

export function TextBlock({block}: { block: Block }) {
    const {selectedNoteId} = useNoteContext();
    const editorRef = useRef<any>(null);
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

    const handleChange = (newContent: string) => {
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

    const languageMap = useMemo(
        () => ({
            text: "Plain text",
            python: "Python",
            ts: "TypeScript",
            js: "JavaScript",
            java: "Java",
            go: "Go",
            cpp: "C++",
            c: "C",
            html: "HTML",
            css: "CSS",
            sql: "SQL"
        }),
        []
    );

    return (
        <div className="p-2 bg-white w-[834px]">
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
                    codeBlockPlugin({
                        defaultCodeBlockLanguage: "text",
                        codeBlockEditorDescriptors: [bareDescriptor(languageMap)]
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
