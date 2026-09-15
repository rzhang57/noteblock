---
name: develop-feature-incrementally
description: >
  Plan a whole feature, then build it one reviewable change at a time inside this session — design,
  decompose into an ordered change graph, then loop: implement a change, validate, independent
  review, human ownership gate, next change. The middle level of control. Use when starting a
  feature or epic that clearly spans several changes and you want it planned and executed in one
  sitting. For a single already-scoped increment use `implement-change` instead; for an entire
  feature in one unreviewed pass, `develop-feature`.
---

# Develop a feature incrementally

The repo facts you need — architecture invariants, commands, coding conventions, landmines — are in
`CLAUDE.md` and already loaded. Do not restate them here; apply them.

## The model

> **Plan globally, execute incrementally.** Plan at feature level, execute at change level, review
> at PR level.

The unit of work is **one coherent change that can reasonably become one PR, or one layer in a PR
stack** — not an entire product feature. A feature spans several changes, tickets and PRs, and that
is the normal shape, not a failure to be efficient.

Understanding the whole feature before writing the first line is good. Writing the whole feature
before anyone has looked at the foundation is not.

This skill is **sequential and single-workstream**. Genuinely independent workstreams belong in
their own worktree and their own session, planned once here and then handed off — do not try to run
them from inside this loop.

## Lifecycle

```
requested work
    → understand the larger outcome
    → assess scope and dependencies
    → one reviewable change?  ──no──→ decompose into changes + dependency order
    → order the work, and identify the PR stack
    → risk-classify THIS change
    → plan THIS change
    → implement → validate → independent review → fix → revalidate
    → code walkthrough → human ownership review → PR-ready
    → STOP. wait for the human. re-plan the graph. then the next change.
```

This is a playbook, not a state machine. Say which tier you picked and why.

Two things are not negotiable. **No PR opens until the human has reviewed and taken ownership**, and
**the loop halts after every single change** — one change, one PR, one review, then re-plan. The
loop is a sequence of stops, not a run of nodes with a checkpoint bolted on the end.

## 1. Understand the requested outcome

Read the actual requirement, and read the *feature* it belongs to even when you are only building
one slice of it. Find the ticket in Linear. Read the code that already does the nearest thing — this
repo has strong existing patterns and the right answer is usually "extend that one".

State the acceptance criteria in behavioural terms. If you cannot say what observably changes for a
user, you do not understand it yet.

## 2. Assess scope and dependencies

Before any code, decide which of these the ask is:

1. **one coherent reviewable change** — there is no feature to plan. Say so and switch to
   `implement-change`, which runs the same loop without this skill's planning apparatus.
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

## 4. Order the work

Ask one question about every dependency edge:

> **How expensive is it if the upstream decision changes?**

| Situation | Order |
| --- | --- |
| downstream depends on an unresolved model, schema or contract | settle upstream first |
| contract is agreed but unimplemented | downstream may prototype against a mock; do not commit heavily |
| contract is stable | either order; pick by what unblocks most |
| no dependency at all | either order, or a separate session entirely |

Repo-specific instances worth knowing:

- **Block content is opaque to Go**, so UI block work genuinely does not depend on backend work.
  That contract is stable by design. See `block-type-change`.
- **The IPC surface is the classic unstable contract.** The UI can prototype against
  `client/src/dev/mockBridge.ts` while the handler is still moving, but keep the commitment shallow
  until the method name and params are settled — a rename costs all six layers plus the mock.
- **Schema and GORM models are the expensive upstream.** Nothing downstream should run far ahead of
  an unsettled one; content already written cannot be migrated.

Nodes with no edge between them do not need to be done here at all. Name them in the graph, and say
plainly that they can be picked up in a separate worktree and session — that is cheaper than
interleaving them into this one.

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
  **This is a gate, not a suggestion.** Anything a user sees or clicks - a new component, a fix to
  an existing one, a layout or styling change - is not validated until a Playwright run has driven
  it in a real browser and printed measured values. Re-run that script against the pre-fix code and
  name the checks that flip; a UI fix nothing catches is one nothing will notice losing. If the
  browser could not be driven at all, say so in the gate under Validation rather than letting the
  unit tests imply coverage.

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
4. **Where it sits in the graph** — what this node depended on, and what it unblocks next.
5. **Validation.** The real commands and their real output — numbers, not adjectives. Say plainly
   what you could not verify and why, rather than letting silence imply coverage.
6. **What to know before you own it.** The invariants this now rests on, the riskiest lines, and
   anything deliberately deferred.
7. **Questions you should be able to answer** — the walkthrough's, verbatim.
8. **Findings, last.** What review caught, what you fixed, what you rejected and why. A few lines.
   Summarise; do not reproduce each reviewer's report.

The first three are the ones that get squeezed when the message runs long, and the ones the engineer
cannot reconstruct from anywhere else. If you are cutting, cut findings, never flow.

Then **stop and wait**. Green tests and satisfied agents are not authorization. The engineer is the
code owner, and the point of the whole loop is that they can defend the diff afterwards.

## 13. PR-ready, then stop, then re-plan

After the gate, use `prepare-pr`; it assembles the body from evidence already gathered and hands off
to `/push`. Base a stacked layer's PR on the layer below it. Never claim human review happened if it
did not.

**Then stop. One change, one PR, one human review — every time.** Do not start the next node while
this one is still in review. The whole point of planning the graph up front was to make each step
small enough to be reviewed on its own; running ahead spends that advantage and puts the next change
on a foundation nobody has signed off.

## 14. Once it is merged, rebuild what is installed

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

When the engineer comes back, **re-plan before continuing**:

- what did review change about this node — the model, the contract, an assumption downstream nodes
  were built around?
- does the rest of the graph still hold? Edges appear and disappear once real code exists.
- is the next node still the right next node?

Then re-enter at step 4 with the updated graph. The graph is a working hypothesis, not a commitment;
revising it after each step is the process working, not the plan having failed.

## Examples

**The ask was not a feature after all.** "Sidebar folders should sort case-insensitively." Scope
assessment: one reviewable change, one purpose, no dependencies — there is no graph to draw. Say so
and run `implement-change` instead; it is the same loop without the planning apparatus this one
carries.

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

**A feature with work that does not belong here.** "Ship offline image annotations end to end."
Planning turns up three groups: the local service (upload and storage), the UI (the annotator), and
the cloud service (blob upload). Block content is opaque to Go and the IPC surface is already
settled, so the UI group shares no edge with the other two. Say so, name it in the graph, and leave
it for its own worktree and session rather than interleaving it — then work the local-service chain
here, one change at a time.
