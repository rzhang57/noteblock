# Repository Guidelines

## Planned Work
[TODO.md](./TODO.md) is the persisted source of truth for planned work and the reasoning behind it.
Read it before proposing or starting anything non-trivial — it records constraints that explain why
items are scoped the way they are. Update statuses and append findings as work lands; do not delete
the context lines.

Note in particular that item 3 (concurrent IPC) is a deliberate learning exercise for the repo owner
— explain, review, and prototype on request, but do not implement it end-to-end unsolicited.

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

## Coding Style & Naming Conventions
Be pragmatic. Match the surrounding code rather than importing conventions from elsewhere.

- **Comments are sparse.** This codebase is deliberately near-comment-free — `electron/preload.js` and `client/src/services/NoteService.ts` have zero, and that is correct. Write at most a **single line**, and only where the code is genuinely non-obvious: a cross-file invariant, a non-local consequence, a deliberate-looking-wrong choice. Never write block comments, function-header docs, or a comment that restates what the line below already says. A clear name or a descriptive test name beats a comment.
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

## Common Pitfalls and Self-improvement
- **Local binary freshness matters.** Electron dev launches `noteblock-local-service/bin/noteblock-server(.exe)`. A stale binary means you are debugging code that is no longer on disk. Use root `npm run dev` or `npm run build:local-service` first.
- **`gofmt -l` reports every Go file on Windows.** This is a CRLF artifact, not real formatting drift — git normalizes line endings on commit. Do not "fix" it; the resulting whole-file diffs bury the real change. Verify formatting with `gofmt -d <file>` and check whether the diff is anything other than `^M`.
- **Preserve a file's existing line endings when scripting edits.** Tools that rewrite a CRLF file as LF turn a three-line change into a whole-file diff.
- `block.update` can race with UI autosave after block deletion/reorder; `NOT_FOUND` here is often benign and is deliberately swallowed in `electron/main.js`, not a fatal sync issue.
- The IPC server handles requests **strictly sequentially** (`ipc/server.go`, one `scanner.Scan()` loop). A slow request head-of-line-blocks every request behind it. Keep handlers fast; assume no concurrency until that changes.
- `internal/api` (Gin HTTP handlers) and `internal/routes` were removed after the IPC migration, along with the Gin dependency. Do not reintroduce an HTTP server in the local service.
