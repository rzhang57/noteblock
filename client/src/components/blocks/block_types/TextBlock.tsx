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
    type CodeBlockEditorDescriptor
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {NoteService} from "@/services/NoteService.ts";
import {useState, useRef, useEffect, useMemo, useRef as useDomRef} from "react";
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

/* ---------- Our bare CodeMirror editor (no MDXEditor toolbar) ---------- */
type BareEditorProps = {
    code: string;
    language?: string;
    onChange: (next: string) => void;
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
            return cpp(); // good enough for C/C++
        case "csharp":
            // No official CM6 lang; fall back to plain highlighting
            return [];
        case "text":
        default:
            return [];
    }
}

function BareCodeMirror({code, language, onChange}: BareEditorProps) {
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

                // theme: darker bg, brighter foreground, no line numbers
                EditorView.theme({
                    "&": {
                        backgroundColor: "#f5f5f5",
                        color: "#1f1f1f",
                        fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                        fontSize: "14px",
                    },
                    ".cm-gutters": {display: "none !important"},
                    ".cm-content": {caretColor: "#444444"},
                    ".cm-cursor": {borderLeftColor: "#444444"},
                    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
                        backgroundColor: "#c9c9c9"
                    }
                }, {dark: false}),

                // language lives in a compartment, so we can swap it without losing the rest
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
    const {setCode, setLanguage} = useCodeBlockEditorContext();
    const [copied, setCopied] = useState(false);

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
                    {copied ? <TbCopyCheckFilled style={{marginRight: 4}}/> :
                        <TbCopy style={{marginRight: 4}}/>}
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>

            {/* Editor */}
            <div style={{padding: 10}}>
                <BareCodeMirror code={code} language={language} onChange={setCode}/>
            </div>
        </div>
    );
}

const bareDescriptor = (languageMap: Record<string, string>): CodeBlockEditorDescriptor => ({
    priority: 100, // keep ours on remounts/language changes
    match: () => true,
    Editor: (p: any) => (
        <HeaderedBareEditor
            code={p.code}
            language={p.language}
            languageMap={languageMap}
        />
    )
});

export function TextBlock({block}: { block: Block }) {
    const {selectedNoteId} = useNoteContext();
    const editorRef = useRef<any>(null);
    const [content, setContent] = useState(() => {
        const textContent = block.content as TextContent;
        return textContent.text ?? "";
    });

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key === "`") {
                e.preventDefault();
                insertCodeBlock();
            }
            if (e.ctrlKey && e.key === "k") {
                e.preventDefault();
                insertCodeBlock();
            }
        };
        document.addEventListener("keydown", handleGlobalKeyDown);
        return () => document.removeEventListener("keydown", handleGlobalKeyDown);
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
                    content: {text: content}
                });
            } catch (err) {
                console.error("Failed to save block:", err);
            }
        }
    };

    const insertCodeBlock = () => {
        const currentContent = content;
        const codeBlockMarkdown = currentContent.endsWith("\n") ? "```\n\n```\n" : "\n```\n\n```\n";
        setContent((prev) => prev + codeBlockMarkdown);
    };

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
                onChange={setContent}
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
