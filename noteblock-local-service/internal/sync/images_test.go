package sync

import (
	"encoding/json"
	"testing"
)

func imageNote(urls ...string) NoteDocument {
	blocks := make([]BlockDocument, 0, len(urls))
	for i, u := range urls {
		content, _ := json.Marshal(map[string]any{"url": u})
		blocks = append(blocks, BlockDocument{ID: "b", Type: "image", Index: i, Content: content})
	}

	return NoteDocument{ID: "n1", Blocks: blocks}
}

func TestImageFilenamesAreExtractedFromBlockContent(t *testing.T) {
	docs := []NoteDocument{imageNote(
		"noteblock-image:///4f0c_screenshot.png",
		"noteblock-image:///9a1b_diagram.png",
	)}

	got := imageFilenames(docs)
	if len(got) != 2 || got[0] != "4f0c_screenshot.png" || got[1] != "9a1b_diagram.png" {
		t.Errorf("filenames = %v", got)
	}
}

func TestTheSameImageTwiceIsTransferredOnce(t *testing.T) {
	docs := []NoteDocument{imageNote(
		"noteblock-image:///same.png",
		"noteblock-image:///same.png",
	)}

	if got := imageFilenames(docs); len(got) != 1 {
		t.Errorf("filenames = %v, want one entry", got)
	}
}

func TestNonImageBlocksAndForeignUrlsAreIgnored(t *testing.T) {
	text, _ := json.Marshal(map[string]any{"text": "noteblock-image:///not-a-block.png"})
	docs := []NoteDocument{{
		ID: "n1",
		Blocks: []BlockDocument{
			{ID: "b1", Type: "text", Content: text},
			{ID: "b2", Type: "image", Content: json.RawMessage(`{"url":"https://example.com/remote.png"}`)},
			{ID: "b3", Type: "image", Content: json.RawMessage(`{}`)},
			{ID: "b4", Type: "image", Content: json.RawMessage(`not json`)},
		},
	}}

	if got := imageFilenames(docs); len(got) != 0 {
		t.Errorf("filenames = %v, want none", got)
	}
}

// Names arrive from another device, so one carrying a path must not be turned into a fetch
// that writes outside the images directory.
func TestNamesCarryingAPathAreIgnored(t *testing.T) {
	docs := []NoteDocument{imageNote(
		"noteblock-image:///../../noteblock.sqlite",
		"noteblock-image:///nested/dir/pic.png",
	)}

	if got := imageFilenames(docs); len(got) != 0 {
		t.Errorf("filenames = %v, want none", got)
	}
}

// The peer names these files and the protocol handler types them by extension, so anything that is
// not an image is refused before it can be written into the images directory.
func TestOnlyImageFilenamesAreFetched(t *testing.T) {
	docs := []NoteDocument{{
		ID: "n1",
		Blocks: []BlockDocument{
			{Type: "image", Content: json.RawMessage(`{"url":"noteblock-image:///ok.png"}`)},
			{Type: "image", Content: json.RawMessage(`{"url":"noteblock-image:///evil.html"}`)},
			{Type: "image", Content: json.RawMessage(`{"url":"noteblock-image:///payload.exe"}`)},
			{Type: "image", Content: json.RawMessage(`{"url":"noteblock-image:///noext"}`)},
		},
	}}

	got := imageFilenames(docs)

	if len(got) != 1 || got[0] != "ok.png" {
		t.Errorf("fetching %v, want only the image", got)
	}
}
