"use client"

import { ChevronLeft, ChevronRight, Menu, Home, ChevronRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { FileSystemStructure } from "@/types/filesystem"
import { cn } from "@/lib/utils"

interface NavigationHeaderProps {
  selectedNote: string | null
  fileSystem: FileSystemStructure
  canGoBack: boolean
  canGoForward: boolean
  onNavigateBack: () => void
  onNavigateForward: () => void
  onNavigateToPath: (noteId: string) => void
  onNavigateHome: () => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

export function NavigationHeader({
  selectedNote,
  fileSystem,
  canGoBack,
  canGoForward,
  onNavigateBack,
  onNavigateForward,
  onNavigateToPath,
  onNavigateHome,
  sidebarCollapsed,
  onToggleSidebar,
}: NavigationHeaderProps) {
  const getPathSegments = () => {
    if (!selectedNote) return []

    const note = fileSystem[selectedNote]
    if (!note) return []

    const pathParts = note.path.split("/").filter(Boolean)
    const segments = [{ name: "Home", id: "home", type: "home" as const }]

    let currentPath = ""
    pathParts.forEach((part, index) => {
      currentPath += `/${part}`

      // Find the item for this path segment
      const item = Object.values(fileSystem).find((item) => item.path === currentPath)
      if (item) {
        segments.push({
          name: item.name,
          id: item.id,
          type: item.type,
        })
      }
    })

    return segments
  }

  const pathSegments = getPathSegments()

  const handleSegmentClick = (segment: { name: string; id: string; type: "home" | "folder" | "note" }) => {
    if (segment.type === "home") {
      onNavigateHome()
    } else if (segment.type === "note") {
      onNavigateToPath(segment.id)
    } else if (segment.type === "folder") {
      // For folders, we'll navigate to home since we don't have folder views
      onNavigateHome()
    }
  }

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4">
      {/* Sidebar Toggle */}
      <Button variant="ghost" size="sm" onClick={onToggleSidebar} className="p-2">
        <Menu className="h-4 w-4" />
      </Button>

      {/* Navigation Controls */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onNavigateBack} disabled={!canGoBack} className="p-2">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onNavigateForward} disabled={!canGoForward} className="p-2">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {pathSegments.length > 0 ? (
          <nav className="flex items-center gap-1 text-sm">
            {pathSegments.map((segment, index) => (
              <div key={`${segment.id}-${index}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRightIcon className="h-3 w-3 text-gray-400" />}
                <button
                  onClick={() => handleSegmentClick(segment)}
                  className={cn(
                    "px-2 py-1 rounded hover:bg-gray-100 transition-colors truncate cursor-pointer",
                    index === pathSegments.length - 1
                      ? "text-gray-900 font-medium"
                      : "text-gray-600 hover:text-gray-900",
                  )}
                >
                  {segment.type === "home" && <Home className="h-3 w-3 inline mr-1" />}
                  {segment.name}
                </button>
              </div>
            ))}
          </nav>
        ) : (
          <button
            onClick={onNavigateHome}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <Home className="h-4 w-4" />
            <span className="font-semibold text-gray-900">Noteblock</span>
          </button>
        )}
      </div>
    </header>
  )
}
