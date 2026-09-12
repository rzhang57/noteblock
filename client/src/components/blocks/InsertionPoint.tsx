import {DocumentTextIcon, RectangleGroupIcon, CodeBracketIcon} from "@heroicons/react/24/outline";

export type InsertKind = "text" | "canvas" | "code";

interface InsertionPointProps {
    onAdd: (kind: InsertKind) => void;
    persistent?: boolean;
}

export function InsertionPoint({onAdd, persistent}: InsertionPointProps) {
    const lineClasses = persistent
        ? "border-rule"
        : "border-transparent group-hover/insert:border-rule";
    const actionClasses = persistent
        ? "opacity-100"
        : "opacity-0 group-hover/insert:opacity-100";

    return (
        <div className="group/insert relative h-0">
            <div className="absolute inset-x-0 top-0 -translate-y-1/2 h-8 cursor-pointer"/>
            <div
                className={`absolute inset-x-0 top-0 -translate-y-1/2 border-t transition-colors duration-150 pointer-events-none ${lineClasses}`}
            />
            <div className="absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                <div className={`flex gap-1 transition-opacity duration-150 ${actionClasses}`}>
                    <button
                        onClick={() => onAdd("text")}
                        className="surface-pop inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-ink transition-colors duration-150 hover:bg-accent"
                        title="Add text block"
                    >
                        <DocumentTextIcon className="h-3.5 w-3.5 text-ink-muted"/>
                        Text
                    </button>
                    <button
                        onClick={() => onAdd("canvas")}
                        className="surface-pop inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-ink transition-colors duration-150 hover:bg-accent"
                        title="Add canvas block"
                    >
                        <RectangleGroupIcon className="h-3.5 w-3.5 text-ink-muted"/>
                        Canvas
                    </button>
                    <button
                        onClick={() => onAdd("code")}
                        className="surface-pop inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-ink transition-colors duration-150 hover:bg-accent"
                        title="Add code block"
                    >
                        <CodeBracketIcon className="h-3.5 w-3.5 text-ink-muted"/>
                        Code
                    </button>
                </div>
            </div>
        </div>
    );
}
