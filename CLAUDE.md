# Repository Guidelines

## Planned Work
Linear (`linear.app/noteblock`) is the source of truth for project direction. Access it through the
`mcp__linear-server__*` tools, or the GraphQL API at `https://api.linear.app/graphql` when the MCP
cannot express something — `LINEAR_API_KEY` is set in the shell profile (dot-source `$PROFILE`
first; the PowerShell tool does not load it).

Keep CLAUDE.md the only doc in the repo. Roadmaps and long-form reasoning live in Linear.

The concurrent-IPC work is a deliberate learning exercise for the repo owner — explain, review, and
prototype on request, but do not implement it end-to-end unsolicited.

## How the system fits together
A desktop app over a local-first Go sidecar, plus a cloud service that is still mostly scaffolding.

- `client/` — React + TypeScript + Vite renderer. Components under `src/components`, transport
  wrappers under `src/services`, shared types under `src/types`.
- `electron/` — main process and preload bridge. Owns the sidecar's lifetime, the data directory, and
  the custom protocol handler for local images.
- `noteblock-local-service/` — the Go sidecar that owns all local data. `internal/ipc` is the wire
  layer, `internal/service` the domain logic, `internal/db` persistence.
- `noteblock-cloud-service/` — Go sync API. Not yet load-bearing.
- `assets/icons/` for packaging. `dist/` is generated; never hand-edit it.

A write travels: component → `src/services/*Service` → `LocalIpcClient` → preload `contextBridge` →
Electron main → sidecar stdin → `ipc` dispatcher → service → GORM. Responses come back by `id`, so
they may arrive out of order.

### Invariants
Load-bearing. Breaking one produces confusing runtime behaviour rather than a compile error.

- **Local-first is the point.** Every folder/note/block/image operation goes through the sidecar over
  IPC and must work fully offline. Cloud sync is additive and eventually consistent — never put a
  network call on a local read or write path.
- **The IPC protocol is stdout-only JSON lines.** Any non-JSON on the sidecar's stdout breaks the
  parser in the Electron main process. Protocol output goes to stdout, all logging to stderr (Go's
  `log` defaults to stderr — keep it there).
- **The transport split is intentional.** Local flows use IPC. `RestClient` is reserved for
  cloud/auth/sync HTTP. Do not route local operations through HTTP.
- **Preload is the boundary.** The renderer reaches the sidecar only through `window.noteblock.local.*`
  via the service wrappers. It must never touch Electron or Node APIs directly.
- **Local image URLs are not HTTP.** They use the `noteblock-image://` protocol, resolved in the
  Electron main process. The sidecar's data directory and the protocol handler must resolve to the
  same place, or images written in dev cannot be read back.
- **The sidecar serves requests strictly sequentially.** One slow request head-of-line-blocks
  everything behind it. Keep handlers fast and assume no concurrency until that changes.

## Commands
- `npm run dev` (root) — rebuilds the sidecar, then runs the Vite client and Electron together.
- `npm run build` (root) — builds the client and packages via `electron-builder`.
- `npm run build:local-service` (root) — rebuilds just the sidecar binary.
- `cd client && npm test` / `npm run lint` / `npm run build` — Vitest, ESLint, typecheck + bundle.
- `cd noteblock-local-service && go test ./...` — includes the IPC integration smoke tests.
- `cd noteblock-cloud-service && make test` / `make itest` — unit, then DB integration (needs Docker).

CI runs these on every PR. A change is not done until it is green.

## Extending the system

### Adding an IPC method
Register it in **six** places, in lockstep. Missing one fails at runtime, not at compile time — this
is the most common source of bugs here.

1. `internal/ipc/{domain}_handlers.go` — the handler
2. `internal/ipc/dispatcher.go` — the `buildHandlers` map
3. `electron/preload.js` — expose on the `contextBridge`
4. `client/src/types/electron-api.d.ts` — type it on `window.noteblock`
5. `client/src/services/LocalIpcClient.ts` — the typed client wrapper
6. `client/src/services/{Domain}Service.ts` — the API components call

Handlers return `Response`; use `rpcErr` for failures and `dbErrToRPC` to map GORM errors onto RPC
codes rather than inventing new ones.

### Adding a block type
Unlike an IPC method, this is cheap and frontend-only. A block's type is an unvalidated string and
its content an opaque JSON blob the sidecar never parses, so a new type needs **no Go changes, no IPC
changes, and no migration** — the existing block methods already carry it.

What it actually costs: add the type to the `BlockType` union with a content interface, write the
component under `components/blocks/block_types/`, render it in the block-type switch, and offer it
wherever blocks get created. Persist through `NoteService.updateBlock` — whatever you put in
`content` comes back verbatim.

The real design work is the content data model, not the plumbing. Two conventions worth keeping:

- **Store source data, not rendered output** — annotations are stroke lists rather than a flattened
  image, so the original survives and edits stay possible.
- **Store resolution-independent values** — coordinates as fractions rather than pixels, so they
  survive any display size.

Because content is unvalidated, a malformed blob fails at render rather than at write. Read it
defensively and degrade rather than throw.

## Conventions
Be pragmatic and match the surrounding code rather than importing conventions from elsewhere.

- **The code is the documentation; comments are the exception.** Before writing one, try to make it
  unnecessary: a clearer name, a smaller function, an extracted constant, a descriptive test name.
- **When one is warranted, write exactly one line**, and only for something genuinely non-obvious — a
  cross-file invariant, a non-local consequence, a third-party workaround, or a choice that looks
  wrong until you know why. Say *why*, never *what*. No block comments, header docs, or banners.
- **Maintaining that is part of the job.** When you touch a file, delete stale comments and collapse
  multi-line blocks. Leave no commented-out code; git has it.
- `TODO:` comments are roadmap markers, some referencing ticket IDs. Leave them unless you are
  implementing them.
- Prefer small, focused modules. If a file is doing several jobs, splitting it is welcome.
- TypeScript/React: follow the ESLint config. PascalCase components, camelCase values, descriptive
  service and type filenames.
- Go: `gofmt`, package-oriented layout under `internal/`, `_test.go` suffix.
- **Never silently discard errors.** Ignored return values and unchecked `.Error` have hidden real
  bugs here before.

## Verifying changes
Match the evidence to the change. Passing unit tests is not evidence that a UI change works, and a
screenshot is not evidence that spacing is correct.

- **Backend and transport changes** — `go test ./...`, plus an end-to-end exercise through the real
  app when the change crosses the IPC boundary. A handler that compiles but was never registered
  looks identical to one that works, until runtime.
- **UI changes** — verify in a real browser with the Playwright MCP tools after tests and lint pass.
  Assert on measured values from `getComputedStyle` and `getBoundingClientRect`, not screenshots, and
  state before/after figures when reporting.

The renderer needs `window.noteblock`, which only Electron's preload provides. In a plain browser
`client/src/dev/mockBridge.ts` installs the same bridge shape — dev-only, behind `import.meta.env.DEV`,
and absent from production builds. Add seed data there when a scenario needs it.

Known friction, so it is not rediscovered each time:

- Playwright's click can time out waiting for elements to be stable. Prefer driving the DOM through
  `browser_evaluate`, and use real clicks only where an interaction genuinely needs them.
- A JS-set DOM `Range` does not sync into Lexical's selection, so synthetic carets cannot drive
  editor keybindings. Real key handling needs a real click plus a real key press.
- MDXEditor's ref does not expose the Lexical editor; reach it via `__lexicalEditor` on the
  contenteditable root.
- MDXEditor injects its stylesheet at runtime, after ours, so equal-specificity CSS loses to it.
- The dev mock is in-memory and reseeds on reload. Reload between measurements so earlier edits do
  not skew them.

## Pitfalls
- **Sidecar freshness matters.** Electron dev launches a prebuilt binary. A stale one means you are
  debugging code that is no longer on disk — rebuild before trusting what you see.
- **`gofmt -l` flags every Go file on Windows.** That is a CRLF artifact, not real drift; git
  normalises on commit. Check with `gofmt -d` and see whether the diff is anything but line endings.
- **Preserve a file's existing line endings when scripting edits.** Rewriting a CRLF file as LF turns
  a three-line change into a whole-file diff.
- A block update can race with autosave after a delete or reorder. `NOT_FOUND` there is usually
  benign and is deliberately swallowed in the Electron main process.
- The pre-IPC HTTP handlers and routes were removed along with their dependency. Do not reintroduce
  an HTTP server in the local service.
