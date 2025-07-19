"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Folder, FileText, ArrowLeft } from "lucide-react"
import type { FileSystemItem } from "@/types/filesystem"
import { cn } from "@/lib/utils"

interface FileSystemGridItemProps {
  item: FileSystemItem
  isSelected: boolean
  isDragging: boolean
  onItemClick: (itemId: string, isDoubleClick: boolean) => void
  onDragStart: (itemId: string) => void
  onDragEnd: () => void
  onDrop: (targetId: string) => void
  isBackButton?: boolean
}

export function FileSystemGridItem({
  item,
  isSelected,
  isDragging,
  onItemClick,
  onDragStart,
  onDragEnd,
  onDrop,
  isBackButton = false,
}: FileSystemGridItemProps) {
  const [dragOver, setDragOver] = useState(false)

  const handleClick = useCallback(() => {
    if (isBackButton) {
      onItemClick(item.id, true)
      return
    }

    // For folders, navigate immediately on single click
    if (item.type === "folder") {
      onItemClick(item.id, true)
    } else {
      // For notes, just select them
      onItemClick(item.id, false)
    }
  }, [item.id, item.type, onItemClick, isBackButton])

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (isBackButton) {
        e.preventDefault()
        return
      }
      e.dataTransfer.effectAllowed = "move"
      onDragStart(item.id)
    },
    [item.id, onDragStart, isBackButton],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (item.type === "folder" && !isBackButton) {
        e.preventDefault()
        e.stopPropagation() // Prevent grid drag over
        e.dataTransfer.dropEffect = "move"
        setDragOver(true)
      }
    },
    [item.type, isBackButton],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only hide drag over if we're leaving the hover area entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation() // Prevent grid drop
      setDragOver(false)
      if (item.type === "folder" && !isBackButton) {
        onDrop(item.id)
      }
    },
    [item.id, item.type, onDrop, isBackButton],
  )

  const getIcon = () => {
    return isBackButton ? (
      <ArrowLeft className="w-8 h-8 text-gray-600" />
    ) : item.type === "folder" ? (
      <Folder className="w-8 h-8 text-blue-500" />
    ) : (
      <FileText className="w-8 h-8 text-gray-600" />
    )
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center p-3 rounded-lg transition-all duration-150 select-none",
        isSelected && "bg-blue-100 ring-2 ring-blue-300",
        isDragging && "opacity-50",
        "group",
      )}
      draggable={!isBackButton}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
    >
      <div
        className={cn(
          "flex flex-col items-center p-2 rounded-lg transition-all duration-150 w-20 h-20 cursor-pointer",
          "hover:shadow-md",
          dragOver && "bg-blue-50 ring-2 ring-blue-400 shadow-lg",
        )}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="mb-2">{getIcon()}</div>
        <span className={cn("text-xs text-center text-gray-700 w-full truncate px-1", "group-hover:text-gray-900")}>
          {item.name}
        </span>
      </div>
    </div>
  )
}
