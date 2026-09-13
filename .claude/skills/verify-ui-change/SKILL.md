---
name: verify-ui-change
description: >
  Verify a UI behaviour or layout change in a real browser before calling it done. Unit tests are
  necessary but not sufficient for anything a user sees or clicks. Use after tests pass on any
  change to components, styling, layout, spacing or interaction.
---

# Verify a UI change at runtime

A passing `npm test` proves the functions behave. It proves nothing about whether the thing renders,
responds to a click, or sits where you claim it sits. Verify in a browser before reporting done.

`CLAUDE.md` already lists the Lexical/MDXEditor/Playwright landmines you will hit — this is the
procedure, not the trap list.

## Setup

1. `cd client && npm run dev`, and open the URL it prints with the Playwright MCP tools.
2. The renderer needs `window.noteblock`, which only Electron's preload provides. In a plain browser
   `client/src/dev/mockBridge.ts` installs the same bridge shape automatically — dev-only, behind
   `import.meta.env.DEV`, and verified absent from `dist/`. Add seed data there when a scenario
   needs it, and keep its method shapes identical to `electron/preload.js` or you are verifying a
   fiction.
3. For anything that depends on the real sidecar — the `noteblock-image://` protocol, actual SQLite
   persistence, real IPC errors — use `npm run dev` at the repo root and drive Electron instead. The
   mock bridge cannot tell you the truth about those.

## Exercise the change

Drive the real UI through the actual interaction path a user takes: create the state, perform the
gesture, observe the result. Then reload and check it survived, whenever the change persists anything.

Check the error and empty paths too, not just the happy one. Most UI regressions here live in the
second state, not the first.

## Assert on measured values

**Screenshots are evidence of nothing.** Any claim about spacing, indent, alignment, size or
position must come from numbers read out of the live DOM via `browser_evaluate`:

```js
const el = document.querySelector('[data-block-id="…"]')
const r = el.getBoundingClientRect()
const s = getComputedStyle(el)
return { top: r.top, left: r.left, w: r.width, h: r.height, pad: s.padding, font: s.fontSize }
```

Measure **before and after** and report both figures. "Looks right" is not a result; "indent went
from 12px to 20px, sibling alignment unchanged at left: 264" is.

Take a screenshot as well when the change is visual — it is useful in the PR — but never as the
basis of the claim.

## Reporting

State what you drove, what you measured, and the before/after numbers. Those numbers are the
Verification section of the PR; write them down as you go rather than reconstructing them later.

If something could not be verified in the browser — it needs the packaged app, a real file dialog, a
second machine — say so explicitly rather than letting silence imply coverage.
