# Repository Guidelines

## Planned Work
**Linear is the source of truth for what to work on and in what order.** Workspace `noteblock`, team
**Noteblock** (key `NOT`, id `81f007ee-2cd1-4483-8a33-a124518558ff`). Read the relevant issue before
starting anything non-trivial — issues carry the constraints that explain why work is scoped the way
it is. Update the issue as work lands rather than narrating status elsewhere.

[TODO.md](./TODO.md) is **historical context only**, kept for the long-form reasoning behind earlier
decisions. Do not add new planned work to it and do not keep it in sync — two roadmaps drift within a
week. If a decision in it still matters, move it into the relevant Linear issue.

Note that the concurrent-IPC project is a deliberate learning exercise for the repo owner — explain,
review, and prototype on request, but do not implement it end-to-end unsolicited.

### Working in Linear
Ryan and agents both manage tickets, so leave the workspace in a state the other can pick up.

- **Read the `Writing conventions` document** (team-level, in Linear) before creating or editing
  anything. Issues take **Background / Proposal / Constraints / Open questions / Done when**;
  projects keep that shape with freer section names. Bullets over prose; drop a section rather than
  pad it.
- **Labels:** exactly one type (`Feature`, `Improvement`, `Bug`, `Chore`, `Spike`) and one or more
  area (`client`, `local-service`, `cloud-service`, `electron`).
- **Projects vs standalone issues:** a project is multi-step work with an outcome and a sequence; a
  standalone issue lands in a single PR and needs no coordination.
- `Spike` means the deliverable is a written decision. Close one by writing the answer into
  **Proposal**, then opening the implementation issues.
- Dependencies are Linear relations, not sentences in the description.
- Creating and updating issues is fair game. **Bulk reordering, re-prioritising, or rewriting
  existing issues is not — ask first**, since manual order is workspace-wide and overwrites Ryan's.

### MCP vs the GraphQL API
The `mcp__linear-server__*` tools cover most reads and writes and are the default. **The API is
strictly more capable — fall back to it whenever the MCP cannot express something.** Known gaps:
`sortOrder` (manual ordering) on issues and projects, and clearing a project icon.

```powershell
. $PROFILE                                    # the PowerShell tool does NOT load profiles itself
Invoke-RestMethod -Uri 'https://api.linear.app/graphql' -Method Post -Body $json `
  -Headers @{ 'Authorization' = $env:LINEAR_API_KEY; 'Content-Type' = 'application/json' }
```

- `LINEAR_API_KEY` lives in Ryan's PowerShell profile and is **not** exported to Git Bash. Dot-source
  `$PROFILE` first, every invocation. Never echo the key.
- The `Authorization` header takes the raw key — no `Bearer` prefix.
- **Introspect before writing an unfamiliar field** (`__type(name: "IssueUpdateInput")`) rather than
  trusting a remembered schema.
- Manual order is a `Float` on `sortOrder`, ascending. Space values (100, 200, 300…) so items can be
  dragged into gaps later without renumbering.
- After a bulk write, read the data back and check it, not just the `success` flag.

## Project Structure & Module Organization
This repository contains a desktop app plus two Go services:
- `client/`: React + TypeScript + Vite frontend (`src/components`, `src/context`, `src/services`, `src/types`).
- `electron/`: Electron main/preload IPC bridge (`main.js`, `preload.js`) used by the desktop shell.
- `noteblock-local-service/`: local-first Go sidecar binary (`cmd/noteblock`, `internal/ipc`, `internal/service`, `internal/mapper`, `internal/db`).
- `noteblock-cloud-service/`: cloud sync Go API (`cmd/api`, `internal/server`, `internal/database`, `internal/model`).
- `assets/icons/`: app icons for packaging. `dist/` is generated output; do not hand-edit it.

## Build, Test, and Development Commands
- `npm run dev` (repo root): rebuilds local Go binary, then runs Vite client and Electron together.
- `npm run build` (repo root): builds client and packages Electron via `electron-builder`.
- `cd client && npm run lint`: runs ESLint on TypeScript/React code.
- `cd client && npm run build`: type-checks (`tsc -b`) and builds frontend assets.
- `cd client && npm test`: runs frontend service/preload tests (Vitest).
- `cd noteblock-cloud-service && make test`: runs Go unit tests.
- `cd noteblock-cloud-service && make itest`: runs DB integration tests (requires Docker/Testcontainers).
- `cd noteblock-local-service && go test ./... `: runs local service tests, including IPC integration smoke tests.
- `cd noteblock-local-service && go build -o bin/noteblock-server.exe ./cmd/noteblock` (Windows): builds local service binary used by Electron packaging.

## Architecture Invariants
These are load-bearing. Breaking one produces confusing runtime failures rather than compile errors.

- **Local-first is the point.** All folder/note/block/image operations go through the local Go sidecar over IPC and must work fully offline. Cloud sync is additive and eventually consistent — never put a network call on a local read/write path.
- **IPC protocol is stdout-only JSON lines.** Any non-JSON on the Go process's stdout breaks the parser in `electron/main.js`. Protocol output goes to stdout; all logging goes to stderr (Go's `log` package defaults to stderr — keep it that way).
- **Transport split is intentional.** Local flows use IPC; `RestClient` is reserved for cloud/auth/sync HTTP flows. Do not route local operations through HTTP.
- **Preload is the boundary.** The renderer calls `window.noteblock.local.*` via service wrappers in `client/src/services`. It must never touch Electron or Node APIs directly.
- **Local image URLs are not HTTP.** They use `noteblock-image:///...` and are resolved by the Electron protocol handler. `getDataPath()` in `electron/main.js` is the single source of truth for the data directory — the Go process's `NOTE_DB_PATH` and the image protocol handler must resolve to the same place, or images written in dev cannot be read back.

## Adding a New IPC Method
A method must be registered in **six** places, in lockstep. Missing one fails at runtime, not at compile time — this is the most common source of bugs in this repo:

1. `noteblock-local-service/internal/ipc/{domain}_handlers.go` — the handler itself
2. `noteblock-local-service/internal/ipc/dispatcher.go` — register in the `buildHandlers` map
3. `electron/preload.js` — expose it on the `contextBridge`
4. `client/src/types/electron-api.d.ts` — type it on `window.noteblock`
5. `client/src/services/LocalIpcClient.ts` — the typed client wrapper
6. `client/src/services/{Domain}Service.ts` — the service-level API the components call

Handlers return `Response`; use `rpcErr` for failures and `dbErrToRPC` to map GORM errors onto RPC codes rather than inventing new ones.

## Adding a New Block Type
Unlike adding an IPC method, this is **cheap and frontend-only**. `Block.Type` is a plain `string` in
`model/block.go` with no enum or validation, and `Block.Content` is an opaque JSON string the Go
service never parses. So a new block type needs **no Go changes, no IPC changes, and no migration** —
`block.create` / `block.update` / `block.delete` already carry it.

What a new type actually costs:
1. Add it to the `BlockType` union and give its content an interface in `client/src/types/Note.ts`.
2. Write the component under `client/src/components/blocks/block_types/`.
3. Render it in the `block.type === ...` switch in `ContentPanel.tsx`, and offer it wherever blocks
   are created (`InsertionPoint.tsx`, or a trigger inside `TextBlock`).
4. Persist through `NoteService.updateBlock(noteId, blockId, {type, content})` — whatever shape you
   put in `content` comes back verbatim.

So the real design work is **the content data model, not the plumbing**. Two conventions worth
keeping:
- **Store source data, not rendered output.** Image annotations are stroke lists, not a flattened
  PNG, so the original survives and strokes stay editable.
- **Store resolution-independent values.** Stroke points are 0..1 fractions of the image box, so they
  survive any display size rather than baking in pixel coordinates.

Because content is unvalidated, a malformed blob fails at render rather than at write. Components
should read it defensively (`content?.url`) and degrade rather than throw.

## Coding Style & Naming Conventions
Be pragmatic. Match the surrounding code rather than importing conventions from elsewhere.

- **The code is the documentation; comments are the exception.** This codebase is deliberately
  near-comment-free — `electron/preload.js` and `client/src/services/NoteService.ts` have zero, and
  that is correct. Before writing a comment, first try to make it unnecessary: a clearer name, a
  smaller function, an extracted constant, or a descriptive test name. Reach for a comment only when
  the code cannot carry the meaning on its own.
- **When one is warranted, write exactly one line.** Only for something genuinely non-obvious: a
  cross-file invariant, a non-local consequence, a workaround for third-party behaviour, or a choice
  that looks wrong until you know why. Say *why*, never *what* — the code already says what. Never
  write block comments, function-header docs, section banners, or a comment restating the line below.
- **Maintaining this is part of the job.** When you touch a file, delete comments that have gone
  stale or that restate the code, and collapse any multi-line block you find down to a single line or
  nothing. Do not leave commented-out code behind; git has it. A comment that no longer matches the
  code is worse than no comment, so if you change behaviour the nearby comment is yours to fix.
- `TODO:` comments are the exception — they are roadmap markers, some referencing ticket IDs (`NB-31`, `NB-32`). Leave them in place unless you are implementing them.
- TypeScript/React: follow ESLint config in `client/eslint.config.js`; use PascalCase for components (`Sidebar.tsx`), camelCase for variables/functions, and keep service/type files descriptive (`NoteService.ts`, `filesystem.ts`).
- Go: use standard Go formatting (`gofmt`), package-oriented layout under `internal/`, and `_test.go` suffix for tests.
- Prefer small, focused modules over large mixed-responsibility files. `Sidebar.tsx` (~650 LOC) and `TextBlock.tsx` (~520 LOC) are the known refactor targets — do not grow them further.
- Do not silently discard errors. `_ = someCall()` and bare `db.Create(...)` without checking `.Error` have hidden real bugs here before.

## Testing Guidelines
- Cloud service tests use Go `testing` (`*_test.go`), including integration coverage in `internal/database/database_test.go`.
- Run `make test` before PRs; run `make itest` when changing DB or persistence behavior.
- Local desktop flows should pass `go test ./...` in `noteblock-local-service` before PRs.
- Frontend service and preload bridge tests run with `npm test`; add targeted mocks for transport-layer changes.
- `npm run lint` currently reports pre-existing `no-explicit-any` errors in `client/src/types/electron-api.d.ts` and `client/src/types/Note.ts`. Do not add new ones; fixing the existing ones is a welcome standalone change.

### Verifying UI changes end-to-end (required)
Unit tests passing is **not** sufficient evidence for a UI change. After `npm test` and `npm run lint`
are green, verify the change in a real browser with the Playwright MCP tools before reporting it done.

1. Start the client dev server (`cd client && npm run dev`) and open the URL it prints.
2. The renderer needs `window.noteblock`, which only Electron's preload provides. In a plain browser
   `client/src/dev/mockBridge.ts` installs the same bridge shape automatically — dev-only, behind
   `import.meta.env.DEV`, and verified absent from `dist/`. Add seed data there when a scenario needs it.
3. Drive the real UI and assert on **measured values**, not screenshots: read back
   `getComputedStyle` and `getBoundingClientRect` via `browser_evaluate`. Spacing, indent, and
   alignment claims must come from numbers. State the before/after figures when reporting.

Known friction, so it is not rediscovered every time:
- Playwright's click can time out on this page (`waiting for element to be stable`). Prefer
  `browser_evaluate` to drive the DOM, and fall back to real clicks only when an interaction needs them.
- A JS-set DOM `Range` does **not** sync into Lexical's selection, so synthetic carets cannot drive
  editor keybindings. Real key handling has to be checked with a real click plus `browser_press_key`.
- MDXEditor's ref does not expose the Lexical editor; use `__lexicalEditor` on the contenteditable root.
- The dev mock is in-memory and reseeds on reload, so reload between measurements to avoid drift from
  earlier edits (including any typing done by hand in that tab).

## Common Pitfalls and Self-improvement
- **Local binary freshness matters.** Electron dev launches `noteblock-local-service/bin/noteblock-server(.exe)`. A stale binary means you are debugging code that is no longer on disk. Use root `npm run dev` or `npm run build:local-service` first.
- **`gofmt -l` reports every Go file on Windows.** This is a CRLF artifact, not real formatting drift — git normalizes line endings on commit. Do not "fix" it; the resulting whole-file diffs bury the real change. Verify formatting with `gofmt -d <file>` and check whether the diff is anything other than `^M`.
- **Preserve a file's existing line endings when scripting edits.** Tools that rewrite a CRLF file as LF turn a three-line change into a whole-file diff.
- `block.update` can race with UI autosave after block deletion/reorder; `NOT_FOUND` here is often benign and is deliberately swallowed in `electron/main.js`, not a fatal sync issue.
- The IPC server handles requests **strictly sequentially** (`ipc/server.go`, one `scanner.Scan()` loop). A slow request head-of-line-blocks every request behind it. Keep handlers fast; assume no concurrency until that changes.
- `internal/api` (Gin HTTP handlers) and `internal/routes` were removed after the IPC migration, along with the Gin dependency. Do not reintroduce an HTTP server in the local service.
