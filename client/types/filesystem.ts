export interface FileSystemItem {
  id: string
  name: string
  type: "folder" | "note"
  path: string
  children?: string[]
  content?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface FileSystemStructure {
  [key: string]: FileSystemItem
}
