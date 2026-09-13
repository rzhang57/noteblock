---
name: ipc-change
description: >
  How to add or change a local IPC method in noteblock. The protocol spans six layers from the Go
  sidecar to the React service wrappers, and skipping one fails at runtime rather than at compile
  time. Use when adding an IPC method, renaming one, changing its params or result shape, or
  changing anything on the sidecar's stdout.
---

# Change the IPC surface

The renderer never talks to the sidecar directly. One logical operation exists in six places, and
**nothing in the toolchain will tell you when one is missing** — Go compiles, TypeScript compiles,
tests pass, and the call fails at runtime with `METHOD_NOT_FOUND` or `undefined is not a function`.

Treat the six as a single unit of work. Do not commit a partial ladder.

## The six layers

Adding `note.archive` as the running example:

| # | File | What goes there |
| --- | --- | --- |
| 1 | `noteblock-local-service/internal/ipc/{domain}_handlers.go` | `func (s *Server) noteArchive(req Request) Response` |
| 2 | `noteblock-local-service/internal/ipc/dispatcher.go` | `"note.archive": s.noteArchive` in `buildHandlers()` |
| 3 | `electron/preload.js` | `archive: (id) => callLocal("note.archive", { id })` on the `contextBridge` |
| 4 | `client/src/types/electron-api.d.ts` | the method's type on `window.noteblock.local.note` |
| 5 | `client/src/services/LocalIpcClient.ts` | the typed wrapper forwarding to `window.noteblock…` |
| 6 | `client/src/services/{Domain}Service.ts` | the API components actually call, mapping to domain types |

Layers 3–5 look like duplication and are not: preload is the security boundary, the `.d.ts` is the
contract, and `LocalIpcClient` is the single seam the tests mock.

**When changing an existing method, walk all six anyway.** A params rename that stops at layer 3
produces a handler quietly reading a zero value — the call succeeds and does nothing.

## Handler conventions

Follow `block_handlers.go`; it is the clearest example.

- Parse with `parseParams(req.Params, &body)` into a local anonymous struct. The wire format is
  `snake_case` JSON; the struct tags carry it.
- Validate required fields explicitly and return `rpcErr(req.ID, "BAD_REQUEST", …)`.
- Map GORM failures with `dbErrToRPC(req.ID, err, "Failed to …")` rather than inventing error
  semantics. It already turns `gorm.ErrRecordNotFound` into `NOT_FOUND`; everything else is
  `INTERNAL`.
- Return `Response{ID: req.ID, Result: …}`. Result keys are `snake_case`, matching the request side.
- Keep the handler thin. Business logic belongs in `internal/service`, mapping in `internal/mapper`.

Existing codes: `BAD_REQUEST`, `NOT_FOUND`, `INTERNAL`, `METHOD_NOT_FOUND`. Add a new one only with
a reason, and handle it on the client side in the same change.

## Constraints that bite

- **stdout is the protocol.** One stray `fmt.Println` in a handler corrupts the JSON-lines stream and
  breaks the parser in `electron/main.js` for the rest of the session. Log to stderr — Go's `log`
  package already does.
- **The server is single-threaded.** `ipc/server.go` runs one `scanner.Scan()` loop, so a slow
  handler head-of-line-blocks every request behind it. No handler may block on network or on a long
  lock. If an operation is genuinely slow, that is a design conversation, not a goroutine you add
  quietly.
- **Handlers must not panic-guard sloppily.** `handle()` recovers and returns `INTERNAL`, which keeps
  the sidecar alive but turns a bug into a mystery. Validate instead of relying on it.
- **Local operations never go over HTTP.** `RestClient` is for cloud/auth/sync only.

## Validation

1. `cd noteblock-local-service && go test ./...` — `internal/ipc/server_test.go` drives real requests
   through the dispatcher against a temp SQLite database. **Add a round-trip case for the new method
   there**, including its error path. This is the test that catches layers 1–2.
2. `cd client && npm test` — `LocalIpcClient.test.ts` and the `*Service.test.ts` files cover layers
   5–6. Add a case asserting the exact method name and payload shape reaching the bridge.
3. Layers 3–4 have no automated coverage. Verify them by hand: rebuild the sidecar
   (`npm run build:local-service`), run `npm run dev`, and exercise the operation in the real app.
4. If the renderer path is exercised through the dev browser instead, add the method to
   `client/src/dev/mockBridge.ts` too, or the mock bridge diverges from preload and UI verification
   silently tests the wrong shape.

Grep for the method name across the repo before declaring it done — six hits, six files.
