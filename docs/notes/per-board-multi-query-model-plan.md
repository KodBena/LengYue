---
name: per-board-multi-query-model-plan
description: Plan note for lifting the one-active-analysis-per-board invariant in AnalysisService; range + ponder + replay coexistence per board, keyed by queryId rather than boardId.
---

# Per-Board Multi-Query Model — Design Note

- **Status:** `design-note: implemented` (transitioned 2026-05-16,
  same-day implementation arc). Worklog at
  `docs/worklog/2026-05-16-per-board-multi-query.md`. The original
  status line read: `design-note: planned`. Per ADR-0005 Rule 8,
  the status transition is the sibling-revision marker; the body
  below is the planning-time record retained without silent edit.
- **Genre:** Implementation roadmap. The current shape's invariant
  is "one active query per `BoardId`"; this note proposes "many
  active queries per `BoardId`, keyed by `QueryId`," with the
  cleanup choreography re-shaped accordingly.
- **Date:** 2026-05-16.
- **Scope:** `frontend/` only. The proxy and the backend are
  unaffected — both already hold N concurrent queries per session
  by construction (proxy: per-query IDs through Sessions / Hub /
  Router; backend: doesn't see queries). The arc is internal to
  the SPA.

## What this document is

A pre-implementation plan for removing the per-board single-slot
invariant that today lives in `src/services/analysis-service.ts`
and the small set of composables / store slots that mirror it.
The motivating symptom is range-query-interrupted-by-ponder; the
underlying shape is over-constrained beyond that one symptom and
the plan addresses the shape, not just the symptom.

## Motivation

The current `AnalysisService` enforces a strict one-analysis-per-
board invariant. Both `analyzeRange` and `analyzeActiveNode` open
with `this.stopBoardAnalysis(boardId)`, which sends a `terminate`
to the proxy for the previous query and clears the per-board
entries. Consequence: starting a ponder while a range query is
in flight kills the range query, and vice versa. There is no
mode of operation where a board can simultaneously hold a range
analysis, a ponder, and (a hypothetical) snapshot replay.

The invariant is invisible to the user. The spacebar (the most
common ponder fire-point, `useUserIORegistry.ts:70-78`) silently
terminates an in-flight range when ponder fires, with no warning
and no UX affordance to coexist.

Independent reasons the invariant is over-constrained:

- The **ledger** is keyed by `(configHash, nodeId)`. Two queries
  against the same hash deepen the same record monotonically
  (KataGo's visit count grows); against different hashes they
  fall into separate buckets. No write-race either way.
- **Query telemetry** is already keyed by `queryId`
  (`useQueryTelemetry`), not `boardId`. The Toolbar queue
  tooltip already renders N rows per board with per-row cancel.
- The **proxy** holds many concurrent queries per session by
  design.
- **KataGo** serialises at the engine; the proxy multiplexes at
  the wire. The SPA layer is the only place "one per board" is
  enforced.

The first user-facing surfacing of the constraint is the
range + ponder collision; the latent surfaces are equivalent —
no two analysis flows can coexist on a board today.

## Rationale archaeology

The single-slot pattern is older than the umbrella's git history.
It is present in the umbrella's first commit (`e5c857b initial`,
2026-04-26 by bork) — both `analyzeRange` and `analyzeActiveNode`
already open with `stopBoardAnalysis(boardId)` in that snapshot.
The pre-umbrella `gogui` repo's history was deliberately not
preserved (per `docs/playbooks/monorepo/monorepo-plan.md` §461-
463, "Don't preserve git history naively"). The originating
commit and its rationale are not reachable from this repository.

The plausible reconstruction: the gogui SPA grew up around a
single-board UX where the "ponder while looking at this position"
case was primary; range analysis was added later; and the
single-slot map was the simplest data shape that worked for the
primary case. The ledger's query-agnostic keying suggests the
multi-query concept was already implicit in the storage model —
the single-slot maps in the service layer are the bottleneck,
not the storage.

A sibling rationale-archaeology data point: commit `31a786e`
(2026-04-30) introduced `restartActiveAnalyses()` together with
the ownership-overlay shipping for v1.0.0. The implementation
fired the restart from a `deep: true` watcher on
`overlayLayers`, on the (locally-coherent) reasoning that the
overlay's render gate requires `ownership` in the packet → wire
needs `includeOwnership: true` → toggling on from an all-off
state needs a fresh query. That reasoning was correct for one
case (toggling the first sub-mode on) and overfired for all
others (toggling `liveness` while `continuous` is already on
changes nothing on the wire). The user removed the watcher in
commit `6a22369` (2026-05-08) with the framing: "a config-
toggle that auto-fires an expensive engine query is the
costly-and-unexpected side-effect class ADR-0002 is shaped to
make explicit." This plan inherits that framing — display
preferences and individual query controls should not fire
side-effects on other queries the user did not ask to touch.

## The proposed shape

**One active query per `BoardId` is replaced with N active
queries per `BoardId`, keyed by `QueryId`.** The per-board maps
in `AnalysisService` either become per-`QueryId` maps or grow a
collection valued dimension. Concretely:

- `activeSubscriptions: Map<BoardId, () => void>` →
  `Map<QueryId, () => void>`.
- `activeQueryIds: Map<BoardId, string>` →
  `Map<BoardId, Set<QueryId>>` (kept for the "stop everything
  on this board" path; see below) or dropped in favour of a
  reverse-lookup over `activeQueries` (which is already per-
  `QueryId`). The `Set` form is simpler.
- `activeQueries: Map<QueryId, …>` → unchanged.
- `restartCallbacks: Map<BoardId, () => void>` →
  `Map<QueryId, () => void>`. Each active query carries its
  own restart thunk; `restartActiveAnalyses()` iterates all
  queries.
- `store.engine.activeMode: Record<BoardId, 'none' | 'analyze' | 'ponder'>`
  → either dropped in favour of derived predicates, or kept as
  a derived "highest-priority mode" projection. See "Behaviour
  deltas" below.

The cleanup primitive `stopBoardAnalysis(boardId)` is repurposed
as the **"stop everything on this board"** operation. The
analyze methods stop calling it. A new `stopQuery(queryId)`
primitive becomes the per-query cancel path used by the
telemetry tooltip and by the spacebar's ponder-stop.

### One-ponder-per-board: semantic, not arbitrary

Removing the implicit clobber on `analyzeActiveNode` reveals
a nuance worth pinning down. *Ponder* semantically means "be
pondering on whatever the current node is" — two simultaneous
ponders on the same board are incoherent. (Compare with range
analyses, where two ranges with different `overrideSettings`
or different palettes can legitimately coexist, populating
different ledger buckets.) The "Follow Me" watcher's intent —
"as the user navigates, keep the ponder fresh on the new
node" — depends on the prior ponder being replaced, not
accumulated.

The cleanest expression of this is mode-scoped implicit
cleanup, kept narrow:

- **`analyzeRange(...)`** does *not* implicit-stop other
  range queries on the same board. Concurrent range
  analyses are legitimate.
- **`analyzeActiveNode(boardId, 'ponder')`** scans
  `activeQueries` for an existing ponder on the same board
  and calls `stopQuery` on it before issuing the new
  query. The "one ponder per board" invariant is preserved
  as a natural semantic — not the old `stopBoardAnalysis`
  hammer.
- **`analyzeActiveNode(boardId, 'analyze')`** — the
  one-shot deep-analyze-this-node mode — does *not*
  implicit-stop other queries. Same reasoning as range:
  two such queries with different params can coexist.

The user's headline symptom (range killed by ponder) is fixed
because the implicit cleanup is now scoped to "other ponders
on this board," not "everything." The "Follow Me" watcher
(`App.vue:120-132`) needs no explicit cleanup — calling
`analyzeActiveNode(boardId, 'ponder')` is enough; the
implicit ponder-replaces-ponder happens inside.

The spacebar's start-ponder branch (`useUserIORegistry.ts:75`)
similarly relies on the same implicit cleanup — but the
spacebar gate (`!isPondering(boardId)`) means no ponder
exists when the start branch fires, so the cleanup is a
no-op in that case. Harmless.

## Affected surfaces

Each of these gets a small surgical change. Files listed; the
discipline is per-file minimal-touch (ADR-0004), no incidental
rewrites.

### `src/services/analysis-service.ts`

- Map types as above.
- `analyzeRange` removes the leading `this.stopBoardAnalysis(boardId)`
  (line 399). Just adds to the active set.
- `analyzeActiveNode` removes the leading `this.stopBoardAnalysis(boardId)`
  (line 602). Same.
- `stopBoardAnalysis(boardId)` becomes the bulk variant —
  iterates the board's `Set<QueryId>` and calls `stopQuery` on
  each. The unsubscribe / `terminate` / activeQueries-delete /
  telemetry-unregister sequence moves into `stopQuery(queryId)`.
- `restartActiveAnalyses()` iterates `restartCallbacks` values;
  the per-`QueryId` keying means each in-flight query restarts
  independently, which is what a wire-flag change actually wants.
- `restartCallbacks.delete(boardId)` (line 844) → at the
  end of `stopQuery`, delete `restartCallbacks.get(queryId)`.
- Comments at lines 460-462, 645-647, 836-839 are rewritten to
  describe the new semantics (each is currently load-bearing
  on the old per-board pattern).
- The DEV-only per-packet timing log in `onAnalysisUpdate`
  already keys by `queryId`. No change.

### `src/store/index.ts`

- `store.engine.activeMode` either drops out entirely, or its
  semantics shift to "the highest-priority mode active on this
  board" computed from `activeQueries`. The two consumers are:
  - `useUserIORegistry.ts:72` — spacebar wants "is ponder
    currently active on this board" — replace with a predicate
    that scans active queries for a `ponder` entry on the
    board.
  - `App.vue:128` — "Follow Me" watcher wants the same
    predicate.
  - `BoardTab.vue:87-88` reads `ponderCeiling` for the
    progress meter — unaffected; reads from settings.
- `closeBoard` (line 252) and `resetWorkspace` already call
  `analysisService.stopBoardAnalysis(boardId)` — composes
  unchanged with the bulk variant. Docstring at
  `store/index.ts:173-235` needs a per-ADR-0005-Rule-3 sweep
  to describe the new relation; the resource-ownership-audit
  inline-comment convention is preserved.
- `delete store.engine.activeMode[boardId]` at line 267 — if
  the slot becomes derived, this line drops; if kept as a
  per-board cache it stays.

### `src/composables/useUserIORegistry.ts`

- Spacebar (lines 70-78): predicate `isPondering(boardId)`
  instead of `activeMode === 'ponder'`. Then
  `stopQuery(theBoard'sPonderQueryId)` on stop, or
  `analyzeActiveNode(boardId, 'ponder')` on start. The new
  semantics: spacebar starts a ponder *alongside* any
  existing range, and stops *only* the ponder.
- The stale comment block at lines 85-88 referencing the
  removed `useAppBootstrap` watcher is rewritten or removed.
  Per ADR-0005 Rule 3 the description should describe the
  relation, not the (removed) implementation.

### `src/App.vue`

- "Follow Me" watcher at lines 120-132: predicate
  `isPondering(activeBoardId)` instead of
  `activeMode === 'ponder'`. The watcher's intent is
  preserved — when the user navigates on a board whose ponder
  is active, restart ponder at the new node. The new
  semantics: it restarts only the ponder, leaves any range or
  replay untouched.
- The watcher's existing guards (board switch, same nodeId)
  are unchanged.

### `src/composables/useQueryTelemetry.ts`

- Already keyed by `queryId`. The per-query `cancel` thunk
  today routes through `stopBoardAnalysis(boardId)`, which
  kills siblings. Change to `stopQuery(queryId)` so the
  tooltip's per-row cancel button cancels only that row.
- The "drop every query for this board" tooltip behaviour
  on `closeBoard` already composes correctly via
  `stopBoardAnalysis(boardId)`'s bulk semantics.

### `src/components/editors/AnalysisControls.vue`

- The only `stopBoardAnalysis` callsite (line 115) is inside
  the **Purge** button's confirm handler. Bulk is the honest
  semantics here — the user is destroying every recorded
  packet for this board, and any in-flight queries that land
  after the purge would re-populate the ledger immediately.
  No change. The label is "Purge," not "Stop," so the bulk
  cleanup is what the affordance promises.

### `src/composables/review/useReviewSession.ts`

The audit landed; findings recorded under "Review-session
audit" below. Required changes:

- `analyzeRange` (and `analyzeActiveNode`) gain a return value:
  the `queryId` they minted. Today both return `void`.
- `processUserMove` (line 377) captures the returned `queryId`
  on the same line; passes it into a post-wait cleanup branch
  that calls `analysisService.stopQuery(queryId)` in **all
  three terminal states** of the wait (success, timeout,
  abort). The cleanup is per-query — does not touch any
  concurrent ponder or replay the user has fired on this
  board.
- `loadCard`'s pending-wait abort (lines 248-249) is
  preserved as-is — it aborts the *wait* (the `AbortController`),
  not the *query*. The `processUserMove` abort-branch cleanup
  above is what releases the analysis-service entry.
- `endSession` (lines 584-585) is preserved as-is for the
  same reason — it aborts the wait; the abort-branch handles
  query cleanup.

## Behaviour deltas

The user-visible changes are exactly:

1. **Spacebar during a range:** starts ponder alongside the
   range, doesn't kill the range. Spacebar with ponder
   active stops only ponder.
2. **Range fire during a ponder:** range starts alongside the
   ponder, doesn't kill the ponder. (Currently the timeline
   "Analyze" button kills any active ponder.)
3. **Telemetry tooltip per-row cancel:** cancels only that row.
   (Currently cancels every query on the board.)
4. **`closeBoard` / `resetWorkspace` / disconnect / HMR / engine
   WS drop:** unchanged. All routed through the renamed-but-
   semantically-equivalent `stopBoardAnalysis(boardId)` bulk
   path.

No wire-protocol change. No proxy-side change. No backend
change.

## Non-goals

- **The qEUBO toolbar restart** at `useAppBootstrap.ts:229-232`
  stays as-is. Commit `6a22369`'s commit message documents
  why: clicking A is a genuine data-change request rather
  than a display preference. Out of scope for this arc; can be
  revisited separately if the user-controllable-via-toggle
  framing turns out to apply here too.
- **Settings for "make this side-effect opt-in"** — none of
  the changes in this plan need a settings toggle. The change
  is "stop killing things the user didn't ask to kill," not
  "auto-fire something new." If a future arc surfaces an
  optional side-effect (e.g., the user does want
  ownership-toggle-restart for some workflow), the framing
  the user described ("an option that defaults to off") is
  the right shape and a registry leaf is the natural home —
  but it's a separate arc.
- **A multi-query queue UI surface** beyond what the existing
  telemetry tooltip already provides. The tooltip renders one
  row per active queryId today and is already the right shape
  for the new world.

## Migration order

Each step is small enough to compile, typecheck, and pass
existing tests on its own. The order is shaped so the build
stays green between steps and rollback is per-step cheap.

1. **Extract `stopQuery(queryId)` as a private primitive.**
   Lift the unsubscribe / `terminate` / activeQueries-delete /
   telemetry-unregister sequence out of `stopBoardAnalysis`
   into a `stopQuery` method. `stopBoardAnalysis` calls it.
   No semantic change yet — pure refactor.

2. **Re-key `activeSubscriptions` and `restartCallbacks` from
   `BoardId` to `QueryId`.** Introduce a parallel
   `boardToQueries: Map<BoardId, Set<QueryId>>` index used
   only by `stopBoardAnalysis` for the iterate-and-stop
   walk. The analyze methods still call `stopBoardAnalysis`
   at their head — no semantic change to the user-visible
   behaviour yet, but the data structure is now multi-query-
   capable. `restartActiveAnalyses` now iterates per-query.

3. **Replace `store.engine.activeMode` reads with `isPondering`
   predicate.** Two callsites: `useUserIORegistry.ts:72`,
   `App.vue:128`. The store slot still gets written for the
   moment; we just stop reading it for "is this board
   pondering" decisions. (`BoardTab.vue`'s `ponderCeiling`
   read is unaffected — it's from settings, not activeMode.)

4. **Remove the `stopBoardAnalysis(boardId)` calls at the head
   of `analyzeRange` and `analyzeActiveNode`.** Range + ponder
   now coexist. The headline behaviour change. After this
   step, the user-visible symptom (range killed by ponder) is
   fixed.

5. **Re-key telemetry's per-row cancel from `stopBoardAnalysis`
   to `stopQuery`.** Per-row cancel cancels one row.

6. **Audit `useReviewSession`.** Confirm no implicit "the prior
   grading query must die when the next one fires" assumption.
   Add explicit `stopQuery` if needed.

7. **Drop or derive `store.engine.activeMode`.** If derived,
   wire a computed from `activeQueries`. If dropped, remove
   the slot from the store and migrate it out via a schema-
   version bump (the rolling-archive discipline per
   `frontend/CLAUDE.md`).

8. **Documentation pass.** Update the inline comments at
   `analysis-service.ts:460-462`, `:645-647`, `:836-839`;
   rewrite the docstring on `closeBoard` per ADR-0005 Rule 3;
   rewrite the stale comment in `useUserIORegistry.ts:85-88`;
   `FILES.md` band tags re-checked. Per ADR-0005 Rule 6
   (author as you decide), these get done as part of the
   same arc, not after.

9. **`FEATURES.md` audit.** If the SPA's user-facing tour
   describes "engine mode" in single-slot terms anywhere,
   correct it. (Spot-check needed; this may be a no-op.)

The arc can stop after step 4 if the headline symptom-fix is
all the user wants in this PR. Steps 5-9 are then a follow-on
arc.

## Verification

After each step:

- `npm run build` (`vue-tsc -b && vite build`) green.
- `npm run test:run` green. The existing 100 tests do not
  cover the per-board single-slot invariant directly; nothing
  in the suite asserts "starting ponder cancels range." So
  no test edits are forced by this arc. New tests for the
  multi-query behaviour are a possible follow-on but not a
  blocker — the integration tier's existing review-session
  coverage exercises the renamed `stopBoardAnalysis` bulk
  path naturally.

Manual smoke at step 4 (the headline behaviour change):

- Start a range analysis on a board.
- Press space; verify ponder fires and **range continues**.
- Press space again; verify ponder stops and **range
  continues**.
- Reverse order: start ponder, fire range; both should
  coexist.
- Verify the telemetry tooltip shows both rows, each with
  its own ETA and its own cancel button.
- Verify the per-row cancel cancels only that row.
- Close the board (X button) while both queries are
  running; verify both terminate cleanly and the proxy log
  shows two `terminate` packets.
- Disconnect the engine; verify both queries terminate
  cleanly.

## Decisions (closed 2026-05-16)

1. **Per-kind cancel surfaces.** The principle: any
   "Stop"-shaped affordance stops only what its label
   implies. Applied:
   - Spacebar (`useUserIORegistry.ts`) toggles ponder and
     stops *only* the ponder when active. Does not touch
     range / replay.
   - Telemetry tooltip per-row cancel (`useQueryTelemetry.ts`)
     stops *only* the row it's attached to.
   - **Purge button** (`AnalysisControls.vue:113-118`) stays
     bulk — the label is "Purge," and bulk is what destroying
     the ledger requires. Honest semantics, no change.
   - No dashboard-level "Stop" button exists today; the
     telemetry tooltip's per-row cancel is the canonical
     "stop one query" UX. If a future arc adds an explicit
     Stop button, the per-kind principle applies to its
     label.

2. **`store.engine.activeMode` kept-as-derived.** Step 7's
   default proposal stands: compute the per-board mode from
   `activeQueries` and write the "highest-priority mode"
   projection on each activeQueries-mutation. No schema bump.
   The store slot's persisted form stays valid as a cache
   that the new code overwrites whenever it changes;
   migration via the rolling-archive discipline is deferred
   to a future cleanup arc that may also drop the slot
   entirely.

3. **Review-session audit complete.** Findings under
   "Review-session audit" below. The audit identified a
   **resource-cleanup regression** (not a correctness
   regression) that step 4 must address — the implicit
   `stopBoardAnalysis` at the head of `analyzeRange` was
   doing leak-prevention work for review-session queries
   that the review session itself never claimed. The fix
   adds the queryId return-value to the analyze methods and
   explicit `stopQuery` calls in `processUserMove`'s three
   terminal branches.

## Review-session audit

The review session at `src/composables/review/useReviewSession.ts`
manages its own abort choreography via a module-scope
`pendingAnalysisAborts: Map<BoardId, AbortController>` (lines
79, 88-107). The controllers gate the `waitForAnalysis(...)`
promises — they do **not** terminate analysis-service queries.
The analysis-service-side cleanup today relies entirely on the
next `analyzeRange` / `analyzeActiveNode` call clobbering the
prior entry.

### Correctness — no regression

The review session's success-path logic
(`Promise.all([waitForAnalysis(s_0), waitForAnalysis(s_1)])`
on lines 411-414, the per-color delta lookup on 472-481, the
Ebisu submission on 532) is independent of whether the
analysis-service map has stale entries. Each card's
`processUserMove` mints a fresh queryId and the
`waitForAnalysis` filters on `(hash, nodeId)` against the
ledger, not against the service's map. So removing the
implicit clobber introduces **no correctness regression**.

### Resource cleanup — real regression

Three flows leak in the new model without explicit cleanup:

1. **Card → card transition.** `loadCard(index+1)` aborts
   the pending-wait controller (lines 248-249) but never
   touches the analysis-service entry. Today, the next
   `processUserMove`'s `analyzeRange` clobbers it. Without
   that clobber, every completed card leaves a stale
   `activeQueries` / `activeSubscriptions` /
   `restartCallbacks` entry. Unbounded across a long review
   session.

2. **Timeout.** `processUserMove`'s catch branch
   (lines 423-430) on `AnalysisWaitError('timeout')`
   transitions to IDLE but never terminates the hung query
   on the proxy side. Today, the user's next
   `analyzeRange` clobbers it. Without that clobber, the
   proxy holds the query alive — KataGo continues spending
   compute on a query whose result no one will read. Real
   resource leak, not just an SPA-side map-bloat.

3. **End session.** `endSession()` (lines 576-602) aborts
   the wait but doesn't terminate the analysis-service
   query. Same shape as the card-transition case.

### Required code changes

- `analyzeRange` returns `QueryId` (today: returns `void`).
  Same for `analyzeActiveNode`.
- `processUserMove` captures the returned id:
  ```ts
  const queryId = analysisService.analyzeRange(...)
  ```
- All three of `processUserMove`'s terminal branches
  explicitly call `analysisService.stopQuery(queryId)`:
  - **Success branch** (line 415 onwards) — call before
    processing the delta. The query is naturally complete
    by this point (both `waitForAnalysis` promises
    resolved on `isDuringSearch=false` packets), so
    `stopQuery` is a clean-up no-op from the proxy's POV
    but releases the SPA-side map entry.
  - **Timeout branch** (line 424-430) — call before
    transitioning to IDLE. Actively terminates the hung
    query on the proxy side.
  - **Abort branch** (line 431-433) — call before the
    silent return. The aborter (`loadCard`,
    `endSession`, `closeBoard`) owns the post-abort
    status transition but not the analysis-service entry;
    `processUserMove` releases the entry as part of its
    own teardown.

The pattern matches the existing
`pendingAnalysisAborts.delete(bId)` cleanup at lines 419-421
and 440-442 — same shape (cleanup only if the slot is still
ours), applied to a second resource.

### Other callers of analyze methods

The audit was scoped to `useReviewSession` per the original
plan, but the same reasoning applies to any caller with its
own lifecycle:

- **`useAnalysisTimeline.ts:106`** (`analyzeSelection`): fired
  by the timeline panel's "Analyze" button. No own lifecycle;
  the query lives until the user closes the board, the engine
  disconnects, or the user cancels via the telemetry tooltip.
  The bulk-on-`closeBoard` path covers cleanup. No required
  change; the queryId return-value goes unused. Fine.
- **`analyzeFullGame`** (`analysis-service.ts:376`): same
  shape as `analyzeSelection`. No change required.
- **`App.vue:129`** (Follow Me ponder restart): the watcher
  fires `analyzeActiveNode(bId, 'ponder')` on navigation
  while pondering. The mode-scoped implicit cleanup
  documented in "One-ponder-per-board" above covers this
  case — `analyzeActiveNode(boardId, 'ponder')` releases
  the prior ponder on the same board before firing the new
  one. **No explicit cleanup needed at the caller.** The
  watcher's existing call site is preserved verbatim.
- **`useUserIORegistry.ts:75`** (spacebar): same shape as
  Follow Me. The gate (`!isPondering(boardId)`) means no
  ponder exists when the start branch fires, so the
  ponder-replaces-ponder cleanup is a no-op in that case.
  No required change.

Step 4 of the migration order: "remove the leading
`stopBoardAnalysis` from `analyzeRange` and
`analyzeActiveNode`; add the mode-scoped implicit cleanup
inside `analyzeActiveNode(mode='ponder')`; wire the
explicit `stopQuery` cleanup at the three review-session
terminal branches." The purge button stays as-is; the
Follow Me watcher and spacebar are unchanged at their call
sites.

## Companion artifacts

- Worklog at `docs/worklog/2026-05-16-per-board-multi-query.md`
  (to be written when implementation lands; per ADR-0005
  Rule 6, the worklog is authored as the work progresses, not
  in retrospect).
- The arc closes by transitioning this note's status from
  `design-note: planned` to `design-note: implemented`, per
  ADR-0005 Rule 8's sibling-revisions discipline applied at
  the status-line level.
