import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown } from "lucide-react"
import type { FileSystemStructure } from "@/types/filesystem"
import { cn } from "@/lib/utils"

interface NotebookSidebarProps {
  fileSystem: FileSystemStructure
  expandedFolders: Set<string>
  selectedNote: string | null
  onNoteSelect: (noteId: string) => void
  onFolderToggle: (folderId: string) => void
}

interface TreeItemProps {
  itemId: string
  fileSystem: FileSystemStructure
  expandedFolders: Set<string>
  selectedNote: string | null
  onNoteSelect: (noteId: string) => void
  onFolderToggle: (folderId: string) => void
  depth: number
}

function TreeItem({
  itemId,
  fileSystem,
  expandedFolders,
  selectedNote,
  onNoteSelect,
  onFolderToggle,
  depth,
}: TreeItemProps) {
  const item = fileSystem[itemId]
  if (!item) return null

  const isExpanded = expandedFolders.has(itemId)
  const isSelected = selectedNote === itemId
  const hasChildren = item.children && item.children.length > 0

  const handleClick = () => {
    if (item.type === "folder") {
      onFolderToggle(itemId)
    } else {
      onNoteSelect(itemId)
    }
  }

  const getIcon = () => {
    if (item.type === "folder") {
      return isExpanded ? (
        <FolderOpen className="h-4 w-4 text-blue-500" />
      ) : (
        <Folder className="h-4 w-4 text-blue-500" />
      )
    }
    return <FileText className="h-4 w-4 text-gray-600" />
  }

  const getChevron = () => {
    if (item.type === "folder" && hasChildren) {
      return isExpanded ? (
        <ChevronDown className="h-3 w-3 text-gray-500" />
      ) : (
        <ChevronRight className="h-3 w-3 text-gray-500" />
      )
    }
    return <div className="w-3" /> // Spacer for alignment
  }

  // Sort children: folders first, then notes
  const sortedChildren = item.children
    ? [...item.children].sort((a, b) => {
        const itemA = fileSystem[a]
        const itemB = fileSystem[b]
        if (!itemA || !itemB) return 0

        if (itemA.type !== itemB.type) {
          return itemA.type === "folder" ? -1 : 1
        }
        return itemA.name.localeCompare(itemB.name)
      })
    : []

  return (
    <div>
      <div
        onClick={handleClick}
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 transition-colors",
          isSelected && "bg-blue-100 text-blue-900 hover:bg-blue-100",
        )}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        <div className="flex items-center gap-1">
          {getChevron()}
          {getIcon()}
        </div>
        <span className="truncate">{item.name}</span>
      </div>

      {item.type === "folder" && isExpanded && hasChildren && (
        <div>
          {sortedChildren.map((childId) => (
            <TreeItem
              key={childId}
              itemId={childId}
              fileSystem={fileSystem}
              expandedFolders={expandedFolders}
              selectedNote={selectedNote}
              onNoteSelect={onNoteSelect}
              onFolderToggle={onFolderToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function NotebookSidebar({
  fileSystem,
  expandedFolders,
  selectedNote,
  onNoteSelect,
  onFolderToggle,
}: NotebookSidebarProps) {
  const rootFolder = fileSystem["/"]

  return (
    <div className="h-full bg-white border-r border-gray-200 flex flex-col">
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Files</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-2">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-2">Workspace</div>
          <div>
            {rootFolder?.children?.map((childId) => (
              <TreeItem
                key={childId}
                itemId={childId}
                fileSystem={fileSystem}
                expandedFolders={expandedFolders}
                selectedNote={selectedNote}
                onNoteSelect={onNoteSelect}
                onFolderToggle={onFolderToggle}
                depth={0}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
