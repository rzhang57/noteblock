import {javascript} from "@codemirror/lang-javascript";
import {python} from "@codemirror/lang-python";
import {java} from "@codemirror/lang-java";
import {go as golang} from "@codemirror/lang-go";
import {html} from "@codemirror/lang-html";
import {css} from "@codemirror/lang-css";
import {sql} from "@codemirror/lang-sql";
import {cpp} from "@codemirror/lang-cpp";

export const LANGUAGE_MAP: Record<string, string> = {
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
};

export function langExtensionFor(key?: string) {
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
