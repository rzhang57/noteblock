// components/InlineRename.tsx
import {useState, useEffect, useRef} from "react";

interface InlineRenameProps {
    initialValue: string;
    onSave: (newName: string) => void;
    onCancel: () => void;
}

export const InlineRename: React.FC<InlineRenameProps> = ({
                                                              initialValue,
                                                              onSave,
                                                              onCancel
                                                          }) => {
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            onCancel();
        }
    };

    const handleSave = () => {
        const trimmed = value.trim();
        if (trimmed && trimmed !== initialValue) {
            onSave(trimmed);
        } else {
            onCancel();
        }
    };

    return (
        <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="bg-white border border-blue-500 rounded px-1 py-0.5 text-sm w-full"
            onClick={(e) => e.stopPropagation()}
        />
    );
};