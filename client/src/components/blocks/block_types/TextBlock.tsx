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
    realmPlugin,
    createRootEditorSubscription$,
    $isCodeBlockNode
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
import {TbCopy, TbCopyCheckFilled} from "react-icons/tb";
import {
    $getNodeByKey,
    $getRoot,
    $isElementNode,
    ElementNode,
    $createParagraphNode,
    $createTextNode,
    $getSelection,
    $isRangeSelection,
    type RangeSelection
} from "lexical";
import {
    KEY_BACKSPACE_COMMAND,
    KEY_ARROW_UP_COMMAND,
    KEY_ARROW_DOWN_COMMAND,
    COMMAND_PRIORITY_CRITICAL
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

function BareCodeMirror({code, language, onChange, onExitUp, onExitDown}: BareEditorProps) {
    const host = useDomRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const langCompartment = useRef(new Compartment()).current;

    useEffect(() => {
        if (!host.current) return;

        const startState = EditorState.create({
            doc: code,
            extensions: [
                keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap]),
                history(),
                drawSelection(),
                highlightActiveLine(),
                indentOnInput(),
                bracketMatching(),
                closeBrackets(),
                syntaxHighlighting(defaultHighlightStyle),
                keymap.of([
                    {
                        key: "ArrowUp",
                        run: (view) => {
                            const head = view.state.selection.main.head;
                            const line = view.state.doc.lineAt(head);
                            if (head === line.from) {
                                view.dom.blur();
                                onExitUp?.();
                                return true;
                            }
                            return false;
                        }
                    },
                    {
                        key: "ArrowDown",
                        run: (view) => {
                            const head = view.state.selection.main.head;
                            const line = view.state.doc.lineAt(head);
                            if (head === line.to && head === view.state.doc.length) {
                                view.dom.blur();
                                onExitDown?.();
                                return true;
                            }
                            return false;
                        }
                    },
                    {
                        key: "Backspace",
                        run: (view) => {
                            if (view.state.selection.main.from === 0) {
                                view.dom.blur();
                                onExitUp?.();
                                return true;
                            }
                            return false;
                        }
                    }
                ]),
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

    const moveCaretAfterBlock = useCallback(() => {
        const cm = document.querySelector('[data-nb-codeblock] .cm-editor') as HTMLElement | null;
        cm?.blur();

        parentEditor.update(() => {
            const node = $getNodeByKey(lexicalNode.getKey());
            if (!node) return;

            const next = node.getNextSibling();
            if (next) {
                if ($isElementNode(next as ElementNode)) (next as ElementNode).selectStart();
                else (next as any).select?.();
            } else {
                const root = $getRoot();
                const p = $createParagraphNode().append($createTextNode(""));
                root.append(p);
                p.selectStart();
            }
        });

        requestAnimationFrame(() => parentEditor.focus());
    }, [parentEditor, lexicalNode]);

    return (
        <div
            data-nb-codeblock
            style={{
                overflow: "hidden",
                border: "1px solid #333",
                background: "#ffffff",
                margin: "1rem 0"
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "8px 10px",
                    background: "#d3d3d3",
                    borderBottom: "1px solid #2a2a2a"
                }}
            >
                <div style={{display: "flex", alignItems: "center", gap: 8}}>
                    <span style={{fontSize: 12, color: "#444444"}}>Language:</span>
                    <LanguagePicker value={language} options={languageMap} onChange={(v) => setLanguage(v)}/>
                </div>
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
            </div>

            <div style={{padding: 10}}>
                <BareCodeMirror
                    code={code}
                    language={language}
                    onChange={setCode}
                    onExitUp={moveCaretBeforeBlock}
                    onExitDown={moveCaretAfterBlock}
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

function isAtStartOfTopParagraph() {
    const sel = $getSelection();
    if (!$isRangeSelection(sel) || !sel.isCollapsed()) return false;
    const range = sel as RangeSelection;
    const anchor = range.anchor;

    const top = anchor.getNode().getTopLevelElementOrThrow();
    if (top.getType() !== "paragraph") return false;

    let cursorBefore = 0;
    let child = top.getFirstChild();
    const anchorNode = anchor.getNode();
    while (child && child !== anchorNode) {
        const size =
            (child as any).getTextContentSize?.() ??
            ((child as any).getTextContent?.() || "").length;
        cursorBefore += size;
        child = child.getNextSibling();
    }
    return cursorBefore === 0 && anchor.offset === 0;
}

function isAtEndOfTopParagraph() {
    const sel = $getSelection();
    if (!$isRangeSelection(sel) || !sel.isCollapsed()) return false;
    const range = sel as RangeSelection;
    const anchor = range.anchor;

    const top = anchor.getNode().getTopLevelElementOrThrow();
    if (top.getType() !== "paragraph") return false;

    let total = 0;
    let before = 0;
    let child = top.getFirstChild();
    const anchorNode = anchor.getNode();

    while (child) {
        const size =
            (child as any).getTextContentSize?.() ??
            ((child as any).getTextContent?.() || "").length;
        total += size;
        if (child === anchorNode) before = total - size + anchor.offset;
        child = child.getNextSibling();
    }
    return before === total;
}

const keyboardTravelPlugin = realmPlugin({
    init(realm) {
        realm.pub(createRootEditorSubscription$, (editor) => {
            const unBackspace = editor.registerCommand(
                KEY_BACKSPACE_COMMAND,
                () => {
                    if (!isAtStartOfTopParagraph()) return false;
                    const sel = $getSelection() as RangeSelection;
                    const top = sel.anchor.getNode().getTopLevelElementOrThrow();
                    const prev = top.getPreviousSibling();
                    if (prev && $isCodeBlockNode(prev)) {
                        (prev as any).select();
                        return true;
                    }
                    return false;
                },
                COMMAND_PRIORITY_CRITICAL
            );

            const unUp = editor.registerCommand(
                KEY_ARROW_UP_COMMAND,
                () => {
                    if (!isAtStartOfTopParagraph()) return false;
                    const sel = $getSelection() as RangeSelection;
                    const top = sel.anchor.getNode().getTopLevelElementOrThrow();
                    const prev = top.getPreviousSibling();
                    if (prev && $isCodeBlockNode(prev)) {
                        (prev as any).select();
                        return true;
                    }
                    return false;
                },
                COMMAND_PRIORITY_CRITICAL
            );

            const unDown = editor.registerCommand(
                KEY_ARROW_DOWN_COMMAND,
                () => {
                    if (!isAtEndOfTopParagraph()) return false;
                    const sel = $getSelection() as RangeSelection;
                    const top = sel.anchor.getNode().getTopLevelElementOrThrow();
                    const next = top.getNextSibling();
                    if (next && $isCodeBlockNode(next)) {
                        (next as any).select();
                        return true;
                    }
                    return false;
                },
                COMMAND_PRIORITY_CRITICAL
            );

            return () => {
                unBackspace();
                unUp();
                unDown();
            };
        });
    }
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

    useEffect(() => {
        contentRef.current = content;
    }, [content]);

    // Auto-save with debouncing
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
        }, 500); // Save 500ms after typing stops

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
        const currentContent = contentRef.current; // Use ref instead of state
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
                    keyboardTravelPlugin(),
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
