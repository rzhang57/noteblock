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

// The cursor is derived from what was held back, never from what was sent: prioritise reorders the
// batch around the focused note, so the newest record sent says nothing about whether an older one
// is still pending. Taking the high-water mark of the batch strands every older note behind it.
func paginate(changes Changes, focusNoteID string, limit int) Page {
	notes := prioritise(changes.Notes, focusNoteID)

	if len(notes) <= limit {
		return Page{Changes: Changes{Notes: notes, Folders: changes.Folders}, Complete: true}
	}

	sent, held := notes[:limit:limit], notes[limit:]

	// A single instant cannot be split: no cursor separates two records that share one. Grow the
	// batch past the limit until the oldest held-back instant is one nothing in the batch shares.
	for len(held) > 0 {
		boundary := minUpdatedAt(held)
		if !anyAt(sent, boundary) {
			break
		}
		sent, held = moveInstant(sent, held, boundary)
	}

	if len(held) == 0 {
		return Page{Changes: Changes{Notes: sent, Folders: changes.Folders}, Complete: true}
	}

	// Inclusive cursor: parking on the oldest held-back instant re-sends whatever shares it.
	// Applying a change twice is idempotent; advancing past one is not recoverable.
	through := minUpdatedAt(held)

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

func moveInstant(sent, held []NoteDocument, at time.Time) ([]NoteDocument, []NoteDocument) {
	keptBack := make([]NoteDocument, 0, len(held))
	for _, note := range held {
		if note.UpdatedAt.Equal(at) {
			sent = append(sent, note)
			continue
		}
		keptBack = append(keptBack, note)
	}

	return sent, keptBack
}

func minUpdatedAt(notes []NoteDocument) time.Time {
	min := notes[0].UpdatedAt
	for _, note := range notes[1:] {
		if note.UpdatedAt.Before(min) {
			min = note.UpdatedAt
		}
	}

	return min
}

func anyAt(notes []NoteDocument, at time.Time) bool {
	for _, note := range notes {
		if note.UpdatedAt.Equal(at) {
			return true
		}
	}

	return false
}
