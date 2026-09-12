# Repository Guidelines

## Repository Map
A desktop app plus two Go services:
- `client/`: React + TypeScript + Vite frontend (`src/components`, `src/context`, `src/services`, `src/types`).
- `electron/`: Electron main/preload IPC bridge (`main.js`, `preload.js`).
- `noteblock-local-service/`: local-first Go sidecar (`cmd/noteblock`, `internal/ipc`, `internal/service`, `internal/mapper`, `internal/db`).
- `noteblock-cloud-service/`: cloud sync Go API (`cmd/api`, `internal/server`, `internal/database`, `internal/model`).
- `assets/icons/`: packaging assets. `dist/` is generated output; never hand-edit it.

A write travels: component → `src/services/*Service` → `LocalIpcClient` → preload `contextBridge` →
Electron main → sidecar stdin → `ipc` dispatcher → service → GORM. Responses are correlated by `id`,
so they may arrive out of order.

## Essential Commands
- `npm run dev` (root): rebuilds the local Go binary, then runs Vite and Electron together.
- `npm run build` (root): builds the client and packages via `electron-builder`.
- `npm run build:services` (root): rebuilds both Go binaries alone.
- `cd client && npm test` / `npm run lint` / `npm run build` (the last type-checks via `tsc -b`).
- `cd noteblock-local-service && go test ./...` — includes the IPC round-trip smoke tests.
- `cd noteblock-local-service && go build -o bin/noteblock-server.exe ./cmd/noteblock` (Windows).
- `cd noteblock-cloud-service && make test`; `make itest` for DB integration (Docker/Testcontainers).

CI is path-scoped: a change under `client/` runs the client workflow only, likewise per Go service.
A change is not done until its workflow is green. `npm run lint` has pre-existing `no-explicit-any`
errors so it is not a CI gate yet — run it locally and do not add new ones.

## Architecture Invariants
Load-bearing. Breaking one produces confusing runtime failures rather than compile errors.

- **Local-first is the point.** All folder/note/block/image operations go through the local Go
  sidecar over IPC and must work fully offline. Cloud sync is additive and eventually consistent —
  never put a network call on a local read/write path.
- **IPC protocol is stdout-only JSON lines.** Any non-JSON on the sidecar's stdout breaks the parser
  in `electron/main.js`. Protocol goes to stdout, all logging to stderr (Go's `log` default — keep it).
- **Transport split is intentional.** Local flows use IPC; `RestClient` is reserved for
  cloud/auth/sync HTTP. Do not route local operations through HTTP, and do not reintroduce an HTTP
  server into the local service — `internal/api` (Gin) and `internal/routes` were deliberately removed.
- **Preload is the boundary.** The renderer reaches `window.noteblock.local.*` only through the
  service wrappers in `client/src/services`; it must never touch Electron or Node APIs directly.
- **Local image URLs are not HTTP.** They use `noteblock-image:///...`, resolved by the Electron
  protocol handler. `getDataPath()` in `electron/main.js` is the single source of truth for the data
  directory — the sidecar's `NOTE_DB_PATH` and the image protocol handler must resolve to the same
  place, or images written in dev cannot be read back.
- **Block content is deliberately opaque.** `Block.Type` is a plain `string` in `model/block.go` and
  `Block.Content` is JSON the Go service never parses, so an ordinary new block type needs no Go, IPC
  or migration change. Malformed content therefore fails at render rather than at write.
- **A new IPC method must be registered in six places in lockstep.** Missing one fails at runtime,
  not at compile time — the most common source of bugs in this repo. See the `ipc-change` skill.
- **Local IPC is strictly sequential** (`ipc/server.go`, one `scanner.Scan()` loop). A slow handler
  head-of-line-blocks every request behind it, so no two handlers ever run at once.
- **The sync engine is a second writer.** `internal/sync` runs on its own goroutine against the same
  `*gorm.DB`, so a handler can no longer assume it is alone: any read-modify-write must happen inside
  one transaction and check `RowsAffected`, or a pull landing in between is silently lost.
  `SetMaxOpenConns(1)` in `db.Open` serialises the two writers, and with more, SQLite returns
  `database is locked` under ordinary use. It also means a `Transaction` body must use its `tx`;
  reaching back to the root handle deadlocks the process rather than erroring.
- Handlers return `Response`; use `rpcErr` for failures and `dbErrToRPC` to map GORM errors onto RPC
  codes rather than inventing new error semantics.

## Coding Conventions
Be pragmatic. Match the surrounding code rather than importing conventions from elsewhere.

- **The code is the documentation; comments are the exception.** This codebase is deliberately
  near-comment-free — `electron/preload.js` and `client/src/services/NoteService.ts` have zero, and
  that is correct. Prefer a clearer name, a smaller function, an extracted constant or a descriptive
  test name over a comment.
- **When one is warranted, write exactly one line, and say *why*, never *what*.** Only for a
  cross-file invariant, a non-local consequence, a third-party workaround, or a choice that looks
  wrong until you know why. No block comments, header docs, section banners, or restatements.
- **Maintaining this is part of the job.** When you touch a file, delete comments that have gone
  stale or restate the code, and collapse multi-line blocks. Leave no commented-out code; git has it.
- `TODO:` comments are roadmap markers, some citing ticket IDs (`NB-31`, `NB-32`). Leave them in
  place unless you are implementing them.
- TypeScript/React: follow `client/eslint.config.js`; PascalCase components (`Sidebar.tsx`),
  camelCase values, descriptive service/type files (`NoteService.ts`, `filesystem.ts`).
- Go: `gofmt`, package-oriented layout under `internal/`, `_test.go` suffix for tests.
- Prefer small, focused modules over large mixed-responsibility files.
- Never silently discard errors. `_ = someCall()` and a bare `db.Create(...)` without checking
  `.Error` have each hidden real bugs here.

## Validation
Run the tests and the build for every area a change touches, and let the path-scoped CI go green.

A UI behaviour or layout change additionally requires runtime verification in a real browser; unit
tests are necessary but not sufficient.

Longer procedures live in `.claude/skills/`, not here. Three skills implement work, in order of how
much control the engineer keeps: `implement-change` (one already-scoped increment, designed with the
engineer before any code — the default), `develop-feature-incrementally` (plan a feature once, then
one change per human review), and `develop-feature` (a whole feature in one unreviewed pass; the
exception). Underneath all three sit `ipc-change`, `block-type-change`, `verify-ui-change` and
`prepare-pr`.

## Repo-Specific Landmines
- **Binary freshness.** Electron dev launches `noteblock-local-service/bin/noteblock-server(.exe)`
  and `noteblock-cloud-service/bin/cloud-api(.exe)`.
  A stale binary means debugging code that is no longer on disk — run `npm run dev` or
  `npm run build:services` first.
- **`gofmt -l` reports every Go file on Windows.** A CRLF artifact, not real drift; git normalizes on
  commit. Do not "fix" it — the whole-file diffs bury the real change. Check with `gofmt -d <file>`
  and see whether the diff is anything other than `^M`.
- **Preserve a file's existing line endings when scripting edits.** Rewriting a CRLF file as LF turns
  a three-line change into a whole-file diff.
- `block.update` can race with UI autosave after a block delete or reorder. `NOT_FOUND` there is
  usually benign and is deliberately swallowed in `electron/main.js`.
- Playwright's click can time out on this page (`waiting for element to be stable`); prefer
  `browser_evaluate` to drive the DOM.
- A JS-set DOM `Range` does not sync into Lexical's selection, so synthetic carets cannot drive
  editor keybindings — real key handling needs a real click plus `browser_press_key`.
- MDXEditor's ref does not expose the Lexical editor; use `__lexicalEditor` on the contenteditable
  root. It also injects its stylesheet at runtime, after ours, so equal-specificity CSS loses to it.
- `client/src/dev/mockBridge.ts` is in-memory and reseeds on every reload.

## Project Context
Linear (`linear.app/noteblock`) is the source of truth for project direction — reach it through the
`mcp__linear-server__*` tools, or the GraphQL API at `https://api.linear.app/graphql` when the MCP
cannot express something (`LINEAR_API_KEY` is in the shell profile; dot-source `$PROFILE` first, the
PowerShell tool does not load it).

Keep CLAUDE.md the only prose doc in the repo: procedures belong in `.claude/skills/`, review
perspectives in `.claude/agents/`, roadmaps and long-form reasoning in Linear.

The concurrent-IPC work is a deliberate learning exercise for the repo owner — explain, review and
prototype on request, but do not implement it end-to-end unsolicited.
