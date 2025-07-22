"use client"

import {FileText, Sparkles, Calendar, MapPin} from "lucide-react"
import type {FileSystemStructure} from "@/types/filesystem"

interface MainContentProps {
    selectedNote: string | null
    fileSystem: FileSystemStructure
}

function formatMarkdown(content: string) {
    return content
        .replace(/^# (.*$)/gm, '<h1 class="text-3xl font-bold text-gray-900 mb-6 mt-8 first:mt-0">$1</h1>')
        .replace(/^## (.*$)/gm, '<h2 class="text-2xl font-semibold text-gray-800 mb-4 mt-6">$1</h2>')
        .replace(/^### (.*$)/gm, '<h3 class="text-xl font-medium text-gray-700 mb-3 mt-4">$1</h3>')
        .replace(/^\*\*(.*?)\*\*/gm, '<strong class="font-semibold text-gray-900">$1</strong>')
        .replace(/^\*(.*?)\*/gm, '<em class="italic text-gray-700">$1</em>')
        .replace(/^- (.*$)/gm, '<li class="ml-4 mb-1 text-gray-700">• $1</li>')
        .replace(
            /^- \[ \] (.*$)/gm,
            '<li class="ml-4 mb-1 text-gray-600 flex items-center gap-2"><input type="checkbox" class="rounded" disabled> $1</li>',
        )
        .replace(
            /^- \[x\] (.*$)/gm,
            '<li class="ml-4 mb-1 text-gray-600 flex items-center gap-2"><input type="checkbox" class="rounded" checked disabled> $1</li>',
        )
        .replace(/\n\n/g, '</p><p class="mb-4 text-gray-700 leading-relaxed">')
        .replace(/\n/g, "<br>")
}

export function ContentPanel({selectedNote, fileSystem}: MainContentProps) {
    if (!selectedNote) {
        return (
            <div
                className="w-full max-w-4xl flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 mx-auto">
                <div className="text-center max-w-lg">
                    <div className="mb-8">
                        <div className="relative">
                            <Sparkles className="h-20 w-20 text-blue-500 mx-auto mb-6"/>
                            <div
                                className="absolute -top-2 -right-2 w-4 h-4 bg-yellow-400 rounded-full animate-pulse"></div>
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-4">Welcome to Noteblock</h1>
                        <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                            Your personal space for thoughts, ideas, and knowledge. Select a note from the sidebar to
                            start exploring
                            your digital mind.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 text-sm">
                        <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-white/20 shadow-sm">
                            <FileText className="h-6 w-6 text-blue-500 mx-auto mb-2"/>
                            <p className="text-gray-700 font-medium">Rich Note Display</p>
                            <p className="text-gray-500 text-xs mt-1">Beautiful formatting for your thoughts</p>
                        </div>

                        <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-white/20 shadow-sm">
                            <Calendar className="h-6 w-6 text-green-500 mx-auto mb-2"/>
                            <p className="text-gray-700 font-medium">Organized Structure</p>
                            <p className="text-gray-500 text-xs mt-1">Keep your notes perfectly organized</p>
                        </div>
                    </div>

                    <div className="mt-8 text-xs text-gray-500">
                        <MapPin className="h-4 w-4 inline mr-1"/>
                        Click any note in the sidebar to begin
                    </div>
                </div>
            </div>
        )
    }

    const note = fileSystem[selectedNote]
    if (!note || note.type !== "note") {
        return (
            <div className="w-full max-w-4xl flex items-center justify-center bg-white mx-auto">
                <div className="text-center">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4"/>
                    <p className="text-gray-500">Note not found</p>
                </div>
            </div>
        )
    }

    const formattedContent = formatMarkdown(note.content || "")

    return (
        <div className="w-full max-w-4xl bg-white overflow-auto mx-auto">
            <div className="w-full">
                {/* Note Header */}
                <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white px-8 py-6">
                    <div className="flex items-start gap-3">
                        <FileText className="h-6 w-6 text-blue-500 mt-1 flex-shrink-0"/>
                        <div className="min-w-0 flex-1">
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">{note.name}</h1>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3"/>
                    {note.path}
                </span>
                                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3"/>
                  Last modified today
                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Note Content */}
                <div className="px-8 py-8">
                    <div className="prose prose-lg max-w-none">
                        <div
                            className="leading-relaxed"
                            dangerouslySetInnerHTML={{
                                __html: `<p class="mb-4 text-gray-700 leading-relaxed">${formattedContent}</p>`,
                            }}
                        />
                    </div>

                    {(!note.content || note.content.trim() === "") && (
                        <div className="text-center py-12">
                            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4"/>
                            <p className="text-gray-500 text-lg mb-2">This note is empty</p>
                            <p className="text-gray-400 text-sm">Start writing to capture your thoughts...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
