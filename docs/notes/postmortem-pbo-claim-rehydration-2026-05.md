# Postmortem — PBO claim rehydration race (existing-user reload regression)

- **Date filed:** 2026-05-17
- **Status:** Bugfix shipped on
  `KodBena/fix/pbo-claim-regression-from-pr250`; user-confirmed
  resolved on 2026-05-17.
- **Audience:** Author + LLM collaborators. Focus is the
  imperative-vs-reactive binding pattern surfaced by the regression,
  and how to recognise it elsewhere.
- **Scope:** PR #250 (`KodBena/feat/card-forest-navigation-
  persistence`) caused existing users with an active PBO experiment
  to see PBO-controlled parameters as editable in the slider widgets
  on SPA reload, with the toolbar Applied / A / B switching having no
  visible effect. PaletteEditor continued to report the parameters as
  "controlled by PBO" — the user's persisted intent — but the
  substrate's claim map was empty. The user-side workaround was to
  toggle `qeubo_controlled` off and back on in PaletteEditor; that
  routes through `startNewExperiment` → `acquireExperimentClaims` and
  re-establishes the claim explicitly. Fresh users were unaffected.

---

## TL;DR

The substrate's claim map (`lib/knobs.ts`'s module-scope `claims`
Map) is in-memory and wiped on every page reload. The only persistent
source of truth on the frontend for "which parameters does PBO
control?" is `parameter_meta.<name>.qeubo_controlled` — persisted
through SyncService alongside the rest of the profile.

The binding from persistent truth (`parameter_meta`) to ephemeral
substrate (`claims` Map) was **one-shot imperative**: `useQeubo`'s
`bootstrap()` called `rehydrateExperimentClaims()` exactly once, in
the auth-state-watcher callback that fires on each authenticated
transition. `bootstrap()` itself awaits `/qeubo/experiment/status`
(a small, fast HTTP probe) and then synchronously calls rehydrate,
which reads `parameter_meta` from the store.

Concurrently, `SyncService.hydrate()` runs its own `/documents/{key}`
GET, fetching the user's full persisted blob. For an existing user
with a populated workspace, this is meaningfully larger than the
status probe and consistently returns later. By the time hydrate
completes and replaces `store.profile` with the persisted data,
rehydrate has already run — against the default (empty)
`parameter_meta` it saw — and claimed nothing. Nothing re-fires
rehydrate; the substrate's claim map stays empty for the rest of the
session. The widget reads `currentClaim(...) === null` and renders
the slider editable; the Applied / A / B toggle has no claim-backed
target to drive.

Fresh users escape the race because their PBO setup goes through
the user-driven `startNewExperiment` path, which explicitly calls
`acquireExperimentClaims` post-hydrate.

The race had been latent. PR #250 added one migration step (a
`structuredClone(blob)` followed by a few property checks on the
`session.ui` slice) to the hydrate chain. The marginal cost was
enough — over a non-trivial existing-user blob — to tip the
deterministic-in-practice ordering reliably toward "status wins,
rehydrate runs blind." Pre-PR-#250 users had been winning the race
by enough margin that the latent failure didn't surface in normal
use; post-PR-#250 the margin flipped.

The corrective: make the binding **reactive**. The existing
`parameter_meta` deep-watcher in `useAppBootstrap` (Phase-6
reconcile) now also calls `rehydrateExperimentClaims()` on every
fire. When hydrate completes and replaces `store.profile`, the
watcher's source re-evaluates and refires, and rehydrate runs against
the populated `parameter_meta`. `rehydrate` gains an early-return
guard on `_statusRef.value === null` so it doesn't claim spuriously
when no experiment exists.

---

## 1. The chain of authorship

| Step | Artifact | What happened |
|---|---|---|
| 1 | `useQeubo.ts` (knob-registry Phase 5, 2026-05-14 vicinity) | Introduces module-scope `_claimedKnobIds`, `bootstrap()`, `rehydrateExperimentClaims()`. Wires rehydrate from inside bootstrap. Bootstrap is itself wired from `useAppBootstrap`'s auth-state watcher (fires on each `authenticated` flip-in). |
| 2 | `useAppBootstrap.ts` (knob-registry Phase 6) | Adds the `parameter_meta` deep-watcher that calls `reconcileQeuboKnobs()` whenever the user authors a range or toggles `qeubo_controlled` via PaletteEditor. `immediate: true` so the registry catches up on mount; `deep: true` so per-entry edits fire. The watcher does NOT call rehydrate. |
| 3 | `SyncService.ts` (pre-existing) | `hydrate()` fetches `/documents/{key}` and applies the result via `updateFromRemote(migrated)`, which does `store.profile = deepMerge(store.profile, migrated.profile)`. Replaces the store; reactive consumers re-react. |
| 4 | PR #250 (this session, 2026-05-17) | Adds migration 44 → 45 backfilling `session.ui.cardTreeNav = {}`. The migration is structurally trivial (one `structuredClone(blob)` + a property check + a property set) but materially adds to the hydrate chain's cold-start cost on a non-trivial blob. |
| 5 | First post-PR-#250 SPA reload as an existing user | `bootstrap()`'s `/qeubo/status` returns before `SyncService.hydrate()`'s `/documents/{key}`. Rehydrate runs against the default empty `parameter_meta`. Claims nothing. Hydrate completes later, replaces `store.profile`. Nothing refires rehydrate. The claim map stays empty for the session. |
| 6 | User-observed symptom | Slider for the PBO-controlled parameter renders editable. PaletteEditor (reading `parameter_meta.qeubo_controlled` — the persisted intent) still shows "controlled by PBO". The two UIs disagree on whether the claim is held. Toolbar Applied / A / B does nothing visible because the analysis-restart depends on effective values flowing through claimed knobs. |
| 7 | Workaround | User toggles `qeubo_controlled` off in PaletteEditor → handler calls `qeubo.abortExperiment()` (controlled-list is empty); toggles back on → handler calls `qeubo.startNewExperiment([param])` → `acquireExperimentClaims` claims the knob synchronously. Slider locks; A / B drives effective values. |

---

## 2. Root cause

The persistent → ephemeral binding for "PBO holds claim on X" was
**imperative and one-shot**, not reactive. The single fire path was
`bootstrap() → rehydrateExperimentClaims()`, which reads
`parameter_meta` exactly once, in a context where the store may not
yet hold the post-hydrate values.

Two HTTP fetches kick off concurrently on every authenticated
auth-state flip: `/qeubo/experiment/status` (small, fast) and
`/documents/{key}` (larger, slower for existing users). The
deterministic-in-practice ordering is "status wins" — but the code
treated the post-status moment as the canonical "now rehydrate"
trigger, regardless of whether the post-hydrate truth was available
yet. The persistent → ephemeral binding had no mechanism to refire
when the persistent side became available later.

The race was latent: pre-PR-#250 users had been winning by enough
margin that the failure didn't surface in normal use. PR #250's
migration added one `structuredClone(blob)` to the hydrate chain;
on a non-trivial existing-user blob, that's enough to flip the
margin. The bug became deterministic on the post-PR-#250 hydrate
path for existing users with active experiments.

---

## 3. Contributing factors

### 3.1 The substrate's ephemeral state isn't documented as
needing rebinding-from-SSOT on reload

`lib/knobs.ts` is structured cleanly: the `claims` Map is module-
scope, in-memory, with no persistence concerns documented at the
substrate boundary. The substrate is *correct* — the claim map
isn't supposed to persist; PBO consumer state lives elsewhere. But
the responsibility for **rebinding the substrate to its persistent
truth on reload** wasn't given an architectural home. It ended up
landed in `useQeubo.bootstrap()` as a one-shot call, which is
exactly where a race against another async cold-start path can hide
in the timing margin.

The same shape applies to other module-scope ephemeral state in the
codebase — the analysis ledger, the thumbnail caches, the per-board
card-tree state. Each of these has its own rebinding contract;
whether any of them have the same latent-race shape is worth a
focused audit (§7.3).

### 3.2 PR #250's migration was the trigger but not the bug

Adding migration 44 → 45 to the hydrate chain wasn't a design
defect. Migrations are append-only by contract; one more
`structuredClone(blob)` is what happens whenever the schema bumps.
The bug here was the latent race that had been winning by chance;
PR #250's marginal cost was enough to make it start losing
reliably.

The right response is **not** to revert PR #250 or to optimise the
migration chain. The right response is to close the race at its
source — make the binding reactive — so the schema chain can grow
freely without each addition risking a hidden regression.

### 3.3 Detection cost was non-trivial

The user's first hands-on test of the PBO feature post-PR-#250
surfaced the symptom — but the symptom itself ("alpha not locked,
A/B doesn't move it") looked at first like a defect in PR #251's
PBO popover refactor, which had landed in the same session.
Several minutes of debugging the popover were spent before the
sharper "let's check 273baa3 to rule out the previous commit"
sweep isolated the regression to PR #250. The PaletteEditor's
"already claimed by PBO" display was a load-bearing clue once
noticed — the substrate vs persisted-intent disagreement names
the bug class directly — but it took the user surfacing it
explicitly to focus the investigation.

### 3.4 The author's first diagnosis was wrong

The implementer's (Claude's) initial hypothesis was that PR #251's
`useHoverPopover` composable extraction had broken something via
destructured-Ref auto-unwrap edge cases. That diagnosis was
plausible enough on its face (the diff stat showed two stable
chrome components touched) but had no concrete mechanism. The user
correctly pushed back ("we should check 273baa3 first"), which
isolated PR #250 as the cause. The lesson is on
ADR-0002-applied-to-diagnosis: when the symptom doesn't have a
clear mechanism in the suspected change, broaden the suspect set
rather than constructing speculative mechanisms inside the first
suspect. The user-surfaced bisect was strictly better than the
implementer's pattern-matching against the most recently-touched
files.

---

## 4. Why this matters beyond the observed case — the substitution test

The actual surface here is a moderately-used optional feature
(PBO calibration); the user-visible cost is bounded (slider
editable when it should be locked; user re-toggles to fix). But
the failure *shape* — **persistent-truth → ephemeral-substrate
binding fires before persistent truth is available, then doesn't
refire when it is** — generalises uncomfortably.

**The substitution test.** Imagine the same failure shape applied
to:

- **Per-board review-session state.** If the review session's
  current-card cursor lives in module-scope ephemera and its
  re-bind from `store.session.reviews[boardId]` were one-shot at
  bootstrap, an existing user reloading mid-session might find the
  cursor reset to a different card than the one they were
  reviewing. Silent data wrongness rather than silent claim
  wrongness.

- **The analysis ledger's per-board state.** If the ledger's
  rebind from persisted analysis-bundle summaries had this shape,
  an existing user reloading might see analysis suggestions that
  don't match the persisted board's state — the engine running
  against one config, the UI rendering against another.

- **Authentication identity binding.** If a downstream service's
  identity-aware bookkeeping had this shape, an existing user
  reloading might find the service operating against the prior
  identity briefly before catching up. The privacy class of bug.

Each is the same shape: a substrate that derives runtime state
from persistent truth, with the rebinding scheduled at a moment
when the persistent truth may not yet be available. The only
operational difference between this incident and the worst case
on the list is what's bound and what's at stake; the discipline
that catches one must catch them all.

ADR-0002 (fail loudly) applies here at the binding-lifecycle
layer: a binding that's expected to be transparent ("the
substrate's view always matches the persisted intent") but
silently drifts when the timing margin shifts is the silent-
failure shape the tenet forbids. The corrective discipline (§7) is
about making "transparent" mean **automatically maintained by
reactive subscription**, not "imperatively called at the right
times by hand".

---

## 5. Detection cost

First hands-on exercise of the PBO feature in the post-PR-#250
session. Wall-clock detection: minutes. Elapsed-commits: the
regression was active for the duration of PR #250's merged life
on `main` (one commit — PR #251 noted the limitation but didn't
fix it; this PR retires the note).

The detection mechanism is worth recording: the user's PaletteEditor
"claimed by PBO" display vs the substrate's empty claim map
gave a clean two-source-of-truth disagreement that pointed at the
binding's hydration timing. Without that UI surface, the bug
would have read as a generic "PBO doesn't work post-reload" and
the diagnosis would have been considerably longer.

The implementer's first wrong diagnosis (suspecting PR #251) cost
maybe 10 minutes of investigation before the user-driven bisect
landed the right suspect. The pattern (LLM defaults to suspecting
the most recently-touched code; user-driven bisect outperforms)
generalises and is worth carrying into future debugging arcs.

---

## 6. Remediation

Two-file diff on `KodBena/fix/pbo-claim-regression-from-pr250`:

1. **`src/composables/useQeubo.ts`** — `rehydrateExperimentClaims`
   gains the guard `if (_statusRef.value === null) return;` (covers
   both pre-bootstrap and post-bootstrap-no-experiment states).
   Function is exported at module-level alongside the existing
   `reconcileQeuboKnobs`. Docstring records both call sites and
   the race the watcher closes.

2. **`src/composables/auth-app/useAppBootstrap.ts`** — the existing
   `parameter_meta` deep-watcher's callback now invokes
   `rehydrateExperimentClaims()` after `reconcileQeuboKnobs()`.
   When hydrate completes and replaces `store.profile`, the source
   re-evaluates (new object identity) and the callback fires;
   rehydrate runs against the populated `parameter_meta`.
   Idempotent across repeated calls (`_claimedKnobIds.has` short-
   circuits; `claimKnob` no-ops same-consumer re-claims).

Worklog companion: `docs/worklog/2026-05-17-pbo-claim-rehydration-
fix.md`. PR #250's code is not modified — the regression's
mechanism was a latent race in the binding-lifecycle layer, not a
defect in Item 1's code.

---

## 7. Lessons + recommendations

### 7.1 Module-scope ephemeral state that derives from persisted SSOT needs reactive rebinding

When module-scope state (a Map, a Set, a singleton ref) is expected
to mirror a slice of the persisted store, the binding from store →
module-scope state should be a **reactive subscription**, not an
imperative call placed at the apparent "right time." Reactive
subscriptions auto-handle the timing of every input change,
including the post-hydrate store replacement that's the silent
killer of one-shot bootstrap calls.

Operationally: when authoring a "rebind on reload" path, the
default is `watch(() => persistedSource, () => rebind(), { immediate: true, deep: true })`,
not `someAsyncBootstrap()` that reads `persistedSource` once. The
imperative shape is only correct when the rebind can never be
sensitive to a post-call mutation of the source — which for
SyncService-hydrated state is essentially never.

### 7.2 The PaletteEditor / KnobSlider disagreement was the load-bearing diagnostic clue

Two UI surfaces showing different views of the same logical state
("controlled by PBO" in PaletteEditor, "editable" in the
slider widget) was the clean signal that the substrate's view had
drifted from the persisted intent. Without that disagreement, the
bug would have read as "PBO is generically broken" — the
diagnostic surface would be small.

The codebase should preserve and encourage these
intentionally-redundant displays. They're not duplication for its
own sake; they're a diagnostic surface that catches binding-layer
bugs by making them visible as UI disagreements.

### 7.3 Audit other module-scope ephemeral state with persisted SSOT

Candidates (non-exhaustive):

- **`analysisService`'s per-board maps** (`activeQueryIds`,
  `activeSubscriptions`, `activeQueries`, `restartCallbacks`) —
  rebound from board state on each interaction; check whether
  rebind is reactive or one-shot.
- **`analysisLedger`'s per-node cache** — rebound from
  analysis-bundle summaries on hydrate; check the binding path
  through `analysisPersistenceService.restore`.
- **`board-card-trees.ts`'s per-board state** — explicitly
  documented as not-persisted; the persistent counterpart
  (`session.ui.cardTreeNav`, schema-version 45) only carries the
  manual-expand axis. The other axes (forest, activeSet) regenerate
  from backend fetches; the binding is reactive-by-design (each
  fetch repopulates the slot). Probably safe but worth a one-pass
  audit.
- **`useQueryTelemetry`'s singleton in-flight Map** — rebuilt from
  live KataGo socket activity; not persisted truth, but the rebind
  contract on reconnect could have the same shape.

A targeted audit pass — "module-scope state whose values should
match a persisted slice" — is worth its own arc. Each instance
should either confirm the binding is reactive, or convert it.

### 7.4 LLM diagnostic discipline — broaden the suspect set when the mechanism is speculative

The implementer's first hypothesis (PR #251's composable extraction)
had no concrete mechanism — just "I touched things recently and
something broke." The user's "let's bisect first" was strictly
better. The rule for future arcs:

- **When the suspected change has no concrete mechanism for the
  observed symptom, suspect-set expansion takes priority over
  mechanism-construction in the first suspect.** Bisect before
  speculating.

This is the LLM-collaboration register of ADR-0002 applied to
debugging: a speculative mechanism inside the wrong suspect is the
silent-failure shape ("we have a theory!") that delays the real
diagnosis. Making the gap audible — "I don't see a mechanism in
PR #251 for this; let's bisect" — is the loud-failure move.

### 7.5 Schema migrations are append-only and unbounded in cost — closing latent races at their source is mandatory

The migration chain will keep growing. Each addition compounds the
hydrate cold-start cost (an extra `structuredClone(blob)` per
step). Every other system that races against hydrate cold-start
will eventually start losing that race, the way this one did.

The discipline that follows: **don't rely on hydrate-vs-other-
async winning a specific ordering.** Any system that needs
post-hydrate state to operate correctly should be reactive against
the post-hydrate store, not opportunistic about catching it at the
right moment.

This isn't about optimising the migration chain (a fool's errand —
each migration is a contract with persisted-data shape and can't
be condensed). It's about making downstream consumers robust to
the chain's growth.

---

## 8. References

- `docs/worklog/2026-05-17-pbo-claim-rehydration-fix.md` — the
  companion worklog for the corrective.
- PR #250 (merge commit `eb02c50`) — the migration whose timing
  tipped the race margin. Code unchanged by this corrective.
- PR #251 (merge commit `b74b308`) — the "Known limitation"
  section flagged this regression; this PR retires that limitation.
- `src/lib/knobs.ts` — the substrate; the `claims` module-scope
  Map is the ephemeral state being rebound here.
- `src/composables/useQeubo.ts` — the consumer; `bootstrap()` and
  `rehydrateExperimentClaims()` are the binding-lifecycle
  surfaces.
- `src/composables/auth-app/useAppBootstrap.ts` — the orchestrator;
  hosts the watcher the corrective extends.
- `frontend/CLAUDE.md`'s "Resource ownership at mutation sites"
  section — companion discipline for module-scope state lifecycle;
  this postmortem extends it from "release at the right moment"
  to "rebind reactively from persistent truth."
- ADR-0002 (fail loudly) — applied at the binding-lifecycle layer:
  silent drift between substrate and persisted intent is the
  failure shape this corrective forbids structurally.
- `docs/notes/postmortem-knob-toolbar-popover-2026-05.md` and
  `docs/notes/postmortem-knob-registry-qeubo-domain-2026-05.md` —
  sibling postmortems from the same knob-registry arc; share the
  pattern of "the closest-match imperative shape silently
  misbinds." This one extends to closest-match-async-timing.

---

## 9. License

Public Domain (The Unlicense).
