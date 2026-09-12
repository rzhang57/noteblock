# Noteblock TODO

Persisted source of truth for planned work. Agents and humans both read and update this file.

**How to use it:** update the status marker when work starts or lands, and append findings under an
item as you learn things. Do not delete the context lines — the constraints recorded here are the
reason an item is scoped the way it is. Items are roughly in intended order; 1–3 are near-term.

Status: `[ ]` not started · `[~]` in progress · `[x]` done

---

## 1. Rethink the seeded root folder

`[ ]` design settled, implementation not started

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

**Decision (2026-08-27) — settled, not yet implemented.** Drop the seeded row. `parent_id IS NULL`
and `folder_id IS NULL` mean top-level; root stops being a record and becomes a value.

- **Why null over a sentinel row.** Multi-user (item 5) becomes `WHERE user_id = ? AND parent_id IS
  NULL`, with no per-user root row to provision or to leak across users. Sync (item 4) then has
  nothing to version, tombstone, or merge for root — a sentinel is a real row that two devices can
  each create independently, which needs deterministic ID derivation to stop it diverging. And
  keeping a sentinel under multi-user means discovering its ID by query anyway: the null approach
  plus an extra row.
- **This does not answer the API entry point — decide both together.** `Sidebar.tsx` loads the whole
  tree via `FolderService.getFolder("root")`, so removing the row leaves no ID to fetch. Add
  `folder.tree` (all six registration points) returning a *synthesized* `FolderResponse`:
  `ParentID: nil`, children = folders with a null parent, notes = notes with a null folder. The
  client swaps one call and `FolderTreeItem` keeps recursing on an identical shape. "Root" survives
  as a presentation label rather than a foreign key.
- **`Note.FolderID` has to become `*string`.** This is the real cost, and it is unavoidable in any
  null scheme — it is `not null` today, so top-level notes currently require a real folder row to
  point at. The code change is mild: `ListChildrenByParentId` already has exactly this branch shape.
  FK cascade still behaves correctly, since null FKs skip the constraint and top-level notes are
  therefore never cascade-deleted along with a folder.
- **Null defeats uniqueness constraints, in SQLite and Postgres both.** `UNIQUE(parent_id, name)`
  will *not* stop two "Projects" folders at top level, because SQL treats nulls as distinct. Nothing
  breaks today — `folderCreate` enforces name uniqueness in application code — but a DB-level
  constraint would need `UNIQUE(COALESCE(parent_id, ''), name)` or PG15+ `NULLS NOT DISTINCT`.
- **There is a data migration here, not just a schema one.** Reparent `parent_id = 'root'` to null
  and `folder_id = 'root'` to null, *then* delete the root row — in that order, with
  `PRAGMA foreign_keys = ON` active. SQLite also cannot `ALTER COLUMN` to drop `NOT NULL`; GORM's
  SQLite migrator rebuilds the table for it. `AutoMigrate` does not do the data half at all.

**Sequencing (agreed 2026-08-27):** this lands **before** item 4, paired with the "real versioned
migrations" suggested addition — the database changes go together. Doing it now costs one root row
and a single user; doing it after sync means the same migration *plus* version columns, tombstone
semantics, and other devices holding rows that reference `'root'`. It also makes a small, reversible
migration to build the migration machinery against, instead of writing the first real one under sync
pressure.

**Call sites when this is implemented:** `db/db.go` (seed block), the four hardcoded fallbacks in
`ipc/folder_handlers.go` and `ipc/note_handlers.go`, `folder_service.go` +
`buildFolderResponseRecursive`, `Sidebar.tsx` and `FolderTreeItem.tsx`, and the `"root"` assertions
in `FolderService.test.ts` / `LocalIpcClient.test.ts`.

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

**Direction decided (2026-08-27):** Mercury.com's restraint as the shell. A liquid-metal WebGPU
shader accent was tried on non-writing surfaces (brand mark, empty state, per-note covers) and
**removed on 2026-09-11** — see the second pass below. The restraint half of the direction stands.

**Findings worth keeping from that attempt:**
- **WebGPU works in Electron 31.7.7 as pinned — no flags, no upgrade.** Verified directly (NVIDIA
  adapter, device acquired). WebGPU needs a secure context, so a `data:` URL reports no
  `navigator.gpu` and looks like a false negative. Load a real file when testing this.
- **Per-note covers were derived from the note ID, not stored.** `Note` has no cover column, and
  adding one would drag a schema change into a visual pass. An FNV-1a hash of the UUID gives each
  note a stable, distinct cover for free. **User-chosen** covers do need the column, so they belong
  with the item 1 migration.

---

**Second pass (2026-09-11) — seamless / Notion-feel polish.**

- **Shader accents removed from the UI entirely**, at Ryan's call ("remove the webgpu blob thing").
  `NoteCover.tsx` deleted; `SidebarBrand` back to the static logo; `NoteEmptyState` now typographic.
  **Open:** `client/src/shader/` (7 files), the `vgpu` / `@vgpu/wgsl` / `@vgpu/wgsl-std` deps and
  `wgslVitePlugin()` in `vite.config.ts` are now unreferenced. Decide delete vs. keep for a future
  landing site — the repo otherwise does not tolerate dead code.
- **The sidebar was never actually using its own token.** It was `bg-card` (= `--paper`) everywhere,
  so sidebar and canvas were the same colour separated only by a hard `border-r`. Now `bg-sidebar`
  with the border dropped — the surfaces separate by tone, not by a rule.
- Sidebar rows: rounded/inset, 150ms colour transitions, active state (`--selected`) now distinct
  from hover (they were both `bg-accent`), chevron rotates instead of swapping icons, and drag-over
  uses an inset ring instead of a 2px dashed border that shifted the row by 2px.
- Editor: per-block `border border-rule` removed, gutter affordances are ghost icons, the title no
  longer swaps into a ringed input box, and one shared `.editor-col` makes the title and blocks share
  an edge — this closes the `max-w-3xl` / `max-w-6xl` mismatch noted above.
- Code block retokened; all hardcoded `#333` / `#d3d3d3` / `#ffffff` / `#2383e2` are gone.
- `.mdxeditor` had `all: revert`, so the writing surface was rendering at raw browser defaults. Added
  an explicit typography layer after the revert (16px/1.6, heading scale, list and quote spacing).
- Hover insertion divider kept and restored after a brief detour — Ryan: "KEY UX component". Options
  are now **Canvas / Code**; code is a text block seeded with a fence, since there is no `code` block
  type in the schema.

**Dev mock bridge (new, `client/src/dev/mockBridge.ts`).** `npm run dev` opened in a plain browser
had no `window.noteblock`, so nothing loaded and the app was Electron-only for inspection. The mock
installs the *same* bridge shape the preload exposes, so the service layer and the IPC boundary stay
untouched. Gated on `import.meta.env.DEV && !("noteblock" in window)` behind a dynamic import, and
**verified absent from `dist/` after `npm run build`.** It seeds a workspace plus a "Rendering
scenarios" folder used for the measurements below.

---

**Third pass (2026-09-11) — density, font, code blocks.** All numbers below are measured in the
browser through Playwright against the dev mock, not estimated.

- **Tab did not indent list items — it inserted a literal tab character.** This was the actual
  "indenting adds whitespace" bug. `INDENT_CONTENT_COMMAND` turns out to be unhandled in MDXEditor's
  configuration (dispatching it is a no-op), so indent/outdent are now implemented directly against
  the Lexical node tree in `TextBlock.tsx`. Indent joins the nested list above or creates one;
  requiring a previous sibling is what caps nesting at **one level at a time**. Outside a list the
  handler returns false, so plain paragraphs keep normal Tab behaviour (multiple tabs fine).
- **`MDXEditorMethods` does not expose the Lexical instance.** `editorRef.current.getEditorState()
  .editor` is `undefined` — which means the pre-existing `blockUnfocused` effect in `TextBlock` has
  been dead code. The working handle is `__lexicalEditor` on the contenteditable root.
- **Nested lists cost zero vertical space now.** Lexical nests as `<li><ul>…</ul></li>`, and that
  wrapper `li` was generating a marker *and* a full line box on top of the nested list. Fixed with
  `li:has(> ul) { display: block }` plus margin resets. Measured: indent dead space 20px → **0px**,
  gap between items 8px → **0px**, the sample list 258px → **156px**.
- **MDXEditor injects its stylesheet at runtime, after ours**, so equal-specificity rules silently
  lose (this is why `li { margin: 0 }` was being ignored). The editor rules are written with the
  class doubled (`.mdxeditor.mdxeditor`); two margin resets still need `!important`.
- Density: line-height 1.6 → 1.5, list rows 30px → 26px, title→first-block 40px → **14px**.
- **Font is now Inter**, bundled via `@fontsource-variable/inter`. Deliberately not a CDN/Google
  Fonts link — that would break the offline-first invariant.
- **`code` is a real block type now.** `Block.Type` is a free-form string in Go with no enum or
  validation, so this needed **zero Go and zero IPC changes** — the six-place checklist applies to
  new *methods*, not new block types. Only the TS union and a renderer. Typing ``` in a text block
  strips the fence and spawns a real code block below it.
- CodeMirror was extracted out of `TextBlock` into `block_types/CodeMirrorEditor.tsx` +
  `codeLanguages.ts` so the new block could reuse it: **TextBlock 522 → ~330 LOC**, and lint went
  27 → **26** errors (one fewer than the documented baseline).

**Not verified end-to-end:** the full keypress→indent path. Playwright cannot click into the editor
(the page never reaches its "stable" check) and a JS-set DOM range does not sync into Lexical's own
selection, so the handler cannot be driven synthetically. The two halves were verified separately:
the Tab handler fires (literal tab no longer inserted) and the restructuring moves an item from
depth 1 → 2 with no height change. **Worth a manual check in the real app.**

---

**Fourth pass (2026-09-11) — block affordances, image blocks.**

- **Block boundaries.** New `--rule-soft` token (a step lighter than `--rule`); each block carries a
  transparent border that resolves to it on hover, so blocks stay seamless at rest but their extent
  is legible while navigating.
- **Move/delete reworked.** Was: grip far-left, trash far-right, delete one-click and irreversible.
  Now one left-gutter handle — **drag to move, click for a menu** (Duplicate / Delete), so a single
  click can no longer destroy a block. Added a real **drop indicator** (the old drag showed what you
  were dragging but never where it would land), and dropped the `height: 60px` collapse that made the
  page jump mid-drag.
- **`PointerSensor` needs `activationConstraint: {distance: 4}}`.** The handle is both drag source and
  menu trigger; without the constraint dnd-kit swallows the click and the menu never opens.
- **Image blocks.** Pasting an image into a text block uploads it and spawns an `image` block below,
  the same mechanism as ``` → code block. Clicking the image opens a full-screen annotator with a pen,
  six colours, three widths, per-stroke undo, and Esc/Ctrl+Z.
- **Annotations are stored as normalised strokes, not flattened into the image.** `Stroke.points` are
  0..1 fractions of the image box, so they scale to any display size and the original image is never
  destroyed. `ImageContent` already had a free-form `data` field and block content is an unvalidated
  JSON string in Go — so this again needed **no Go and no IPC changes**.
- `setPointerCapture` now guarded: it throws for pointers the browser never registered, which would
  otherwise abort the stroke.

**Verified e2e** (per the new CLAUDE.md rule): drew a stroke in the annotator, confirmed colour
`#2f9e44`, width 11, 13 captured points, then Done → stroke renders on the block → reopening the
annotator still shows it, i.e. it round-tripped through block content rather than living in component
state. Duplicate verified 3 → 4 blocks with the copy directly below its source.

---

## 2b. Block-level undo stack

`[ ]` designed 2026-09-11, not implemented — see the soft-delete dependency below

Goal: a per-note in-memory stack so block operations (create, delete, duplicate, reorder) can be
undone, not just text edits inside a single block.

**The crux is that there are two undo scopes, and they will collide.** Lexical (text blocks) and
CodeMirror (code blocks) each own their own history. If a page-level stack also binds Ctrl+Z, undo
becomes unpredictable — the single biggest UX risk here. Workable rule: while focus is inside an
editor let that editor undo first, and fall through to the page stack only once its history is empty
(Lexical exposes `CAN_UNDO_COMMAND`; CodeMirror has `undoDepth()`). Notion merges both into one
stack, which is much harder because it means owning text history too.

**Inverses, by operation:**
- create / duplicate → delete the new block. Clean.
- reorder → re-apply the previous index array through `note.update`. Clean, and one IPC call.
- delete → recreate from captured content. **Not identity-preserving.**

**Why delete is the hard one.** `Block.BeforeCreate` assigns `uuid.New()`, so an undone delete comes
back with a **new ID**. That breaks redo entries holding the old ID, anything keyed by block ID, and
later sync (another device sees a delete plus an unrelated create rather than a restore).

**So soft delete should land first.** With a `deleted_at` tombstone, undo becomes "clear the
tombstone" — identity-preserving, one call, no content capture. Soft delete is already in Suggested
Additions (NB-32) and is already wanted by item 4, since sync needs tombstones regardless; undo is
simply a third consumer of the same primitive.

**Cheap first slice, if wanted before soft delete:** implement undo for create / duplicate / reorder
only. Those are all identity-preserving and cover most accidents, at a fraction of the risk.

---

## 2a. Per-line blocks (Notion-style)

`[ ]` raised 2026-09-11 — needs a decision before any code

Ryan wants every line to be its own block, matching Notion's editing behaviour.

**This contradicts the constraint recorded on item 2** ("keep the core frontend architecture as-is
… not a frontend rewrite"). It is a rewrite of the editor layer, so it belongs here as its own item
with its own design phase rather than folded into the visual pass.

**Measured baseline of the current renderer** (MDXEditor/Lexical, driven through Playwright against
the dev mock; all numbers from `getComputedStyle`):

- Paragraphs: 16px text, 25.6px line-height, 3px padding top and bottom → 6px between paragraphs.
  This is already essentially Notion's paragraph metric.
- Soft break (single newline) correctly stays inside one `<p>`; a blank line correctly splits them.
- Nested unordered lists work: markers cycle disc → circle → square, 25.6px indent per level
  (Notion uses ~24px). Mixed `ol > ul > ol` nesting renders with the correct markers.
- Headings: h1 28px, h2 22px (margin-top 33px), h3 18px (margin-top 27px).

**Bugs the scenario sweep found:**

1. **FIXED — silent content truncation at `---`.** `thematicBreakPlugin()` was never registered, so
   rendering stopped dead at the first thematic break and *everything after it was dropped from the
   rendered output* — measured as 6 expected children rendering as 2. Plugin added; now 6/6.
   **This generalises:** any markdown construct without a registered MDXEditor plugin truncates the
   rest of the block the same way. Worth an explicit plugin audit (tables, frontmatter) before
   trusting this with a real school year of notes.
2. **Open — nested ordered lists do not change numbering style.** Every depth renders `decimal`;
   Notion goes `1.` → `a.` → `i.`.
3. **Open — a phantom trailing empty `<p>` is appended after every list**, giving 32px of dead space
   and a stray clickable line. Lexical adds a trailing paragraph node; Notion does not.

**The real design question:** "one block per line" at the *Noteblock* level means one DB row per
line, and that collides with two constraints already recorded in this file.

- **The IPC server is strictly sequential** (item 3, not done). Per-line rows multiply
  `block.create` / `block.update` traffic by roughly the line count — every Enter creates a row and
  every autosave touches one. Head-of-line blocking gets materially worse, so **item 3 is arguably a
  prerequisite here, not a parallel track.**
- **Ordered-list numbering stops being free.** If each list item is its own block, `<ol>` can no
  longer auto-number; numbering has to be computed by walking sibling blocks and their indent levels.
  That is exactly what Notion does, and it is the single largest piece of work in this item.

Reuse vs. rebuild: MDXEditor is built on **Lexical, which already has a per-node block model** — each
paragraph and list item is a node. Notion-like *behaviour* may therefore be reachable without one
editor instance per line (N Lexical instances would be heavy; the bundle is already 2.7MB). **Decide
first whether the goal is per-line DB rows or per-line editing behaviour** — they are very different
builds, and only the first one drags the IPC and schema work along with it.

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
  **Update (2026-08-27):** now coupled to item 1 — the null-parent change is the first migration
  against real data and is deliberately being used to build this machinery. Strong candidate to
  promote into the numbered list ahead of item 4.
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
