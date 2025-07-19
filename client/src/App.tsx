import {useCallback, useState} from 'react'
import './App.css'
import type {FileSystemStructure} from "@/types/filesystem.ts";
import {NavigationHeader} from "@/components/navigation-header.tsx";
import {MainContent} from "@/components/main-content.tsx";
import {NotebookSidebar} from "@/components/notebook-sidebar.tsx";

const initialFileSystem: FileSystemStructure = {
    "/": {
        id: "/",
        name: "Root",
        type: "folder",
        path: "/",
        children: ["projects", "personal", "archive", "quick-note", "meeting-notes", "ideas"],
    },
    projects: {
        id: "projects",
        name: "Projects",
        type: "folder",
        path: "/projects",
        children: ["web-app", "mobile-app", "project-notes"],
    },
    personal: {
        id: "personal",
        name: "Personal",
        type: "folder",
        path: "/personal",
        children: ["journal", "goals", "recipes"],
    },
    archive: {
        id: "archive",
        name: "Archive",
        type: "folder",
        path: "/archive",
        children: ["old-projects", "completed-tasks"],
    },
    "web-app": {
        id: "web-app",
        name: "Web App",
        type: "folder",
        path: "/projects/web-app",
        children: ["requirements", "design-notes", "technical-specs"],
    },
    "mobile-app": {
        id: "mobile-app",
        name: "Mobile App",
        type: "folder",
        path: "/projects/mobile-app",
        children: ["wireframes", "user-stories"],
    },
    "quick-note": {
        id: "quick-note",
        name: "Quick Note",
        type: "note",
        path: "/quick-note",
        content:
            "# Quick Note\n\nThis is a quick note for testing the new interface. You can write your thoughts here and they'll be displayed beautifully.\n\n## Features\n- Clean typography\n- Proper spacing\n- Easy to read\n\nStart writing your ideas!",
    },
    "meeting-notes": {
        id: "meeting-notes",
        name: "Meeting Notes",
        type: "note",
        path: "/meeting-notes",
        content:
            "# Meeting Notes - Project Kickoff\n\n**Date:** Today\n**Attendees:** Team members\n\n## Agenda\n1. Project overview\n2. Timeline discussion\n3. Resource allocation\n\n## Action Items\n- [ ] Set up project repository\n- [ ] Create initial wireframes\n- [ ] Schedule next meeting\n\n## Notes\nGreat discussion about the project direction. Everyone is aligned on the goals.",
    },
    ideas: {
        id: "ideas",
        name: "Ideas",
        type: "note",
        path: "/ideas",
        content:
            "# Random Ideas\n\nA collection of thoughts and inspiration:\n\n## App Ideas\n- Note-taking app with block-based editing\n- Task manager with natural language processing\n- Reading list with smart recommendations\n\n## Design Inspiration\n- Minimalist interfaces\n- Clean typography\n- Thoughtful spacing\n\n*Remember: The best ideas come when you're not trying to force them.*",
    },
    "project-notes": {
        id: "project-notes",
        name: "Project Notes",
        type: "note",
        path: "/projects/project-notes",
        content: "# Project Notes\n\nGeneral notes about ongoing projects and ideas for future development.",
    },
    requirements: {
        id: "requirements",
        name: "Requirements",
        type: "note",
        path: "/projects/web-app/requirements",
        content:
            "# Web App Requirements\n\n## Functional Requirements\n- User authentication\n- Data persistence\n- Real-time updates\n\n## Non-functional Requirements\n- Fast loading times\n- Mobile responsive\n- Accessible design",
    },
    "design-notes": {
        id: "design-notes",
        name: "Design Notes",
        type: "note",
        path: "/projects/web-app/design-notes",
        content:
            "# Design Notes\n\n## Color Palette\n- Primary: Blue (#3B82F6)\n- Secondary: Gray (#6B7280)\n- Accent: Green (#10B981)\n\n## Typography\n- Headings: Inter Bold\n- Body: Inter Regular\n- Code: JetBrains Mono",
    },
    "technical-specs": {
        id: "technical-specs",
        name: "Technical Specs",
        type: "note",
        path: "/projects/web-app/technical-specs",
        content:
            "# Technical Specifications\n\n## Architecture\n- Frontend: React with TypeScript\n- Backend: Node.js with Express\n- Database: PostgreSQL\n- Hosting: Vercel\n\n## Key Features\n- Server-side rendering\n- API-first design\n- Progressive web app capabilities",
    },
    wireframes: {
        id: "wireframes",
        name: "Wireframes",
        type: "note",
        path: "/projects/mobile-app/wireframes",
        content:
            "# Mobile App Wireframes\n\n## Screen Flow\n1. Splash screen\n2. Onboarding\n3. Main dashboard\n4. Settings\n\n## Key Screens\n- Login/Register\n- Home feed\n- Profile page\n- Search functionality",
    },
    "user-stories": {
        id: "user-stories",
        name: "User Stories",
        type: "note",
        path: "/projects/mobile-app/user-stories",
        content:
            "# User Stories\n\n## Epic: User Management\n- As a user, I want to create an account\n- As a user, I want to log in securely\n- As a user, I want to update my profile\n\n## Epic: Content Creation\n- As a user, I want to create posts\n- As a user, I want to edit my content\n- As a user, I want to delete posts",
    },
    journal: {
        id: "journal",
        name: "Journal",
        type: "note",
        path: "/personal/journal",
        content:
            "# Personal Journal\n\n## Today's Thoughts\n\nReflecting on the day and planning for tomorrow. It's important to take time to process experiences and learn from them.\n\n### What went well:\n- Productive work session\n- Good conversation with a friend\n- Learned something new\n\n### What to improve:\n- Better time management\n- More focused deep work\n- Regular breaks",
    },
    goals: {
        id: "goals",
        name: "Goals",
        type: "note",
        path: "/personal/goals",
        content:
            "# Personal & Professional Goals\n\n## Short-term (3 months)\n- [ ] Complete current project\n- [ ] Learn new programming language\n- [ ] Establish better work-life balance\n\n## Long-term (1 year)\n- [ ] Launch side project\n- [ ] Improve public speaking skills\n- [ ] Travel to new places\n\n## Life Goals\n- Build meaningful relationships\n- Contribute to open source\n- Maintain physical and mental health",
    },
    recipes: {
        id: "recipes",
        name: "Recipes",
        type: "note",
        path: "/personal/recipes",
        content:
            "# Favorite Recipes\n\n## Pasta Carbonara\n\n**Ingredients:**\n- 400g spaghetti\n- 200g pancetta\n- 4 large eggs\n- 100g Pecorino Romano\n- Black pepper\n\n**Instructions:**\n1. Cook pasta in salted water\n2. Fry pancetta until crispy\n3. Mix eggs with cheese\n4. Combine everything off heat\n5. Serve immediately\n\n*The key is timing - don't let the eggs scramble!*",
    },
    "old-projects": {
        id: "old-projects",
        name: "Old Projects",
        type: "note",
        path: "/archive/old-projects",
        content:
            "# Archive of Completed Projects\n\n## 2023 Projects\n- Portfolio website redesign\n- Mobile app prototype\n- Blog migration\n\n## 2022 Projects\n- E-commerce platform\n- Task management tool\n- Learning management system\n\n*Good to look back and see the progress made over time.*",
    },
    "completed-tasks": {
        id: "completed-tasks",
        name: "Completed Tasks",
        type: "note",
        path: "/archive/completed-tasks",
        content:
            "# Completed Tasks\n\n## This Week\n- ✅ Finish project documentation\n- ✅ Code review for team member\n- ✅ Update portfolio\n- ✅ Plan next sprint\n\n## Last Week\n- ✅ Client presentation\n- ✅ Bug fixes\n- ✅ Performance optimization\n- ✅ Team retrospective\n\n*Celebrating completed work is important for motivation!*",
    },
}

export default function App() {
    const [fileSystem] = useState<FileSystemStructure>(initialFileSystem)
    const [selectedNote, setSelectedNote] = useState<string | null>(null)
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["/", "projects"]))
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [navigationHistory, setNavigationHistory] = useState<string[]>([])
    const [historyIndex, setHistoryIndex] = useState(-1)

    const addToHistory = useCallback(
        (noteId: string | null) => {
            setNavigationHistory((prev) => {
                const newHistory = prev.slice(0, historyIndex + 1)
                newHistory.push(noteId || "home")
                return newHistory
            })
            setHistoryIndex((prev) => prev + 1)
        },
        [historyIndex],
    )

    const handleNoteSelect = useCallback(
        (noteId: string) => {
            const item = fileSystem[noteId]
            if (item && item.type === "note") {
                addToHistory(noteId)
                setSelectedNote(noteId)
            }
        },
        [fileSystem, addToHistory],
    )

    const handleNavigateHome = useCallback(() => {
        addToHistory(null)
        setSelectedNote(null)
    }, [addToHistory])

    const handleFolderToggle = useCallback((folderId: string) => {
        setExpandedFolders((prev) => {
            const newSet = new Set(prev)
            if (newSet.has(folderId)) {
                newSet.delete(folderId)
            } else {
                newSet.add(folderId)
            }
            return newSet
        })
    }, [])

    const navigateBack = useCallback(() => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1
            setHistoryIndex(newIndex)
            const historyItem = navigationHistory[newIndex]
            setSelectedNote(historyItem === "home" ? null : historyItem)
        }
    }, [historyIndex, navigationHistory])

    const navigateForward = useCallback(() => {
        if (historyIndex < navigationHistory.length - 1) {
            const newIndex = historyIndex + 1
            setHistoryIndex(newIndex)
            const historyItem = navigationHistory[newIndex]
            setSelectedNote(historyItem === "home" ? null : historyItem)
        }
    }, [historyIndex, navigationHistory])

    const navigateToPath = useCallback(
        (noteId: string) => {
            const item = fileSystem[noteId]
            if (item && item.type === "note") {
                addToHistory(noteId)
                setSelectedNote(noteId)
            }
        },
        [fileSystem, addToHistory],
    )

    const canGoBack = historyIndex > 0
    const canGoForward = historyIndex < navigationHistory.length - 1

    return (
        <div className="h-screen bg-gray-50 flex flex-col">
            {/* Navigation Header */}
            <NavigationHeader
                selectedNote={selectedNote}
                fileSystem={fileSystem}
                canGoBack={canGoBack}
                canGoForward={canGoForward}
                onNavigateBack={navigateBack}
                onNavigateForward={navigateForward}
                onNavigateToPath={navigateToPath}
                onNavigateHome={handleNavigateHome}
                sidebarCollapsed={sidebarCollapsed}
                onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            />

            {/* Main Layout */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                {!sidebarCollapsed && (
                    <div className="w-80 flex-shrink-0">
                        <NotebookSidebar
                            fileSystem={fileSystem}
                            expandedFolders={expandedFolders}
                            selectedNote={selectedNote}
                            onNoteSelect={handleNoteSelect}
                            onFolderToggle={handleFolderToggle}
                        />
                    </div>
                )}

                {/* Main Content */}
                <div className="flex-1 flex justify-center overflow-hidden">
                    <MainContent selectedNote={selectedNote} fileSystem={fileSystem} />
                </div>
            </div>
        </div>
    )
}

