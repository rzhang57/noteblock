package ipc

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"

	"server/internal/model"
)

func toRawMessage(content any) (*json.RawMessage, error) {
	b, err := json.Marshal(content)
	if err != nil {
		return nil, err
	}
	raw := json.RawMessage(b)
	return &raw, nil
}

func generateUniqueFolderName(folders []model.Folder) string {
	base := "New Folder"
	maxIndex := 0
	pattern := regexp.MustCompile(`^New Folder(?: (\d+))?$`)

	for _, f := range folders {
		matches := pattern.FindStringSubmatch(f.Name)
		if len(matches) > 1 && matches[1] != "" {
			if idx, err := strconv.Atoi(matches[1]); err == nil {
				if idx > maxIndex {
					maxIndex = idx
				}
			}
		} else if f.Name == base && maxIndex == 0 {
			maxIndex = 1
		}
	}

	if maxIndex == 0 {
		return base
	}
	return fmt.Sprintf("%s %d", base, maxIndex+1)
}

func generateUniqueNoteName(notes []model.Note) string {
	base := "New Note"
	maxIndex := 0
	pattern := regexp.MustCompile(`^New Note(?: (\d+))?$`)

	for _, n := range notes {
		matches := pattern.FindStringSubmatch(n.Title)
		if len(matches) > 1 && matches[1] != "" {
			if idx, err := strconv.Atoi(matches[1]); err == nil {
				if idx > maxIndex {
					maxIndex = idx
				}
			}
		} else if n.Title == base && maxIndex == 0 {
			maxIndex = 1
		}
	}

	if maxIndex == 0 {
		return base
	}
	return fmt.Sprintf("%s %d", base, maxIndex+1)
}
