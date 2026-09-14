package sync

import (
	"testing"
	"time"
)

func notesAt(times ...time.Time) []NoteDocument {
	docs := make([]NoteDocument, 0, len(times))
	for i, at := range times {
		docs = append(docs, NoteDocument{ID: string(rune('a' + i)), UpdatedAt: at})
	}

	return docs
}

func idsOf(notes []NoteDocument) []string {
	ids := make([]string, 0, len(notes))
	for _, note := range notes {
		ids = append(ids, note.ID)
	}

	return ids
}

func TestAShortBatchSendsEverythingAndReportsComplete(t *testing.T) {
	base := time.Now().UTC()
	changes := Changes{Notes: notesAt(base, base.Add(time.Second))}

	page := paginate(changes, "", 10)

	if !page.Complete {
		t.Error("page is not complete despite fitting in one batch")
	}
	if page.Through != nil {
		t.Error("a complete page must let the caller advance to the scan time")
	}
	if len(page.Changes.Notes) != 2 {
		t.Errorf("sent %d notes, want 2", len(page.Changes.Notes))
	}
}

func TestAFullBatchParksTheCursorOnTheOldestHeldBackRecord(t *testing.T) {
	base := time.Now().UTC()
	changes := Changes{Notes: notesAt(base, base.Add(time.Second), base.Add(2*time.Second))}

	page := paginate(changes, "", 2)

	if page.Complete {
		t.Error("page reported complete with records left over")
	}
	if page.Through == nil {
		t.Fatal("a partial page must say how far the cursor may move")
	}
	// Inclusive cursor, so it may sit exactly on the held-back record.
	if !page.Through.Equal(base.Add(2 * time.Second)) {
		t.Errorf("through = %v, want the oldest held-back timestamp", page.Through)
	}
}

// No cursor separates two records sharing an instant, so the batch grows to swallow it whole
// rather than stranding one or looping on it forever.
func TestAnIndivisibleInstantIsSentWholeEvenPastTheLimit(t *testing.T) {
	base := time.Now().UTC()
	shared := base.Add(time.Second)
	changes := Changes{Notes: notesAt(base, base.Add(500*time.Millisecond), shared, shared)}

	page := paginate(changes, "", 3)

	if len(page.Changes.Notes) != 4 {
		t.Fatalf("sent %v, want the shared instant carried whole", idsOf(page.Changes.Notes))
	}
	if !page.Complete {
		t.Error("nothing is left, so the page is complete")
	}
}

func TestABoundarySharedOnlyInsideTheBatchNeedsNoGrowth(t *testing.T) {
	base := time.Now().UTC()
	shared := base.Add(time.Second)
	changes := Changes{Notes: notesAt(base, shared, shared, base.Add(2*time.Second))}

	page := paginate(changes, "", 3)

	if len(page.Changes.Notes) != 3 {
		t.Errorf("sent %v, want the whole batch", idsOf(page.Changes.Notes))
	}
	if !page.Through.Equal(base.Add(2 * time.Second)) {
		t.Errorf("through = %v, want the held-back record's timestamp", page.Through)
	}
}

func TestABatchThatIsEntirelyOneInstantGoesInOnePass(t *testing.T) {
	at := time.Now().UTC()
	changes := Changes{Notes: notesAt(at, at, at, at)}

	page := paginate(changes, "", 2)

	if len(page.Changes.Notes) != 4 {
		t.Fatalf("sent %d notes, want all of them; the instant cannot be split", len(page.Changes.Notes))
	}
	if !page.Complete {
		t.Error("the whole change set went, so the page is complete")
	}
}

// The invariant the whole design exists to protect, stated directly: a note that was not sent
// must still be at or after the cursor, or the next scan will never return it.
func TestNoHeldBackNoteEverFallsBelowTheCursor(t *testing.T) {
	base := time.Now().UTC()
	var notes []NoteDocument
	for i := range 60 {
		notes = append(notes, NoteDocument{
			ID:        string(rune('A'+i%26)) + string(rune('0'+i/26)),
			UpdatedAt: base.Add(time.Duration(i) * time.Second),
		})
	}

	for _, focus := range []string{"", notes[59].ID, notes[0].ID, notes[30].ID} {
		page := paginate(Changes{Notes: notes}, focus, MaxNotesPerPass)
		if page.Complete {
			continue
		}

		sent := map[string]bool{}
		for _, n := range page.Changes.Notes {
			sent[n.ID] = true
		}
		for _, n := range notes {
			if !sent[n.ID] && n.UpdatedAt.Before(*page.Through) {
				t.Errorf("focus %q: %s was held back but sits below the cursor %v; it will never be scanned again",
					focus, n.ID, page.Through)
			}
		}
	}
}

func TestTheNoteOnScreenGoesFirst(t *testing.T) {
	base := time.Now().UTC()
	changes := Changes{Notes: notesAt(base, base.Add(time.Second), base.Add(2*time.Second))}
	onScreen := changes.Notes[2].ID

	page := paginate(changes, onScreen, 10)

	if got := idsOf(page.Changes.Notes)[0]; got != onScreen {
		t.Errorf("first note = %q, want the focused %q", got, onScreen)
	}
	if len(page.Changes.Notes) != 3 {
		t.Errorf("prioritising dropped notes: %v", idsOf(page.Changes.Notes))
	}
}

func TestFocusOnANoteWithNothingToPushChangesNothing(t *testing.T) {
	base := time.Now().UTC()
	changes := Changes{Notes: notesAt(base, base.Add(time.Second))}

	page := paginate(changes, "not-in-this-batch", 10)

	if got := idsOf(page.Changes.Notes); len(got) != 2 || got[0] != "a" {
		t.Errorf("order = %v, want the scan order untouched", got)
	}
}

// Priority is what decides which notes make the cut when there are more than fit.
func TestAFocusedNoteIsSentEvenWhenItWouldHaveMissedTheBatch(t *testing.T) {
	base := time.Now().UTC()
	changes := Changes{Notes: notesAt(base, base.Add(time.Second), base.Add(2*time.Second))}
	onScreen := changes.Notes[2].ID

	page := paginate(changes, onScreen, 1)

	if got := idsOf(page.Changes.Notes); len(got) != 1 || got[0] != onScreen {
		t.Errorf("sent %v, want just the focused note", got)
	}
}
