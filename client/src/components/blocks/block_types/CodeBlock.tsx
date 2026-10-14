import {useCallback, useEffect, useRef, useState} from "react";
import {TbCopy, TbCopyCheckFilled} from "react-icons/tb";
import type {Block, CodeContent} from "@/types/Note.ts";
import {useNoteContext} from "@/context/NoteContext.tsx";
import {NoteService} from "@/services/NoteService.ts";
import {BareCodeMirror, LanguagePicker} from "./CodeMirrorEditor.tsx";
import {LANGUAGE_MAP} from "./codeLanguages";

const SAVE_DEBOUNCE_MS = 600;

export function CodeBlock({block, autoFocus}: { block: Block; autoFocus?: boolean }) {
    const {selectedNoteId} = useNoteContext();
    const initial = block.content as CodeContent;
    const [code, setCode] = useState(initial?.code ?? "");
    const [language, setLanguage] = useState(initial?.language ?? "text");
    const [copied, setCopied] = useState(false);
    const saveTimeout = useRef<NodeJS.Timeout | null>(null);

    const persist = useCallback((nextCode: string, nextLanguage: string) => {
        if (!selectedNoteId) return;
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => {
            NoteService.updateBlock(selectedNoteId, block.id, {
                type: "code",
                content: {code: nextCode, language: nextLanguage}
            }).catch(err => console.error("Failed to save code block:", err));
        }, SAVE_DEBOUNCE_MS);
    }, [selectedNoteId, block.id]);

    useEffect(() => () => {
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
    }, []);

    const onCodeChange = (next: string) => {
        setCode(next);
        persist(next, language);
    };

    const onLanguageChange = (next: string) => {
        setLanguage(next);
        persist(code, next);
    };

    return (
        <div className="code-panel">
            <div className="code-panel-header">
                <LanguagePicker value={language} options={LANGUAGE_MAP} onChange={onLanguageChange}/>
                <button
                    type="button"
                    onClick={async () => {
                        await navigator.clipboard.writeText(code);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                    }}
                    className="code-panel-button"
                >
                    {copied ? <TbCopyCheckFilled/> : <TbCopy/>}
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <div className="code-panel-body">
                <BareCodeMirror
                    code={code}
                    language={language}
                    onChange={onCodeChange}
                    autoFocus={autoFocus}
                />
            </div>
        </div>
    );
}
