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
        <div className="group/code my-1 overflow-hidden rounded-lg bg-secondary">
            <div className="flex items-center justify-between gap-2 px-2.5 pt-1.5 pb-0.5 opacity-0 transition-opacity duration-150 group-hover/code:opacity-100 focus-within:opacity-100">
                <LanguagePicker value={language} options={LANGUAGE_MAP} onChange={onLanguageChange}/>
                <button
                    onClick={async () => {
                        await navigator.clipboard.writeText(code);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                    }}
                    className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] text-ink-muted transition-colors duration-150 hover:bg-accent"
                >
                    {copied ? <TbCopyCheckFilled/> : <TbCopy/>}
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <div className="px-3 pb-2.5">
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
