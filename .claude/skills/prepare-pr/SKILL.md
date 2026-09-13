---
name: prepare-pr
description: >
  Turn finished, human-reviewed work into a PR body for this repo: three sections, no emojis,
  evidence rather than intent. Use after the human ownership gate, when the user asks to open a PR
  or write a PR description.
---

# Prepare the PR

Run this **after** the human has reviewed the diff and taken ownership, not before. Green tests and
satisfied review agents are not the gate.

## The body: three sections, nothing else

```
## What
## Why
## Verification
```

Plus screenshots or a short video for frontend changes, when you can capture them. Link the Linear
ticket by id on its own line at the end.

A reviewer should be able to decide in under a minute. Long bodies get skimmed, which is worse than
short ones.

- A few lines each. Bullets over prose. No preamble, no summary paragraph, no closing note.
- **No emojis.**
- **Do not narrate the process**, the alternatives weighed, or the bugs hit along the way. That goes
  in the commit body, where someone reading `git log` wants it. The commit message carries the
  depth; the PR body carries the decision.
- **Verification is evidence, not intent.** Numbers, before/after, command output. "Tested locally"
  is not verification. Paste the measured values, trimmed to the lines that matter.

You gathered this during validation and review. Assembling it should be compression, not authorship —
if you are inventing the Verification section now, you did not actually validate.

## What to leave out, and where it goes instead

| Material | Where it belongs |
| --- | --- |
| why this approach over the other one | commit body |
| bugs hit and fixed on the way | commit body |
| review findings you rejected | your report to the human, not the PR |
| long design reasoning | Linear |

A genuine residual risk or limitation the reviewer needs to know is the exception — one line under
**What**, stated plainly.

## Stacked PRs

When the change is one layer of a stack, the PR's base is the layer below it, not `main`. Open it
against that branch so the diff shows only this change — a stacked PR based on `main` shows the
whole stack and is unreviewable.

Add one line above **What** naming the parent (`Stacked on #19.`) and nothing more; the reviewer
needs the order, not a retelling of the layers below. Each layer gets its own three sections and its
own verification — a stack is a sequence of independently reviewable changes, and a body that leans
on "see the parent PR" defeats the reason for stacking.

## Honesty rules

- Never claim a human reviewed it if they did not.
- Never claim verification you did not run. If a workflow is still pending or something could not be
  checked, say so in the body.
- If a known limitation ships with the change, name it and link the ticket tracking it.

## Committing and pushing

Commits and the push itself are the `/push` skill's job — it reads the repo's commit conventions and
handles the attribution rules. Do not duplicate that here, and do not push or open the PR unless the
user asked for it.
