---
name: implement-change
description: >
  The default playbook for building anything in this repo. Operates on ONE coherent reviewable
  change — not a whole feature. Understands the larger outcome first, assesses scope and
  dependencies, decomposes when the ask is broader than one change, picks a sequential / stacked /
  parallel execution strategy, then risk-classifies and drives that single change through implement
  → validate → independent review → fix → walkthrough → human ownership → PR-ready.
  Use for any non-throwaway work: a feature, a bug fix, a refactor, a ticket, "implement X",
  "build Y", or a named Linear issue.
---

# Implement a change

The repo facts you need — architecture invariants, commands, coding conventions, landmines — are in
`CLAUDE.md` and already loaded. Do not restate them here; apply them.

## The model

> **Plan at feature level. Execute at change/ticket level. Review at PR level. Parallelize at
> independent-workstream level.**

> **Plan globally, execute incrementally. Parallelize independent work; serialize unresolved
> dependencies.**

The unit of work is **one coherent change that can reasonably become one PR, or one layer in a PR
stack** — not an entire product feature. A feature spans several changes, tickets, worktrees and
PRs, and that is the normal shape, not a failure to be efficient.

Understanding the whole feature before writing the first line is good. Writing the whole feature
before anyone has looked at the foundation is not.

## Lifecycle

```
requested work
    → understand the larger outcome
    → assess scope and dependencies
    → one reviewable change?  ──no──→ decompose into changes + dependency order
    → choose execution strategy (sequential / stacked / parallel)
    → risk-classify THIS change
    → plan THIS change
    → implement → validate → independent review → fix → revalidate
    → code walkthrough → human ownership review → PR-ready
    → return to the graph for the next change
```

This is a playbook, not a state machine. Say which tier you picked and why. The one thing that is
not negotiable: **no PR opens until the human has reviewed and taken ownership.**

## 1. Understand the requested outcome

Read the actual requirement, and read the *feature* it belongs to even when you are only building
one slice of it. Find the ticket in Linear. Read the code that already does the nearest thing — this
repo has strong existing patterns and the right answer is usually "extend that one".

State the acceptance criteria in behavioural terms. If you cannot say what observably changes for a
user, you do not understand it yet.

## 2. Assess scope and dependencies

Before any code, decide which of these the ask is:

1. **one coherent reviewable change** — proceed to step 5
2. **several independent changes** — no ordering constraint between them
3. **several dependent changes** — an ordering constraint exists; this is a stack

**Keep this cheap when the answer is obvious.** A copy fix, a padding tweak, a one-line guard: the
assessment is one sentence, or a thought you do not even write down. Do not turn a five-minute fix
into a decomposition exercise — that is how a process gets ignored.

### What makes a good reviewable change

- one primary purpose, stateable in a sentence
- independently explainable
- independently testable or validatable, where practical
- no unrelated refactoring riding along
- leaves the repository in a valid state — it builds, tests pass, the app runs
- produces a diff a human can realistically hold in their head

**Do not split by line count.** Ten artificial chunks are harder to review than one coherent change,
because the reviewer has to reassemble the intent. Split on **purpose and dependency**, and stop
splitting when the pieces stop being independently explainable.

## 3. Decompose when it is broader than one change

Propose the change graph before implementing anything. Natural boundaries, roughly in dependency
order:

| Boundary | In this repo |
| --- | --- |
| foundational refactor | extracting a service, splitting a mixed-responsibility file |
| contract / interface | GORM models, the IPC method surface, `Note.ts` types, `electron-api.d.ts` |
| data model / schema | `internal/model`, and its migration |
| persistence behaviour | `internal/db`, `internal/service` |
| backend / service behaviour | sidecar services, cloud handlers |
| IPC / API plumbing | the six layers — see `ipc-change` |
| frontend / UI behaviour | components, client services |
| migration / backfill | existing rows, and existing block content that cannot be migrated |
| observability | stderr logging (never stdout in the sidecar) |
| cleanup | removing the old path once the new one is proven |

**Separate mechanical refactors from behavioural changes** whenever practical. A rename mixed into a
logic change makes the logic change unreviewable — the reviewer cannot see the five real lines
inside three hundred mechanical ones.

Every chunk must leave the repo valid. A change that does not compile until the next one lands is
not a reviewable change; fold it into its neighbour.

Write the graph down — nodes, edges, and a one-line purpose each — and put it in the Linear ticket
or its sub-issues when the feature warrants it. Then build the first node.

## 4. Choose an execution strategy

Ask one question about every dependency edge:

> **How expensive is it if the upstream decision changes?**

| Situation | Strategy |
| --- | --- |
| downstream depends on an unresolved model, schema or contract | **serialize** — settle upstream first |
| contract is agreed but unimplemented | downstream may prototype against a mock; do not commit heavily |
| contract is stable | **parallelize** — independent workstreams proceed at once |
| no dependency at all | **parallelize** |

Repo-specific instances worth knowing:

- **Block content is opaque to Go**, so UI block work genuinely does not depend on backend work.
  That contract is stable by design — parallelize freely. See `block-type-change`.
- **The IPC surface is the classic unstable contract.** The UI can prototype against
  `client/src/dev/mockBridge.ts` while the handler is still moving, but keep the commitment shallow
  until the method name and params are settled — a rename costs all six layers plus the mock.
- **Schema and GORM models are the expensive upstream.** Nothing downstream should run far ahead of
  an unsettled one; content already written cannot be migrated.

### Parallel workstreams

When workstreams are genuinely independent, run them in parallel — separate worktrees, separate
branches, separate PRs to `main`:

```
Feature / Epic
    |
dependency planning
    |
    +-- local service    A1 → A2
    +-- cloud service    B1 → B2
    +-- UI               C1 → C2
    +-- test / infra     D1
```

Use `EnterWorktree` (or a peer session) per workstream so they cannot collide. **Inside** each
workstream the chain stays sequential: A1 validated and reviewed before A2 starts.

Do not have one agent generate an entire chain of dependent work before the upstream architecture
has been accepted. That is the failure this whole model exists to prevent.

### Stacked PRs

When the changes are dependent, plan the stack early:

```
PR1: model / contract
 ↓
PR2: persistence / service behaviour
 ↓
PR3: IPC exposure
 ↓
PR4: UI integration
```

**Planning the whole stack up front is encouraged. Implementing the whole stack unattended is not.**

The gate is not "PR1 is merged" — nobody should wait on a teammate's merge queue to start PR2. The
gate is **"PR1 has been validated, reviewed and understood well enough that building on it is a
reasonable bet."** Once the foundation is sound, keep going down the stack.

## 5. Risk-classify THIS change

Tiers are **per change, never per feature**. One feature routinely contains all three:

```
Change A — schema migration     HIGH-RISK
Change B — service behaviour    STANDARD
Change C — UI behaviour         STANDARD
Change D — copy polish          TRIVIAL
```

Classify on **blast radius and difficulty of proving correctness**, not lines of code. A three-line
migration change is HIGH-RISK; a 400-line new component is usually STANDARD. Weigh state changes,
persistence, trust boundaries, external contracts, concurrency, reversibility, subsystem
familiarity.

**When torn, take the higher tier.** Re-classify upward mid-implementation the moment the real scope
turns out riskier — that is expected, not a failure.

### TRIVIAL
Localized, obvious behaviour, no state-model change, no contract change, no security or concurrency
implication, deterministic to validate.

> understand → implement → targeted validation → human review

No review agents, no decomposition artifact. Spawning them here is ceremony, and ceremony trains the
human to skim.

### STANDARD
Real logic, contained blast radius. New UI behaviour, business logic, a handler following an
established pattern, a feature-scoped refactor.

> plan → implement → validate → **correctness-reviewer** + **test-reviewer** → fix → revalidate
> → **code-walkthrough** → human ownership review → PR prep

### HIGH-RISK
Auth, secrets, trust boundaries, untrusted input, public contract compatibility, schema or
migrations, destructive data operations, distributed state, retries and idempotency, concurrency,
cache consistency, hot-path performance, infrastructure, or an unfamiliar subsystem with wide reach.

In this repo: the sync engine or cloud service, GORM models and migrations, the IPC dispatcher's
sequential loop, the preload boundary, the `noteblock-image://` handler, `getDataPath()`.

> detailed plan → **human approval when real design choices exist** → implement → comprehensive
> validation → **correctness-reviewer** + **test-reviewer** + **architecture-reviewer**
> (+ **security-reviewer** when a trust boundary is in scope) → fix → revalidate → rerun affected
> reviewers → **code-walkthrough** → human ownership review → PR prep

Do not promote every interesting change to HIGH-RISK. Review effort must stay proportional or it
stops being read.

## 6. Plan this change

Scale to the tier, and scope to **this change only** — the rest of the graph is already planned.

- **TRIVIAL** — a sentence. Then go.
- **STANDARD** — what behaviour changes, which areas it touches, the approach, how you will validate.
- **HIGH-RISK** — additionally: invariants in play, state and data changes, contract changes, the
  specific risks, testing strategy, migration and rollback. Pause for human approval when there is a
  material design choice, not merely to check in.

## 7. Implement

Delegate the repo's sharp procedures rather than re-deriving them:

| When the change… | Use |
| --- | --- |
| adds or changes an IPC method, or any part of the protocol surface | `ipc-change` |
| adds a block type or materially changes a block's content model | `block-type-change` |

Do not inline those checklists — read the skill.

Stay inside the change you scoped. When you notice an unrelated improvement, write it down as a
follow-up node in the graph; do not smuggle it into this diff. If you find yourself fighting an
invariant in `CLAUDE.md`, stop — that is a design signal, not an obstacle.

## 8. Validate

Evidence, not intent. Run the real commands for every area touched and keep the output; it becomes
the PR's Verification section.

- Changed Go? `go test ./...` in that service. Touched cloud persistence? `make itest`.
- Changed the client? `npm test`, `npm run build` (type-check), `npm run lint` (no new violations).
- Exercising the sidecar through the app? Rebuild the binary first — stale means testing code that
  is no longer on disk.
- Changed UI behaviour or layout? Use `verify-ui-change`. Unit tests do not close this out.

If a test cannot fail when the implementation is wrong, it is not validation. For a bug fix, prove a
new test fails against the old behaviour.

## 9. Independent review

Spawn reviewers with the **Agent** tool, in a single message so they run concurrently.

Give each: the task and acceptance criteria, how to obtain the diff, and anything genuinely external
they cannot discover. **Do not give them your reasoning, your self-assessment, or the other
reviewers' findings.** The value is independent reconstruction; your account of what you built
poisons it.

| Agent | Fires when |
| --- | --- |
| `correctness-reviewer` | STANDARD and above |
| `test-reviewer` | STANDARD and above |
| `architecture-reviewer` | HIGH-RISK, or when the change adds a new pattern, layer or abstraction |
| `security-reviewer` | a trust boundary is in scope — auth, secrets, untrusted input, IPC surface, filesystem paths, network exposure, destructive operations |

Reviewers are advisory and read-only. **You own every edit.** Never let an agent patch the branch.

## 10. Fix loop

1. Consolidate and deduplicate findings.
2. Judge each on its merits. A confident agent is not a correct agent — reproduce the claimed
   failure, or explain concretely why it cannot happen.
3. Fix what is credible. Record what you rejected and why; that goes to the human.
4. Re-run the validation the fix touches.
5. Re-run a reviewer only when the fix was substantial enough to change its conclusions.

**No majority voting.** One credible high-impact finding outranks three clean reports.

## 11. Code walkthrough

Run `code-walkthrough` once the change is final. It reconstructs the implementation independently
and produces a reading guide — behaviour before and after, control and data flow, design choices,
the riskiest lines, which tests prove what, and questions the owner should be able to answer.

Give it the task and the diff. **Not** the reviewers' findings. It is not an approval step; it
exists so the human can take ownership efficiently.

## 12. Human ownership gate

Present briefly, in this order:

1. what changed and why, in behavioural terms
2. where this change sits in the feature graph, and what it unblocks
3. the validation evidence — real numbers and command output
4. review findings: what was fixed, what was rejected and why
5. the walkthrough's reading order and its questions
6. anything you are still unsure about

Then **stop and wait**. Green tests and satisfied agents are not authorization. The human is the
code owner, and the point of the whole loop is that they can defend the diff afterwards.

## 13. PR-ready, then back to the graph

After the gate, use `prepare-pr`; it assembles the body from evidence already gathered and hands off
to `/push`. Never claim human review happened if it did not.

Then return to step 4 with the next node. Report what is now unblocked, and whether anything you
learned building this change should change the rest of the graph — it often should.

## Examples

**A single contained change.** "Sidebar folders should sort case-insensitively." Scope assessment:
one reviewable change, one purpose, no dependencies. STANDARD. Implement, `npm test` plus
`verify-ui-change` with the before/after ordering measured, `correctness-reviewer` +
`test-reviewer`, walkthrough, human gate, PR-ready. The scope step cost one sentence.

**A large dependent feature.** "Add note tagging." Not one change. Graph:

```
A  tag model + migration            HIGH-RISK
B  tag persistence in the service   STANDARD     (A)
C  tag.* IPC methods                STANDARD     (B)
D  tag UI in the sidebar            STANDARD     (C)
E  filter notes by tag              STANDARD     (B, D)
```

Plan all five, implement **A only**. It is HIGH-RISK — schema, and a migration over existing rows —
so it gets a detailed plan, human approval on the storage shape before any code, the full reviewer
set including `architecture-reviewer`, and `make itest`. Only once A is validated, reviewed and
understood does B start; A does not need to be *merged* first. If review of A changes the model, it
changes it before B, C and D were built on top of it — which is the entire point.

**Parallel workstreams.** "Ship offline image annotations end to end," where the IPC contract and
the block content shape are already agreed. Three workstreams in three worktrees: the local service
(upload and storage), the UI (the annotator), the cloud service (blob upload). Block content is
opaque to Go and the IPC surface is settled, so they genuinely do not block each other. Each
workstream still executes one bounded change at a time with its own tier, its own reviewers and its
own PR — parallelism is across workstreams, never a licence to skip the loop inside one.
