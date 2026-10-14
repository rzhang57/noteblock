import {Code2, PenTool, Type} from "lucide-react";

export type InsertKind = "text" | "canvas" | "code";

interface InsertionPointProps {
    onAdd: (kind: InsertKind) => void;
    persistent?: boolean;
}

const CHOICES: {kind: InsertKind; label: string; icon: React.ReactNode}[] = [
    {kind: "text", label: "Text", icon: <Type/>},
    {kind: "canvas", label: "Canvas", icon: <PenTool/>},
    {kind: "code", label: "Code", icon: <Code2/>},
];

export function InsertionPoint({onAdd, persistent}: InsertionPointProps) {
    return (
        <div className="insertion-point" data-persistent={persistent || undefined}>
            <div className="insertion-point-hit"/>
            <div className="insertion-point-rule"/>
            <div className="insertion-point-choices">
                <div className="segmented">
                    {CHOICES.map(({kind, label, icon}) => (
                        <button key={kind} type="button" onClick={() => onAdd(kind)} title={`Add ${label.toLowerCase()} block`}>
                            {icon}
                            {label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
