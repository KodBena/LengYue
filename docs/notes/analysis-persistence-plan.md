# Analysis Persistence — Design Note

> **Status (2026-05-07): superseded in shape, not in motivation.**
> The design described below — per-`(configHash, nodeId)`
> granularity, auto-persist gated on `isDuringSearch === false`,
> validation-blocked on a KataGo terminate-behaviour question —
> was reconsidered during the analysis-persistence design session
> on the `frontend/analysis-persistence` branch. The current shape
> is **manual + batched per-`BoardId`** with a scheme-tagged
> opaque-blob storage envelope; the `isDuringSearch` validation
> question dissolves under the watermark interpretation of
> `AnalysisLedger.mergeAnalysisPacket`. The canonical record of
> the new design is the dispatch
> `docs/dispatch/frontend-to-backend-analysis-persistence.md`,
> which is awaiting backend acknowledgement.
>
> This note will be rewritten to reflect the shipped design once
> the wire shape is firm. Until then, read the dispatch for the
> current design and treat the body of this note as historical
> context for how the shape evolved.

**Status:** Planning. Not yet implemented. This document captures the
design decisions so the feature can be picked up later without
re-deriving them from scratch.

**Motivation:** KataGo analyses cost electricity (real money). Today,
all analyses are held in an in-memory `AnalysisLedger` and are lost
when the user closes the browser. A user who reviews 30 games and
analyzes every move will pay the compute cost every time they reopen
those games. The feature stores analyses server-side so subsequent
sessions reuse the prior compute work.

---

## Scale constraints (back-of-envelope)

The constraints set by realistic usage:

- **Per-response size:** up to ~48KB when policy head output and
  ownership maps are included; much less without them.
- **Per-session scope:** 30 tabs × 200 moves each = 6,000 nodes in a
  worst case. Most won't be analyzed, but the upper bound must be
  considered.
- **Per-node config variance:** the `AnalysisLedger` keys by
  `(configHash, nodeId)`. A user who explores multiple analysis
  palettes on the same game multiplies the record count by the
  number of configs they ran.

**Implication:** the monolithic `PUT /documents/{key}` pattern used
by `SyncService` does not scale to this payload. A naive "add
analysis to the document" would produce multi-megabyte PUTs on every
debounced save. Analysis persistence requires its own channel,
granular uploads, and its own lifecycle.

---

## Architectural principles

### 1. Separate service, separate endpoint

`AnalysisPersistenceService` (or similarly named) — its own module.
**Not** a new channel on `SyncService`. The two services share one
invariant (reactive-to-network bridge) but differ in every other
respect:

| Concern | SyncService | AnalysisPersistenceService |
|---|---|---|
| Payload shape | monolithic document | many small records |
| Endpoint | `PUT /documents/{key}` | `POST /analysis-records` (or similar) |
| Batching | time-debounced (1s) | coalesced-per-node or small-batch |
| Failure policy | error-toast and continue | error-toast PER RECORD, fail-loud |
| Ownership semantics | last-write-wins on full blob | upsert by `(configHash, nodeId)` |

A generic `SyncChannel<T>` abstraction over both is tempting but
premature — we'd be abstracting over a sample size of one concrete
instance. Build the second one concretely first; if the pattern
genuinely repeats, extract later.

### 2. Per-node granularity, incremental upload

The existing `AnalysisLedger` already indexes by `(configHash,
nodeId)`. That is the natural persistence unit. When a node's
analysis reaches a persistence-eligible state, upload that single
record — not a wholesale dump. Three consequences:

- **Compute-bound, not bandwidth-bound.** Even the worst-case 48KB
  per-node record fits comfortably in one HTTP request.
- **Backend records are immutable in practice.** Analysis is a
  deterministic function of `(board state, config)`, so records for
  the same `(configHash, nodeId)` should be byte-equivalent modulo
  numeric noise. The upsert contract is "last-write-wins, but nobody
  writes competing values" — trivial concurrency.
- **Hydration becomes selective.** Rather than loading all records
  on connect, the client can fetch by `(configHash, nodeId)` on
  demand as the user navigates, or bulk-prefetch when a game is
  opened. Separate design question; see §5.

### 3. User opt-in, with cost-granularity controls

The feature is **off by default**. KataGo compute cost is the user's
problem; they decide whether the convenience of persistence is worth
the storage cost and the privacy implications (analyses stored
server-side).

Proposed settings (in `AppSettings.engine.katago` or a new
`AppSettings.persistence` group — naming TBD):

```typescript
readonly analysisStorage: {
  readonly enabled: boolean;              // master switch; default false
  readonly includePolicy: boolean;        // policy head channel; default false
  readonly includeOwnership: boolean;     // ownership map channel; default false
  readonly minVisitsToStore: number;      // floor to avoid storing trivial
                                          // low-visit ponders; default e.g. 100
};
```

The two "include*" toggles give users control over the heaviest
channels. `minVisitsToStore` avoids filling storage with the
near-worthless packets produced by e.g. a 50-visit dev test.

Rationale for the default-off stance: a user who opts in has
*actively chosen* to spend server storage to save future KataGo
cost. A user who never opts in pays KataGo costs every session but
gets exactly the behavior they have today. Quiet regression-safe
default.

### 4. Fail-loud — no silent retry

Each upload either succeeds or emits a system-log warning naming
the specific `(configHash, nodeId)` that didn't persist. The user
sees failures; they decide whether to retry manually (e.g., by
re-analyzing that node).

**Automatic retry is rejected** for the same reason it was rejected
in item 21: silent retry masks real backend problems. A KataGo
response that silently fails to persist looks exactly like a
successful analysis — until the user reopens the game next week
and discovers half the nodes need recomputing.

An explicit "retry failed persists" action (button in the system
log, or a background sweep behind a setting) could be added later
if the failure rate warrants it. Until we have evidence it does,
we don't build the machinery.

---

## ⚠ Open validation question: the `isDuringSearch` gating rule

**The protocol contract (as we understand it).** KataGo streams
intermediate packets during search with `isDuringSearch === true` —
the anytime-optimization pattern: each packet contains a
progressively better estimate as more visits accumulate. The final
packet for a query, marking the canonical result, carries
`isDuringSearch === false`. The existing ledger-watching code
already relies on this contract: `processUserMove` waits for
`isDuringSearch === false` precisely because that's the "real
analysis, done" signal.

**The proposed gating rule:** persist a record when a packet arrives
with `isDuringSearch === false` (and passes a visit-count floor).

**The actual risk — what we need to validate.** The typical user
flow includes aborting a ponder via the terminate action (`action:
'terminate'` on the KataGo analysis engine; current UI binding is
press-space-to-start, press-space-again-to-abort). The question is
what KataGo sends back when a ponder is terminated mid-search.

Two possibilities:

- **Hope (anytime-optimization-honoring behavior):** KataGo emits an
  `isDuringSearch === false` packet carrying the *best-known
  estimate computed so far*. `rootInfo.visits` reflects what was
  actually searched before the terminate; `moveInfos` reflect the
  interim conclusions; `extra` may or may not be populated
  depending on how much work had accumulated. The gating rule
  fires; we persist a legitimate-but-truncated analysis. This is
  fine — the `minVisitsToStore` floor filters out the worst
  undercooked records, but the data we do persist is honest.

- **Failure mode to guard against:** KataGo sends a
  terminate-acknowledgment packet — an `{ action: 'terminate',
  isDuringSearch: false }` shell, or similar — that has
  `isDuringSearch === false` set *for bookkeeping purposes* but
  carries no real analysis payload (empty or missing `moveInfos`,
  zeroed `rootInfo.visits`, missing `extra`). Or worse, carries
  payload fields from a prior streaming packet that are now stale.
  The gating rule fires; we persist junk; next session the junk
  hydrates as if it were a real analysis. **This is the data-
  corruption scenario the gating rule must prevent.**

**Validation plan (before building anything downstream):**

1. Start a ponder (a long one — high `maxVisits`, a position that
   won't settle quickly). Confirm the streaming `isDuringSearch ===
   true` packets arrive with monotonically growing
   `rootInfo.visits`.
2. Send `terminate` before the ponder naturally completes.
3. Observe the packets arriving after the terminate. Specifically:
   - Is there an `isDuringSearch === false` packet in the response?
   - If yes: inspect its structure.
     - Does `rootInfo.visits` match what was actually searched
       before terminate, or is it zero / missing / obviously bogus?
     - Is `moveInfos` populated with interim conclusions, or
       empty/missing?
     - Is the `id` field the query's id (meaning: "here's the final
       result of *that* query"), or something like a terminate-ack id?
4. If `rootInfo.visits` is legitimate and `moveInfos` is populated
   with real data: **the simple gating rule works as-is**. The
   anytime-optimization contract is being honored and we can trust
   `isDuringSearch === false` as a sufficient gate, modulo the
   visit-count floor.
5. If the terminate packet has `isDuringSearch === false` but fails
   structural checks (empty `moveInfos`, zero visits, etc.): the
   gating rule needs a structural predicate, not just a flag check.

**Refined gating predicate for case 5 (and prudent anyway):**

```typescript
const defaultGating: GatingPredicate = (p) =>
  p.isDuringSearch === false &&
  (p.rootInfo?.visits ?? 0) >= store.profile.settings.analysisStorage.minVisitsToStore &&
  Array.isArray(p.moveInfos) && p.moveInfos.length > 0;
```

The `moveInfos` presence check is the structural guarantee that the
packet carries analysis data, independent of whatever the
`isDuringSearch` flag claims for protocol reasons. This predicate
is worth adopting even in the hope case (1–4): it's a cheap
additional safety check, it only rejects packets that wouldn't be
useful anyway, and it insulates us from any future protocol
evolution that might introduce new `isDuringSearch === false`
packet variants we didn't anticipate.

**Development-phase diagnostic:** while validating, emit a
`console.warn` (not a user-visible system message — too noisy) for
any packet with `isDuringSearch === false` that fails the structural
check. If such packets turn out to be common during normal terminate
flow, we know case 5 is real and adjust. If they only appear under
weird edge cases, we can promote the diagnostic to a proper
`pushSystemMessage('warning', ...)` or silence it as noise. The
decision comes from observation, not speculation.

**This is the blocker for actually building the feature.** Everything
else in this document is design over the ledger's existing API
surface; this is the one place where a wrong assumption silently
corrupts data rather than producing visible ugliness.

---

## Proposed module shape

```typescript
// src/services/analysis-persistence.ts (illustrative)

export class AnalysisPersistenceService {
  // Subscribe to ledger mutations for a given config. Emits a
  // persist-eligible event per (nodeId, packet) that passes the
  // gating rule.
  constructor(private readonly gating: GatingPredicate) { ... }

  // Wire once at app startup, after auth.
  public start(): void;

  // Manual persist, e.g. from a "persist this node now" button.
  public persistOne(hash: string, nodeId: NodeId): Promise<void>;

  // Fetch stored analyses for a given board (bulk prefetch).
  public hydrateBoard(boardId: BoardId): Promise<void>;
}

type GatingPredicate = (packet: KataAnalysisResponse) => boolean;

// Default gating: structural, not just flag-based. See the
// validation section for why moveInfos presence is included.
export const defaultGating: GatingPredicate = (p) =>
  p.isDuringSearch === false &&
  (p.rootInfo?.visits ?? 0) >= store.profile.settings.analysisStorage.minVisitsToStore &&
  Array.isArray(p.moveInfos) && p.moveInfos.length > 0;
```

Implementation notes:

- **Subscription mechanism:** the `AnalysisLedger` already exposes
  per-node reactive version refs (`getOrCreateVersion`). The service
  watches those version refs and fires when a new packet is recorded.
- **Batching:** per-node watching naturally produces one event per
  final packet. No debounce needed — each event is already a discrete
  work unit. If we see a burst of events (e.g., bulk hydration after
  a `analyzeRange` for a 200-move game), batch into
  `POST /analysis-records/batch` — but build the single-record
  endpoint first and optimize only with evidence.
- **Config-scoped persistence:** the user may change palette mid-
  session. Each `configHash` is a distinct namespace. Stored
  records should include the `configHash` so hydration can select
  the right analysis for the user's current palette.

---

## Hydration strategy — separate design question

The write path (persistence) and the read path (hydration) are
independent decisions. Rough options for hydration:

**A. On-demand per node.** When the user navigates to a node and
the ledger doesn't have a record for `(currentConfigHash, nodeId)`,
issue a GET. Minimum network footprint, highest latency per-node.

**B. Bulk prefetch on board open.** When a board loads (SGF import
or review card load), fetch all stored records for that board's
nodes at the active configHash. One request, larger payload, no
per-node latency after.

**C. Background lazy prefetch.** A low-priority queue that
prefetches stored records for all active boards in the background.
Complexity cost for marginal UX gain.

**My default leaning:** **B with a fallback to A.** Bulk prefetch
covers the common case (user opens a game, scrolls through it);
on-demand fallback covers the rare case (user explores variations
that weren't part of the original analysis range). C is a premature
optimization.

This is an implementation detail to settle when the feature is
actually being built; noted here for completeness.

---

## Rollout phases

If/when we build this, a sensible sequencing:

1. **Validate the gating rule** (the `isDuringSearch` question above).
   Nothing else happens until this is resolved.
2. **Backend**: new table/collection for `analysis_records`, endpoints
   for POST (upsert by `(configHash, nodeId)`) and GET (single
   record and bulk-by-board).
3. **Frontend types & settings**: add `analysisStorage` to
   `AppSettings`, populate defaults, surface in the Settings tab
   (the RegistryEditor will auto-generate checkboxes + numeric
   input for the shape above).
4. **Write path only**: `AnalysisPersistenceService.start()`
   subscribes to the ledger, POSTs eligible records. No hydration
   yet. User can verify persistence via backend inspection.
5. **Hydration path**: add `hydrateBoard()` or equivalent; wire
   into board-load flow (SGF loader, review card loader).
6. **Polish**: batch endpoint if single-record POST bottlenecks;
   explicit "retry failed persists" surface if the failure rate
   warrants.

Each phase is independently reviewable and leaves the system in a
working state.

---

## Non-goals (explicit)

- **Not building a generic `SyncChannel<T>` abstraction.** Defer
  until there's evidence the pattern actually repeats with the same
  invariants.
- **Not changing anything about `SyncService`.** Document-blob sync
  stays exactly as it is. Analysis persistence is a sibling service,
  not a successor.
- **Not storing in-progress (`isDuringSearch === true`) packets.**
  The ledger holds these for reactive UI updates, but they're not
  canonical and shouldn't persist. (The `isDuringSearch === false`
  gating rule, refined per the validation section above, captures
  this correctly.)
- **Not addressing multi-tab concurrency.** Analysis records are
  upsert-by-key with no competing writers in practice; the single-
  tab assumption that SyncService relies on is irrelevant here.
