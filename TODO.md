# Noteblock TODO

Persisted source of truth for planned work. Agents and humans both read and update this file.

**How to use it:** update the status marker when work starts or lands, and append findings under an
item as you learn things. Do not delete the context lines — the constraints recorded here are the
reason an item is scoped the way it is. Items are roughly in intended order; 1–3 are near-term.

Status: `[ ]` not started · `[~]` in progress · `[x]` done

---

## 1. Rethink the seeded root folder

`[ ]`

`db.InitDb` seeds a folder with the literal ID `"root"` at startup, and `note.create` falls back to
that ID when no folder is given. This makes a magic string load-bearing across the DB, the IPC
handlers, and the client.

**Idea on the table:** drop the seeded row and treat `parent_id IS NULL` as the root instead.
`Folder.ParentID` is already `*string`, so the model mostly supports this today.

**Think through before changing:**
- `Note.FolderID` is `not null` — top-level notes currently need a real folder row to point at.
  Making it nullable, or keeping a real root row, is the actual decision.
- Multi-user (item 5) means "root" stops being globally unique — it becomes root *per user*.
  Whatever shape this takes should not have to be redone then.
- Sync (item 4) has to agree on what root is across devices. A well-known sentinel and a
  null-parent convention have very different merge behavior.

**Related:** the seeding *bug* (malformed query, root re-created every launch) is already fixed —
this item is the design cleanup, not the bug.

---

## 2. UI overhaul — brutalist → elegant

`[ ]`

The current look is deliberately brutalist: squared-off shapes, hard borders. It no longer feels
right. Target is elegant and clean — clean typography, clean spacing, restrained everything.
**Reference: Mercury's UI.**

**Constraint (important):** keep the core frontend architecture as-is for this work. This is a visual
and interaction pass, **not a frontend rewrite**. Architecture changes are expected over time, but
they should land incrementally and separately, not bundled into this.

**In scope:** typography, color, spacing, borders/radii, shadows, transitions, component polish,
interaction feel.
**Out of scope for this item:** swapping state management, restructuring the component tree,
changing the service layer, changing the IPC contract.

Note that `Sidebar.tsx` (~650 LOC) and `TextBlock.tsx` (~520 LOC) are already oversized. Do not grow
them further during this pass; splitting them is fine and welcome if it falls out naturally.

---

## 3. Concurrent IPC server

`[~]` design/learning phase

Today `ipc/server.go` is a single `for scanner.Scan()` loop — strictly one request in flight. A slow
request head-of-line-blocks everything behind it, and Electron's 15s timeout is the only backstop.

**Goal:** one sidecar correctly serving multiple client windows concurrently.

**Explicit process constraint:** Ryan wants to read through and write a meaningful part of this
himself before it ships. Go concurrency is one of the core things he wants to actually understand,
not have handed to him. **Agents: do not implement this end-to-end unsolicited.** Explain, review,
prototype on request, discuss trade-offs — but leave the driving to Ryan.

**Things that have to be answered:**
- Request/response correlation — the wire protocol already carries `id`, and the Electron side keys
  pending requests on it, so responses may return out of order without a protocol change.
- Serializing writes to the `io.Writer` — concurrent `json.Encoder.Encode` calls are not safe.
- Bounded worker pool vs. goroutine-per-request; what backpressure looks like when the client
  outruns the server.
- SQLite concurrency: single connection today, `PRAGMA foreign_keys = ON`. WAL mode, busy timeout,
  and GORM's connection pool all become relevant.
- Ordering guarantees the client actually depends on — autosave and reorder are the risky ones.
- Whether multiple windows means multiple sidecars or one shared sidecar (this drives everything
  else; decide it first).

**Related:** image uploads travel base64 over stdin through a 20MB scanner buffer, which is a large
part of why head-of-line blocking hurts. Worth revisiting alongside this.

---

## 4. Sync system

`[ ]`

Map out → architect → ship. Cloud service is currently `GET /` and `GET /health` and nothing else;
`RestClient.ts` exists but has zero call sites, deliberately kept as scaffolding for this.

**Motivating goals, in order:**
1. Ryan uses it for real note-taking during the school year, synced across his own devices.
2. A public live demo, in the spirit of Mercury's demo on their site — something to show recruiters.

**Hard prerequisite — schema:** the current schema cannot express sync. `Note`/`Block`/`Folder` have
`CreatedAt`/`UpdatedAt` but no version or revision counter and no tombstones, so a deletion is
indistinguishable from "never seen this record" and conflicts cannot be detected. **The schema
migration comes before any cloud endpoints.**

**Design decisions to make explicitly (this is the interesting part, and the best interview
material — write the reasoning down as it happens):**
- Conflict resolution: last-write-wins vs. per-field merge vs. CRDT. Block-level content makes
  granularity a real choice.
- Sync granularity: whole note, or per block.
- Tombstones and garbage collection.
- Offline queue and replay: local-first means writes must land locally and sync later, never block.
- Clock skew — device wall-clock is not trustworthy for ordering.

**Non-negotiable:** local reads and writes must stay fully offline-capable. Sync is additive.

---

## 5. Multi-user

`[ ]`

Users, not tenants — single-user-per-account scope for now, explicitly not org/workspace/tenant
modeling yet.

Comes **after** sync exists, and requires a schema migration so the databases carry user ownership.
Auth does not exist anywhere in the codebase today.

**Notes:**
- Sequencing matters: doing sync first, then adding users, means a second schema migration. Worth a
  deliberate decision on whether to put the ownership column in during the item-4 migration even if
  it goes unused at first.
- The live public demo (item 4) probably forces at least a minimal auth story earlier than expected.
  Decide whether the demo is read-only/ephemeral or actually account-backed.

---

## 6. Launch, scale, and everything after

`[ ]`

Landing site, distribution, scaling, and the rest. Deliberately unscoped for now — revisit once 1–5
are real.

---

## Suggested additions

Proposed, not yet accepted by Ryan. Move up into the numbered list if they earn it.

- **`[ ]` Soft delete / trash.** `NB-32` in `note_service.go` already calls for this. Worth
  highlighting because it is not just a product feature: **a trash/tombstone model is exactly what
  sync needs in item 4**, and it interacts with item 1. Doing it once, deliberately, serves all
  three. Strong candidate to pull forward.
- **`[ ]` Real versioned migrations.** `db.InitDb` uses GORM `AutoMigrate`, which is fine for solo
  development but not once a released build holds notes you care about. Items 4 and 5 both require
  schema changes against real data. This should land *before* those migrations, not during.
- **`[ ]` Search.** A notes app with no search. Directly relevant to the Notion conversation, and
  SQLite FTS5 makes it very tractable locally.
- **`[ ]` Export / backup.** Before trusting this with a full school year of notes, there should be a
  way to get them out — markdown export doubles as a data-safety net and a portability story. Cheap
  insurance relative to the risk.
- **`[ ]` Sidecar crash recovery.** If the Go process dies, `electron/main.js` rejects all pending
  requests but never restarts it — the window stays open and silently does nothing. Supervised
  restart with a backoff. Becomes more important with multiple windows (item 3).
- **`[ ]` Test coverage before sync.** 5 frontend tests, all thin service-wrapper mocks; no component
  tests. Sync is the least forgiving thing to build on an untested base.
- **`[ ]` Fix the 27 ESLint `no-explicit-any` errors** in `client/src/types/electron-api.d.ts` and
  `client/src/types/Note.ts`. Small, and it makes `npm run lint` a real gate again.
- **`[ ]` Block content validation.** `block_service.go` stores block content as an unvalidated JSON
  string; the TODOs there acknowledge it. Deliberate for plugin extensibility, but the boundary
  should be explicit rather than accidental.

---

## Done

- **`[x]` Cleanup and bug-fix pass** (2026-08-27). Removed dead pre-IPC Gin code (`internal/api`,
  `internal/routes`, ~510 LOC) and the Gin dependency (~25 transitive deps); moved `mapper` to
  `internal/mapper`. Fixed: root-folder seed query (`Where("id = root", ...)` missing its
  placeholder, re-created root every launch with both errors discarded), dev/packaged image path
  mismatch (`getDataPath()` now shared by the backend env and the image protocol handler), swallowed
  fatal error in `cmd/noteblock/main.go`, and missing panic recovery in `ipc.handle` (a panic in one
  handler killed the sidecar for the whole session — now covered by a regression test).
  `AGENTS.md` reduced to a pointer at `CLAUDE.md`, which gained architecture invariants, the six-file
  IPC-method checklist, and the comment-density rule.
