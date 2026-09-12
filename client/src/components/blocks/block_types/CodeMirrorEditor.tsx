import {useRef, useEffect, useRef as useDomRef} from "react";
import {EditorState, Compartment} from "@codemirror/state";
import {EditorView, keymap, drawSelection, highlightActiveLine} from "@codemirror/view";
import {defaultKeymap, history, historyKeymap, indentWithTab} from "@codemirror/commands";
import {indentOnInput, bracketMatching, syntaxHighlighting, defaultHighlightStyle} from "@codemirror/language";
import {closeBrackets, closeBracketsKeymap} from "@codemirror/autocomplete";
import {langExtensionFor} from "./codeLanguages";

export function LanguagePicker({
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
                background: "transparent",
                color: "var(--ink-muted)",
                border: "none",
                borderRadius: 4,
                padding: "2px 4px",
                fontSize: 11,
                cursor: "pointer"
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

export type BareEditorProps = {
    code: string;
    language?: string;
    onChange: (next: string) => void;
    onExitUp?: () => void;
    onExitDown?: () => void;
    autoFocus?: boolean;
};

export function BareCodeMirror({code, language, onChange, onExitUp, autoFocus = true}: BareEditorProps) {
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
                EditorView.theme(
                    {
                        "&": {
                            backgroundColor: "transparent",
                            color: "var(--ink)",
                            fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                            fontSize: "13.5px"
                        },
                        ".cm-gutters": {display: "none !important"},
                        ".cm-content": {caretColor: "var(--ink)", padding: "0"},
                        ".cm-cursor": {borderLeftColor: "var(--ink)"},
                        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
                            backgroundColor: "color-mix(in srgb, var(--ink-faint) 35%, transparent)"
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
        (contentElement as unknown as { cmView: unknown }).cmView = {view};

        if (autoFocus) {
            requestAnimationFrame(() => {
                view.focus();
                view.dispatch({selection: {anchor: 0, head: 0}});
            });
        }

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
