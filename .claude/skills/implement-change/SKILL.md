---
name: implement-change
description: >
  Build ONE increment that the engineer has already scoped — a ticket, a layer of a stack, a single
  bug fix. Loads the surrounding feature context, designs this step with the engineer before writing
  code, then risk-classifies, implements, validates, gets independent review, and hands over a diff
  they can own. Does not decompose features and does not decide what comes next.
  Use for any single piece of work: "implement NOT-42", "do the next layer", "fix X". For a feature
  that still needs planning and several changes, use `develop-feature-incrementally`.
---

# Implement this change

The repo facts you need — architecture invariants, commands, coding conventions, landmines — are in
`CLAUDE.md` and already loaded. Do not restate them here; apply them.

**The scope is already decided.** The engineer chose this piece of work; your job is to build it
well, not to renegotiate what it is. That is what makes this the highest-control mode — they own the
boundary, and you own the execution inside it.

What this skill is not:

- **Not a feature planner.** If the work turns out to be bigger than one reviewable change, say so
  and let the engineer decide how to split it. Do not draw a graph and start working through it.
- **Not a loop.** It ends at PR-ready with one change. You do not pick up the next node.
- **Not parallel.** One workstream, sequential. Independent work belongs in its own worktree and its
  own session.

## 1. Load the surrounding context

The change is small; the context that makes it *correct* usually is not. Before designing anything,
establish:

- **what this change is** — the ticket, the acceptance criteria, in behavioural terms
- **where it sits** — which feature it belongs to, what landed before it, what will be built on top
- **which contracts are already fixed** and which are still open. A decision made inside a settled
  contract is cheap; one that pins down an open contract is expensive and belongs in the design step
- **what came up in earlier increments** — prior review findings, decisions already made, things the
  engineer said they did not want

Read the Linear ticket and its parent. Read the code that already does the nearest thing — this repo
has strong existing patterns and the right answer is usually "extend that one". **Ask the engineer
for the rest.** A locally reasonable design that contradicts the shape of the feature is the main
failure mode this step exists to prevent, and they have context you cannot read off disk.

## 2. Confirm the boundary

One quick check, not a decomposition exercise. A good reviewable change has one primary purpose, is
independently explainable, leaves the repo in a valid state, and produces a diff a human can hold in
their head.

- **If it is clearly two changes**, say so, propose the split, and let the engineer choose. Do not
  silently expand the scope you were given.
- **If it is genuinely blocked** by something upstream that is not settled, say that now rather than
  guessing at the contract and building on it.
- **If you spot something unrelated worth fixing**, write it down as a follow-up. Do not smuggle it
  into this diff — a mechanical refactor riding along makes the real change unreviewable.

For obviously tiny work this step is a thought, not a paragraph.

## 3. Bounce it off the engineer, then agree a plan

This is the step that earns the skill. Maximum control means the engineer gets a say **before the
code exists**, not after. Do not treat it as a status update — it is the one point where a wrong
assumption is still cheap.

Cover four things, briefly, and let them correct you on each:

1. **Intent.** What this change is actually for, in behavioural terms — and what would count as
   having got it wrong. Confirm rather than infer.
2. **Context.** Where it sits in the feature, what it will be built on top of, what earlier
   increments already settled. State what you found; ask for what you could not.
3. **Architecture.** The real choices: where the logic lives and which layer owns it; the shape of
   anything persisted, since it outlives the process and block content cannot be migrated; the
   contract if one is touched — method names, params, types, what callers may rely on. Say what each
   choice rules out later, and what you are deliberately not doing.
4. **Implementation plan.** The files and layers you will touch, in order, and how you will validate
   it. Short enough to read in full.

Keep the whole thing to a few lines per point. This is a conversation, not a design doc.

Then **wait for agreement, and only then start the run.** Once they have agreed, execute steps 4–11
without re-litigating the plan — that is the deal: they front-loaded their control, so you carry it
through rather than drifting.

- **TRIVIAL work skips this entirely.** Obvious changes do not need a design discussion.
- **Where there is a genuine fork, agree before implementing.** Not to check in — to decide.
- **HIGH-RISK always pauses here**, with the risks and the migration/rollback story stated.

## 4. Risk-classify this change

The tier belongs to **this change**, not to the feature it is part of. A feature routinely contains
a HIGH-RISK migration, two STANDARD changes and a TRIVIAL polish; applying one process to all four
is how a process stops being read.

Classify on **blast radius and difficulty of proving correctness**, not lines of code. A three-line
migration change is HIGH-RISK; a 400-line new component is usually STANDARD. Weigh state changes,
persistence, trust boundaries, external contracts, concurrency, reversibility, familiarity.

**When torn, take the higher tier.** Re-classify upward mid-implementation the moment the real scope
turns out riskier — that is expected, not a failure.

### TRIVIAL
Localized, obvious behaviour, no state-model change, no contract change, no security or concurrency
implication, deterministic to validate.

> implement → targeted validation → human review

No review agents. Spawning them here is ceremony, and ceremony trains the human to skim.

### STANDARD
Real logic, contained blast radius. New UI behaviour, business logic, a handler following an
established pattern, a scoped refactor.

> implement → validate → **correctness-reviewer** + **test-reviewer** → fix → revalidate →
> **code-walkthrough** → human ownership review → PR-ready

### HIGH-RISK
Auth, secrets, trust boundaries, untrusted input, contract compatibility, schema or migrations,
destructive data operations, distributed state, idempotency, concurrency, cache consistency,
hot-path performance, infrastructure, or an unfamiliar subsystem with wide reach.

In this repo: the sync engine or cloud service, GORM models and migrations, the IPC dispatcher's
sequential loop, the preload boundary, the `noteblock-image://` handler, `getDataPath()`.

> design agreed in step 3 → implement → comprehensive validation → **correctness-reviewer** +
> **test-reviewer** + **architecture-reviewer** (+ **security-reviewer** when a trust boundary is in
> scope) → fix → revalidate → rerun affected reviewers → **code-walkthrough** → human ownership
> review → PR-ready

Do not promote every interesting change to HIGH-RISK. Review effort must stay proportional or it
stops being read.

## 5. Implement

Delegate the repo's sharp procedures rather than re-deriving them:

| When the change… | Use |
| --- | --- |
| adds or changes an IPC method, or any part of the protocol surface | `ipc-change` |
| adds a block type or materially changes a block's content model | `block-type-change` |

Do not inline those checklists — read the skill.

Build what was agreed in step 3. If implementation reveals the design was wrong, stop and say so
rather than quietly substituting a different one — the engineer agreed to the plan, so they need to
agree to the replacement. If you find yourself fighting an invariant in `CLAUDE.md`, that is a design
signal, not an obstacle.

## 6. Validate

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

## 7. Independent review

Spawn the tier's reviewers with the **Agent** tool, in a single message so they run concurrently.

Give each: the task and acceptance criteria, how to obtain the diff, and anything genuinely external
they cannot discover. **Do not give them your reasoning, your self-assessment, or the other
reviewers' findings.** The value is independent reconstruction; your account of what you built
poisons it.

Two reviewers fire outside their tier's default set. `architecture-reviewer` whenever the change
adds a new pattern, layer or abstraction, even at STANDARD. `security-reviewer` whenever a trust
boundary is in scope — auth, secrets, untrusted input, the IPC surface, filesystem paths, network
exposure, destructive operations.

Reviewers are advisory and read-only. **You own every edit.** Never let an agent patch the branch.

## 8. Fix loop

1. Consolidate and deduplicate findings.
2. Judge each on its merits. A confident agent is not a correct agent — reproduce the claimed
   failure, or explain concretely why it cannot happen.
3. Fix what is credible. Record what you rejected and why; that goes to the engineer.
4. Re-run the validation the fix touches.
5. Re-run a reviewer only when the fix was substantial enough to change its conclusions.

**No majority voting.** One credible high-impact finding outranks three clean reports.

A finding that implicates the *design* rather than the code goes back to the engineer, not into a
silent rewrite.

## 9. Code walkthrough

Run `code-walkthrough` once the change is final. It reconstructs the implementation independently
and produces a reading guide — behaviour before and after, control and data flow, design choices,
the riskiest lines, which tests prove what, and questions the owner should be able to answer.

Give it the task and the diff. **Not** the reviewers' findings. It is not an approval step; it
exists so the engineer can take ownership efficiently.

## 10. Human ownership gate

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

## 11. PR-ready

After the gate, use `prepare-pr`; it assembles the body from evidence already gathered and hands off
to `/push`. When this change is a layer of a stack, base the PR on the layer below it. Never claim
human review happened if it did not.

## 12. Once it is merged, rebuild what is installed

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

Then report what this change unblocks, and anything you learned that should affect the next one —
and **stop there**. Picking up the next piece of work is the engineer's call, not yours.
