# Repository Guidelines

See [CLAUDE.md](./CLAUDE.md) for the full guidelines. That file is the single source of truth for
project structure, build/test commands, architecture invariants, coding style, and known pitfalls.

Procedures live in `.claude/skills/`. Three skills implement work, by how much control the engineer
keeps: `implement-change` (one scoped increment, the default), `develop-feature-incrementally` (plan
a feature, one change per human review), `develop-feature` (whole feature, one pass). Under them sit
`ipc-change`, `block-type-change`, `verify-ui-change` and `prepare-pr`. Review perspectives live in
`.claude/agents/`.

This file exists so agents that look for `AGENTS.md` by convention find their way there. Keep it as a
pointer — do not copy the content back, or the two will drift.
