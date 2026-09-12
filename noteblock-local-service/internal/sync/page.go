package sync

import "time"

// One pass carries at most this many notes. Without a cap the first sync serialises the whole
// corpus into one request, and since the cursor only advances on success, a body too large to
// finish inside the client timeout can never make progress — it just retries forever.
const MaxNotesPerPass = 50

// Page is what a pass should send and where the push cursor may safely move to afterwards.
type Page struct {
	Changes  Changes
	Complete bool
	Through  *time.Time
}

// A full batch cannot advance the cursor to the scan time — everything after it would be
// skipped — so it advances to the batch's own high-water mark instead.
func paginate(changes Changes, focusNoteID string, limit int) Page {
	notes := prioritise(changes.Notes, focusNoteID)

	if len(notes) <= limit {
		return Page{Changes: Changes{Notes: notes, Folders: changes.Folders}, Complete: true}
	}

	batch := notes[:limit]

	sent := batch
	boundary := maxUpdatedAt(batch)

	// Only when a record that did not fit shares the boundary instant: a strict `>` cursor set
	// there would skip it, so everything at that instant waits for the next pass instead.
	if anyAt(notes[limit:], boundary) {
		if trimmed := dropAt(batch, boundary); len(trimmed) > 0 {
			sent = trimmed
		}
	}

	// The cursor follows what was sent, never the batch: anything held back must still be
	// on the far side of it next pass.
	through := maxUpdatedAt(sent)

	return Page{
		Changes:  Changes{Notes: sent, Folders: changes.Folders},
		Complete: false,
		Through:  &through,
	}
}

// The note on screen goes first, so the thing the user is actually looking at is the thing
// that reaches the other device soonest.
func prioritise(notes []NoteDocument, focusNoteID string) []NoteDocument {
	if focusNoteID == "" {
		return notes
	}

	for i, note := range notes {
		if note.ID != focusNoteID {
			continue
		}

		reordered := make([]NoteDocument, 0, len(notes))
		reordered = append(reordered, note)
		reordered = append(reordered, notes[:i]...)

		return append(reordered, notes[i+1:]...)
	}

	return notes
}

func maxUpdatedAt(notes []NoteDocument) time.Time {
	var max time.Time
	for _, note := range notes {
		if note.UpdatedAt.After(max) {
			max = note.UpdatedAt
		}
	}

	return max
}

func dropAt(notes []NoteDocument, at time.Time) []NoteDocument {
	kept := make([]NoteDocument, 0, len(notes))
	for _, note := range notes {
		if !note.UpdatedAt.Equal(at) {
			kept = append(kept, note)
		}
	}

	return kept
}

func anyAt(notes []NoteDocument, at time.Time) bool {
	for _, note := range notes {
		if note.UpdatedAt.Equal(at) {
			return true
		}
	}

	return false
}
