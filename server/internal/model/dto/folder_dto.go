package dto

type FolderResponse struct {
	ID       string          `json:"id"`
	Name     string          `json:"name"`
	ParentID *string         `json:"parent_id"`
	Notes    []NoteResponse  `json:"notes"`
	Children []FolderPreview `json:"children"`
}

type FolderPreview struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type NoteResponse struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}
