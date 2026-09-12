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

func TestAFullBatchStopsAtItsOwnHighWaterMark(t *testing.T) {
	base := time.Now().UTC()
	changes := Changes{Notes: notesAt(base, base.Add(time.Second), base.Add(2*time.Second))}

	page := paginate(changes, "", 2)

	if page.Complete {
		t.Error("page reported complete with records left over")
	}
	if page.Through == nil {
		t.Fatal("a partial page must say how far the cursor may move")
	}
	// Advancing to the scan time here would skip the third note forever.
	if !page.Through.Equal(base.Add(time.Second)) {
		t.Errorf("through = %v, want the batch's last timestamp", page.Through)
	}
}

// A strict `>` cursor set to the boundary instant would skip whichever records sharing it
// did not fit, so they are held back for the next pass instead.
func TestRecordsStraddlingTheBoundaryTimestampAreHeldBack(t *testing.T) {
	base := time.Now().UTC()
	shared := base.Add(time.Second)
	// The third and fourth share an instant, and only the third fits.
	changes := Changes{Notes: notesAt(base, base.Add(500*time.Millisecond), shared, shared)}

	page := paginate(changes, "", 3)

	if len(page.Changes.Notes) != 2 {
		t.Fatalf("sent %v, want the two before the straddled boundary", idsOf(page.Changes.Notes))
	}
	if page.Through.Equal(shared) {
		t.Error("cursor advanced onto the straddled instant; the record that did not fit is now unreachable")
	}
	if !page.Through.Equal(base.Add(500 * time.Millisecond)) {
		t.Errorf("through = %v, want the last timestamp actually sent", page.Through)
	}
}

// Trimming is only warranted when a record outside the batch shares the boundary. Otherwise
// it costs a whole round trip per pass for nothing.
func TestABoundarySharedOnlyInsideTheBatchIsNotTrimmed(t *testing.T) {
	base := time.Now().UTC()
	shared := base.Add(time.Second)
	changes := Changes{Notes: notesAt(base, shared, shared, base.Add(2*time.Second))}

	page := paginate(changes, "", 3)

	if len(page.Changes.Notes) != 3 {
		t.Errorf("sent %v, want the whole batch", idsOf(page.Changes.Notes))
	}
	if !page.Through.Equal(shared) {
		t.Errorf("through = %v, want %v", page.Through, shared)
	}
}

// Holding them all back would mean no progress at all, so a batch that is entirely one
// instant goes as it is.
func TestABatchThatIsEntirelyOneInstantStillGoes(t *testing.T) {
	at := time.Now().UTC()
	changes := Changes{Notes: notesAt(at, at, at, at)}

	page := paginate(changes, "", 2)

	if len(page.Changes.Notes) != 2 {
		t.Fatalf("sent %d notes, want the batch rather than nothing", len(page.Changes.Notes))
	}
	if !page.Through.Equal(at) {
		t.Errorf("through = %v, want %v", page.Through, at)
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
