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

Present, in this order and briefly:

1. what changed and why, in behavioural terms
2. the validation evidence — real numbers and command output
3. the review findings: what was fixed, what was rejected and why
4. the walkthrough's reading order and its questions
5. anything you are still unsure about — say so plainly

Then **stop and wait**. Green tests and satisfied agents are not authorization. The human is the
code owner, and the point of this whole loop is that they can defend the diff afterwards.

## 10. PR preparation

Only after the gate: use `prepare-pr`. It assembles the body from evidence already gathered and
hands off to `/push` for the commits. Do not claim human review happened if it did not.
