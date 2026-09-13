---
name: verify-sync-change
description: >
  Verify a sync change with two sidecars against one cloud service before calling it done, and the
  Supabase connection facts needed to point it at the real database. Every serious sync bug so far
  was invisible to unit tests and obvious within one round trip. Use when changing the sync engine,
  the cursors, the /sync endpoint, the LWW apply, or anything the two services exchange.
---

# Verify a sync change end to end

Unit tests do not catch sync bugs. The stub flusher never contends for the slot, the single database
never disagrees with itself, and SQLite never complains about a column type. **Two sidecars against
one cloud service is the whole rig**, and it is worth reaching for whenever sync behaviour changes.

## The rig, without two machines

```
# cloud service, no Postgres and no Docker needed
BLUEPRINT_DB_SQLITE_PATH=/tmp/cloud.sqlite PORT=8090 ./bin/cloud-api.exe

# two "devices", each its own database, same service
NOTEBLOCK_CLOUD_URL=http://127.0.0.1:8090 NOTE_DB_PATH=/tmp/A ./bin/noteblock-server.exe < a.jsonl
NOTEBLOCK_CLOUD_URL=http://127.0.0.1:8090 NOTE_DB_PATH=/tmp/B ./bin/noteblock-server.exe < b.jsonl
```

Rebuild both binaries first (`npm run build:services`); a stale one means testing code that is no
longer on disk.

- **Drive it with `sync.flush`, not the ticker.** Feed the sidecar a JSON-lines file ending in
  `{"method":"sync.flush"}`: the pass runs synchronously and the process exits on stdin EOF. Waiting
  on the interval races that exit and silently proves nothing.
- **Assert against the server's own database, not just the second device.** A device can look right
  because it never pulled at all.
- A round trip worth running: A creates and flushes → check the row server-side → B (fresh database)
  flushes and sees it → B writes → A flushes and sees B's write. Both clocks set, `updated_at`
  greater than `created_at`.

## What the rig catches that tests do not

- **SQLite ignores declared column types.** A Postgres-only schema bug — `type:uuid` on a column
  holding the literal `"root"` — passes every SQLite test *and* a full SQLite-backed end-to-end run,
  then 500s on the first real request. Schema assumptions need a Postgres-backed test;
  `internal/database` already has the Testcontainers harness.
- **A flush that reports success having done nothing.** `Pass` yields when another pass holds the
  slot, which is right for a ticker and exactly wrong for a flush — shutdown calls flush *because*
  it wants the work done. Contention only happens with a real pass in flight.
- **Ordering failures across a payload.** Folders arriving after the notes that reference them.

## Supabase specifics

- **The direct database host is IPv6-only.** `db.<ref>.supabase.co` has no A record; `nslookup`
  finds it and `getaddrinfo` fails. Use the **Session** pooler (IPv4).
- **Session pooler, not Transaction.** Transaction mode does not support the prepared-statement
  cache pgx uses, absent `default_query_exec_mode=simple_protocol`.
- The pooler region is in neither the MCP nor any response header. Supavisor answers an unknown
  project with `Tenant or user not found` and a known one with an auth failure, so a wrong password
  against candidate hosts identifies the region.
- **GORM names indexes after the struct field, not the column.** `ServerUpdatedAt` mapped to
  `updated_at` still wants `idx_*_server_updated_at`. A mismatch makes AutoMigrate try to create its
  own, which fails for any role that does not own the table.
- **Enable RLS on every public table.** Supabase serves them through PostgREST on the anon key,
  which ships in clients. The service connects as a role with an explicit policy; RLS with no policy
  is the correct deny-all for everything else.
- Connect as a dedicated least-privilege role, not the project's `postgres` account. Credentials
  live in the gitignored `.env`.

## Reporting

The round trip is the evidence: the ids that crossed, which device wrote them, what the server's own
table says. Paste the sequence, trimmed. Delete test rows afterwards.
