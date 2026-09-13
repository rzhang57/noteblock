# Repository Guidelines

See [CLAUDE.md](./CLAUDE.md) for the full guidelines. That file is the single source of truth for
project structure, build/test commands, architecture invariants, coding style, and known pitfalls.

Procedures live in `.claude/skills/` — `develop-feature` is the end-to-end playbook, with
`ipc-change`, `block-type-change`, `verify-ui-change` and `prepare-pr` underneath it. Review
perspectives live in `.claude/agents/`.

This file exists so agents that look for `AGENTS.md` by convention find their way there. Keep it as a
pointer — do not copy the content back, or the two will drift.
