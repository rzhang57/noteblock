"use client"
import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";

interface Folder {
    id: number;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export default function FolderPage() {
    const [folders, setFolders] = useState<Folder[]>([]);
    const [newFolderName, setNewFolderName] = useState<string>("");

    // Fetch folders from the backend API
    const fetchFolders = async () => {
        try {
            const response = await fetch("http://localhost:8080/api/folders");
            if (!response.ok) {
                throw new Error("Error fetching folders");
            }
            const data = await response.json();
            setFolders(data);
        } catch (error) {
            console.error("Error fetching folders:", error);
        }
    };

    useEffect(() => {
        fetchFolders();
    }, []);

    const handleCreateFolder = async (e: FormEvent) => {
        e.preventDefault();
        if (!newFolderName.trim()) return;

        try {
            const response = await fetch("http://localhost:8080/api/folders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newFolderName }),
            });
            if (!response.ok) {
                throw new Error("Failed to create folder");
            }
            setNewFolderName("");
            fetchFolders();
        } catch (error) {
            console.error("Error creating folder:", error);
        }
    };

    return (
        <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
            <header style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between" }}>
                <h1>Folders</h1>
                <Link href="/public">
                    Home
                </Link>
            </header>

            <form onSubmit={handleCreateFolder} style={{ marginBottom: "1.5rem", display: "flex", gap: "1rem" }}>
                <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="New Folder Name"
                    style={{ flexGrow: 1, padding: "0.5rem", fontSize: "1rem" }}
                />
                <button type="submit" style={{ padding: "0.5rem 1rem", fontSize: "1rem" }}>
                    Create Folder
                </button>
            </form>

            {folders.length === 0 ? (
                <p>No folders found. Create one to get started!</p>
            ) : (
                <ul style={{ listStyle: "none", padding: 0 }}>
                    {folders.map((folder) => (
                        <li key={folder.id} style={{ marginBottom: "1rem", padding: "1rem", border: "1px solid #ccc", borderRadius: "4px" }}>
                            <Link href={`/folders/${folder.id}`}>
                                {folder.name}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
