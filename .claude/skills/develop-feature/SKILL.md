---
name: develop-feature
description: >
  One-shot whole-feature build. Runs understand → implement → validate → review → walkthrough across
  an entire feature in a single unbroken pass, with no human gate until the very end, producing one
  large diff. The least control of the three implementation skills. Use at your own risk, and only
  when the user explicitly asks for a whole feature built in one go and accepts reviewing it all at
  once. Otherwise use `implement-change` or `develop-feature-incrementally`.
---

# Develop a feature (one shot)

> **Use at your own risk.** This skill builds an entire feature in one pass. The human sees nothing
> until the end, so a wrong foundational decision gets paid for across every downstream layer at
> once, and the diff that lands for review is the whole feature.

Three skills implement work in this repo, in order of how much control the engineer keeps:

| Skill | Unit of work | Human sees it |
| --- | --- | --- |
| `implement-change` | one increment they already scoped | design up front, then the finished change |
| `develop-feature-incrementally` | a feature, planned once, built one change at a time | after every change |
| `develop-feature` (this one) | a whole feature | once, at the end |

Only stay here if the engineer explicitly chose it.

The repo facts you need — architecture invariants, commands, coding conventions, landmines — are in
`CLAUDE.md` and already loaded. Do not restate them here; apply them.

This is a playbook, not a state machine. Use judgment about which steps earn their cost on this
particular change, and say which tier you picked and why. The one thing that is not negotiable:
**you do not open a PR until the human has reviewed and taken ownership.**

## 1. Understand

Read the actual requirement before touching code. Find the ticket in Linear if one exists. Read the
code that already does the nearest thing — this repo has strong existing patterns and the right
answer is usually "extend that one".

Write down the acceptance criteria in a sentence or two, in behavioural terms. If you cannot state
what observably changes for a user, you do not understand the task yet.

## 2. Classify the tier

Classify on **blast radius and difficulty of proving correctness**, not on lines of code. A
three-line change to a migration is HIGH-RISK; a 400-line new component is usually STANDARD.

Weigh: state changes, persistence, trust or security boundaries, external/public contracts,
concurrency, reversibility, how familiar the subsystem is, and how hard it is to prove the change
correct.

**When torn between two tiers, take the higher one.** Re-classify upward mid-implementation the
moment the real scope turns out riskier than it looked — that is expected, not a failure.

### TRIVIAL
Localized, obvious behaviour, no state-model change, no contract change, no security or concurrency
implication, deterministic to validate. Copy changes, small UI adjustments, narrow defensive fixes,
a one-line bug in well-covered code.

> understand → brief plan → implement → targeted validation → human review

No review agents. Spawning them here is ceremony, and ceremony trains the human to skim.

### STANDARD
The normal case: real logic, contained blast radius. New UI behaviour, business logic, a handler
following an established pattern, a feature-scoped refactor.

> plan → implement → validate → **correctness-reviewer** + **test-reviewer** → fix credible findings
> → revalidate → **code-walkthrough** → human ownership review → PR prep

### HIGH-RISK
Signals: auth, authorization, secrets, trust boundaries, untrusted input, public API compatibility,
schema or migrations, destructive data operations, distributed state, retries and idempotency,
concurrency and locking, cache consistency, performance on a hot path, infrastructure and
deployment, large cross-cutting changes, or an unfamiliar subsystem with wide reach.

In this repo that reliably means: anything touching the sync engine or cloud service, GORM models
and migrations, the IPC dispatcher's sequential loop, the preload boundary, the `noteblock-image://`
protocol handler, or `getDataPath()`.

> detailed plan → **human approval when real design choices exist** → implement → comprehensive
> validation → **correctness-reviewer** + **test-reviewer** + **architecture-reviewer**
> (+ **security-reviewer** when a trust boundary is in scope) → fix → revalidate → rerun the
> affected reviewers → **code-walkthrough** → human ownership review → PR prep

Do not promote every interesting task to HIGH-RISK. Review effort should stay proportional, or it
stops being read.

## 3. Plan

Scale the plan to the tier.

- **TRIVIAL** — a sentence. Then go.
- **STANDARD** — what behaviour changes, which areas it touches, the implementation approach, how
  you will validate it.
- **HIGH-RISK** — additionally: which invariants are in play, state and data changes, contract
  changes, the specific risks, the testing strategy, and migration/rollback if data is involved.
  Pause for human approval when there is a material design choice to make, not merely to check in.

## 4. Implement

Delegate the repo's known-sharp procedures rather than re-deriving them:

| When the change… | Use |
| --- | --- |
| adds or changes an IPC method, or any part of the protocol surface | `ipc-change` |
| adds a block type or materially changes a block's content model | `block-type-change` |

Do not inline those checklists here — read the skill.

While implementing: match the surrounding code, keep comments to the repo's near-zero bar, and never
leave an error silently discarded. If you find yourself fighting an invariant in `CLAUDE.md`, stop —
that is a design signal, not an obstacle.

## 5. Validate

Evidence, not intent. Run the real commands for every area touched and keep the output; it becomes
the PR's Verification section.

- Changed Go? `go test ./...` in that service. Touched persistence in the cloud service? `make itest`.
- Changed the client? `npm test`, `npm run build` (type-check), `npm run lint` (no new violations).
- Changed the sidecar and want to exercise it through the app? Rebuild the binary first — a stale
  binary means testing code that is no longer on disk.
- Changed UI behaviour or layout? Use `verify-ui-change`. Unit tests alone do not close this out.
  **This is a gate, not a suggestion.** Anything a user sees or clicks - a new component, a fix to
  an existing one, a layout or styling change - is not validated until a Playwright run has driven
  it in a real browser and printed measured values. Re-run that script against the pre-fix code and
  name the checks that flip; a UI fix nothing catches is one nothing will notice losing. If the
  browser could not be driven at all, say so in the gate under Validation rather than letting the
  unit tests imply coverage.

If a test cannot fail when the implementation is wrong, it is not validation. Prove at least one new
test fails against the old behaviour when the change is a bug fix.

## 6. Independent review

Spawn reviewers with the **Agent** tool. Run the tier's reviewers in a single message so they work
concurrently.

Give each of them: the task and acceptance criteria, how to obtain the diff (branch or base ref),
and anything genuinely external they cannot discover. **Do not give them your reasoning, your
self-assessment, or the other reviewers' findings.** The value is independent reconstruction; a
summary of what you believe you built poisons it.

| Agent | Fires when |
| --- | --- |
| `correctness-reviewer` | STANDARD and above |
| `test-reviewer` | STANDARD and above |
| `architecture-reviewer` | HIGH-RISK, or when the change adds a new pattern, layer or abstraction |
| `security-reviewer` | a trust boundary is in scope — auth, secrets, untrusted input, IPC surface, filesystem paths, network exposure, destructive operations |

Reviewers are advisory and read-only. **You own every edit.** Never let an agent patch the branch.

## 7. Fix loop

1. Consolidate and deduplicate the findings.
2. Judge each one on its merits. A confident agent is not a correct agent — reproduce the claimed
   failure, or explain concretely why it cannot happen.
3. Fix what is credible. Record what you rejected and why; that goes to the human, not into a void.
4. Re-run the validation the fix touches.
5. Re-run a reviewer only when the fix was substantial enough to change its conclusions.

**No majority voting.** One reviewer's credible high-impact finding outranks three clean reports.

## 8. Code walkthrough

Run `code-walkthrough` once the branch is final. It reconstructs the implementation independently
and produces a reading guide for the human — behaviour before and after, control and data flow,
design choices, the riskiest lines, which tests prove what, and a set of questions the owner should
be able to answer.

Give it the task and the diff. **Do not give it the reviewers' findings** — it is not an approval
step and it is not a summary of your work; it exists so the human can take ownership efficiently.

## 9. Human ownership gate

The engineer is about to own code they did not write. What they need first is **what it does and
where it lives** — not what was wrong with it. Findings come last: they describe work that is already
finished, and leading with them buries the things the owner actually has to carry.

Present in this order:

1. **What was built.** The behaviour, before to after, in terms a user would notice. Three or four
   sentences. Not a list of commits.
2. **How it flows.** The walkthrough's diagram, carried over verbatim. If there is none, draw it:
   entry point, each hop, the boundaries it crosses, where state is written, and what this change
   added. A change with genuinely no flow says so in one line instead.
3. **Where it lives.** The files that matter, grouped by purpose, one line each on why that file had
   to change, and the two or three worth opening first.
4. **Validation.** The real commands and their real output — numbers, not adjectives. Say plainly
   what you could not verify and why, rather than letting silence imply coverage.
5. **What to know before you own it.** The invariants this now rests on, the riskiest lines, and
   anything deliberately deferred.
6. **Questions you should be able to answer** — the walkthrough's, verbatim.
7. **Findings, last.** What review caught, what you fixed, what you rejected and why. A few lines.
   Summarise; do not reproduce each reviewer's report.

The first three are the ones that get squeezed when the message runs long, and the ones the engineer
cannot reconstruct from anywhere else. If you are cutting, cut findings, never flow.

Then **stop and wait**. Green tests and satisfied agents are not authorization. The engineer is the
code owner, and the point of the whole loop is that they can defend the diff afterwards.

## 10. PR preparation

Only after the gate: use `prepare-pr`. It assembles the body from evidence already gathered and
hands off to `/push` for the commits. Do not claim human review happened if it did not.

## 11. Once it is merged, rebuild what is installed

**The engineer runs the installed app, not the branch.** A merged fix they cannot see is not a fix,
and the next bug they report will be against the stale build — which is how an afternoon gets spent
reproducing something that is already repaired.

After the merge lands, rebuild the artifacts the change actually touches:

| Changed | Rebuild |
| --- | --- |
| a Go service | `npm run build:services` (root) — Electron launches the binaries from `bin/` |
| `client/` only, for dev | `cd client && npm run build` |
| anything the engineer runs as the installed desktop app | `npm run build` (root), then run `dist/Noteblock Setup <version>.exe` |

Then confirm it: launch it, check the app and both sidecars are up, and say which build is now
installed. A silent reinstall is indistinguishable from having done nothing.

**Check what the installed build actually was before you replace it.** The engineer may be running a
branch build of unmerged work — a feature they are living with while it waits for review. Installing
main over it removes that feature with no warning, and the first they learn of it is when something
they were using yesterday is gone. If the build being replaced contains anything not in main, say so
and let them choose: merge it first, install a build with both, or keep the branch build for now.

Installing replaces the app but keeps `%APPDATA%/Noteblock`, so notes survive; back the database up
first anyway when the change touches sync, storage or migrations, and tell the engineer where the
backup is.

If `electron-builder` fails with `EBUSY … copyfile … noteblock-server.exe`, it is a packaging config
fault rather than a locked file: two `extraResources` entries resolving to the same destination make
it copy one binary twice, concurrently. Deleting `dist/` appears to help and does not — it only
shifts the timing. Look for a duplicate destination before blaming Defender or hunting for a process.
