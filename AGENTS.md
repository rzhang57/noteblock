# Repository Guidelines

## Project Structure & Module Organization
This repository contains a desktop app plus two Go services:
- `client/`: React + TypeScript + Vite frontend (`src/components`, `src/context`, `src/services`, `src/types`).
- `electron/`: Electron main/preload IPC bridge (`main.js`, `preload.js`) used by the desktop shell.
- `noteblock-local-service/`: local-first Go sidecar binary (`cmd/noteblock`, `internal/ipc`, `internal/service`, `internal/db`).
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
- `cd noteblock-local-service && go test ./internal/ipc -v`: runs local IPC integration smoke tests.
- `cd noteblock-local-service && go build -o bin/noteblock-server.exe ./cmd/noteblock` (Windows): builds local service binary used by Electron packaging.

## Coding Style & Naming Conventions
- TypeScript/React: follow ESLint config in `client/eslint.config.js`; use PascalCase for components (`Sidebar.tsx`), camelCase for variables/functions, and keep service/type files descriptive (`NoteService.ts`, `filesystem.ts`).
- Go: use standard Go formatting (`gofmt`), package-oriented layout under `internal/`, and `_test.go` suffix for tests.
- Prefer small, focused modules over large mixed-responsibility files.

## Testing Guidelines
- Cloud service tests use Go `testing` (`*_test.go`), including integration coverage in `internal/database/database_test.go`.
- Run `make test` before PRs; run `make itest` when changing DB or persistence behavior.
- Local desktop flows should pass `go test ./internal/ipc -v` before PRs.
- Frontend service and preload bridge tests run with `npm test`; add targeted mocks for transport-layer changes.

## Common Pitfalls
- Local binary freshness matters: Electron dev launches `noteblock-local-service/bin/noteblock-server(.exe)`. If this binary is stale, you may accidentally run old HTTP/Gin code and break IPC. Use root `npm run dev` or `npm run build:local-service` before debugging.
- IPC protocol is stdout-only JSON lines: any non-JSON stdout from the Go process breaks parsing. Keep protocol output on stdout and operational logs on stderr.
- `block.update` can race with UI autosave after block deletion/reorder; `NOT_FOUND` here is often benign, not a fatal sync issue.
- Local image URLs are not HTTP: they use `noteblock-image:///...` and are resolved by Electron protocol handler from `NOTE_DB_PATH/uploads/images`.
- Transport split is intentional: local folder/note/block/image flows use IPC; `RestClient` is reserved for cloud/auth/sync HTTP flows.
- Preload contract is the boundary: renderer should call `window.noteblock.local.*` via service wrappers, not call Electron/Node APIs directly.

## Commit & Pull Request Guidelines
- Recent history favors short, imperative commit subjects: `fix undo`, `add pre release dist build script`, `update readme`.
- Keep commit messages concise and scoped to one change.
- PRs should include:
  1. What changed and why.
  2. Affected modules/paths.
  3. Verification steps run (for example, `npm run build`, `make test`).
  4. Screenshots or short recordings for UI changes.
