---
name: block-type-change
description: >
  How to add a block type to noteblock, or change an existing block's content model. Blocks are
  frontend-only by design — the Go service stores type as an unconstrained string and content as
  opaque JSON — so the work is the data model, not the plumbing. Use when adding a block type or
  changing what a block persists.
---

# Add or change a block type

Unlike an IPC method, this is **cheap and frontend-only**. `Block.Type` is a plain `string` in
`noteblock-local-service/internal/model/block.go` with no enum and no validation, and `Block.Content`
is a JSON string the Go service never parses. `block.create` / `block.update` / `block.delete`
already carry anything you put in it.

So a normal new block type needs **no Go change, no IPC change, and no migration**. If you think you
need one, you are probably about to make the backend care about content — stop and reconsider.

## The five wiring points

1. **Type and content model** — `client/src/types/Note.ts`. Add the name to the `BlockType` union
   and declare its content interface (`TextContent`, `ImageContent`, `CodeContent`, `CanvasContent`
   are the existing shapes).
2. **The component** — `client/src/components/blocks/block_types/`. Simple types are a single file;
   richer ones get a directory, as `Textblock/` does.
3. **Render dispatch** — the `block.type === …` chain in `client/src/components/ContentPanel.tsx`.
   Add the branch, and add the name to the `["text", "canvas", "image", "code"]` array guarding the
   `Unknown block type` fallback, or the block renders twice.
4. **Creation entry point** — usually `client/src/components/blocks/InsertionPoint.tsx`: extend the
   `InsertKind` union and add the button. A type created some other way — an image from a paste or
   upload, say — does not belong in the insertion menu at all.
5. **Persistence** — `NoteService.updateBlock(noteId, blockId, {type, content})`. Whatever shape you
   hand `content` comes back verbatim. There is nothing else to do.

## Designing the content model

This is the part that actually matters, because content is unversioned and unvalidated: whatever
ships is what you will be reading back a year from now.

- **Store source data, not rendered output.** Image annotations are stroke lists rather than a
  flattened PNG, so the original survives and strokes stay editable. A flattened artefact is a
  one-way door.
- **Store resolution-independent values.** Stroke points are `0..1` fractions of the image box, so
  they survive any display size. Anything expressed in screen pixels bakes in the window it was
  drawn at and is wrong on every other one.
- **Prefer additive evolution.** New fields must be optional with a sensible default for content
  written before they existed. There is no migration path for block content — the old JSON is simply
  still there.
- **Keep it small.** Content rides in every note fetch and, once sync exists, over the wire too.

## Read it defensively

Because nothing validates content, a malformed blob fails at **render**, not at write. That is the
deal, and the component's job is to degrade rather than take the note down with it:

- Optional-chain into content (`content?.url`), never assume a field is present.
- Guard array iteration and `JSON.parse`.
- Render a visible placeholder for unusable content instead of throwing. `ContentPanel` already has
  an `Unknown block type` fallback for the type itself; a broken *content* payload inside a known
  type is yours to handle.

## Validation

- `cd client && npm test` for the content model and any pure logic — extract geometry, sizing and
  serialisation into plain modules and test them directly, the way `penSettings.ts` and `zoom.ts` do.
  Component internals tested through the DOM age badly; pure helpers do not.
- `cd client && npm run build` to type-check, `npm run lint` for no new violations.
- Then `verify-ui-change` — a block type is a UI change, and create/edit/reload/persist has to be
  exercised in a real browser. Confirm specifically that content survives a reload, since that is
  the whole contract with the backend.
