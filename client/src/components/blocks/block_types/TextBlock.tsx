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

/* ---------------- CodeMirror 6 (bare) ---------------- */
import {EditorState, Compartment} from "@codemirror/state";
import {EditorView, keymap, drawSelection, highlightActiveLine} from "@codemirror/view";
import {defaultKeymap, history, historyKeymap, indentWithTab} from "@codemirror/commands";
import {indentOnInput, bracketMatching, syntaxHighlighting, defaultHighlightStyle} from "@codemirror/language";
import {closeBrackets, closeBracketsKeymap} from "@codemirror/autocomplete";

/* ---- Languages (install as needed) ----
   npm i @codemirror/lang-javascript @codemirror/lang-python @codemirror/lang-java \
         @codemirror/lang-go @codemirror/lang-html @codemirror/lang-css @codemirror/lang-sql \
         @codemirror/lang-cpp
*/
import {javascript} from "@codemirror/lang-javascript";
import {python} from "@codemirror/lang-python";
import {java} from "@codemirror/lang-java";
import {go as golang} from "@codemirror/lang-go";
import {html} from "@codemirror/lang-html";
import {css} from "@codemirror/lang-css";
import {sql} from "@codemirror/lang-sql";
import {cpp} from "@codemirror/lang-cpp";

/* ---------- Small language picker (controls this block) ---------- */
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
                background: "#1e1e1e",
                color: "#ddd",
                border: "1px solid #333",
                borderRadius: 6,
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
                        backgroundColor: "#0f141c",
                        color: "#f2f4f8",
                        fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                        fontSize: "14px",
                        borderRadius: "8px"
                    },
                    ".cm-gutters": {display: "none !important"},
                    ".cm-content": {caretColor: "#ffffff"},
                    ".cm-cursor": {borderLeftColor: "#ffffff"},
                    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
                        backgroundColor: "#ffffff"
                    }
                }, {dark: true}),

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

    // Keep editor in sync if external code changes
    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        const current = view.state.doc.toString();
        if (current !== code) {
            view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: code}});
        }
    }, [code]);

    // ✅ Only reconfigure the language compartment (do NOT reconfigure everything)
    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
            effects: langCompartment.reconfigure(langExtensionFor(language))
        });
    }, [language]);

    return <div ref={host}/>;
}


/* ---------- Headered editor that connects to MDX via context ---------- */
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

    return (
        <div
            data-nb-codeblock
            style={{
                borderRadius: 10,
                overflow: "hidden",
                border: "1px solid #333",
                background: "#141414",
                margin: "1rem 0"
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "8px 10px",
                    background: "#0f0f0f",
                    borderBottom: "1px solid #2a2a2a"
                }}
            >
                <div style={{display: "flex", alignItems: "center", gap: 8}}>
                    <span style={{fontSize: 12, color: "#aaa"}}>Language:</span>
                    <LanguagePicker value={language} options={languageMap} onChange={(v) => setLanguage(v)}/>
                </div>
                <button
                    onClick={() => navigator.clipboard.writeText(code)}
                    style={{
                        fontSize: 12,
                        color: "#ddd",
                        background: "#1e1e1e",
                        border: "1px solid #333",
                        borderRadius: 6,
                        padding: "4px 8px",
                        cursor: "pointer"
                    }}
                >
                    Copy
                </button>
            </div>

            {/* Editor */}
            <div style={{padding: 10}}>
                <BareCodeMirror code={code} language={language} onChange={setCode}/>
            </div>
        </div>
    );
}

/* ---------- Descriptor that uses our editor (no MDX CM toolbar!) ---------- */
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

    // your languages (unchanged)
    const languageMap = useMemo(
        () => ({
            text: "Plain text",
            ts: "TypeScript",
            python: "Python",
            js: "JavaScript",
            java: "Java",
            go: "Go",
            cpp: "C++",
            c: "C",
            csharp: "C#",
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

                    // Use ONLY codeBlockPlugin with our descriptor
                    codeBlockPlugin({
                        defaultCodeBlockLanguage: "text",
                        codeBlockEditorDescriptors: [bareDescriptor(languageMap)]
                    }),

                    // No codeMirrorPlugin here — we provide our own CM editor now.

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
