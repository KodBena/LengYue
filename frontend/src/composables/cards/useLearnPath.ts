/**
 * src/composables/cards/useLearnPath.ts
 *
 * "Learn this path" (wiki Wanted feature #8): grow a card tree beneath
 * an already-minted anchor card by following the engine's palette-
 * ranked candidate moves, then mint the interesting deviations from
 * it in one confirmed batch. Pedagogical rationale (verbatim from the
 * wiki item): the perfect/best-move-only line is easy to memorise;
 * what's hard is handling deviations from either side.
 *
 * ── Ratified semantics (ledger rows 660, 700, 706-708, 718) ──────────
 *
 * v1 shipped with a flat "expand ranks {1..K} as siblings, mint all of
 * them immediately" walk (row 660/700). The commissioner reviewed that
 * design's own flagged open call — how "rank by current palette"
 * cashes out when the ledger has no per-candidate palette-derived
 * score (see `learn-path-policy.ts`'s header for the full finding) —
 * and ratified a different structure on top of the same ranking-
 * metric answer, across two follow-up rounds:
 *
 *   - Row 706 (confirms the v1 ranking reading): candidates rank by
 *     `moveInfos[].order` ascending. See `learn-path-policy.ts`.
 *   - Row 707 (SPINE): the walk descends the best move (rank 1,
 *     `order` 0) at every step to form a spine — a single reference
 *     line, descended FIRST. No card is minted for a spine position;
 *     the spine is the only line excluded from carding.
 *   - Row 708 (DEVIATIONS DESCEND): ranks 2..K branch off the spine as
 *     DEVIATIONS — each is itself the root of a recursively-expanded
 *     subtree (its own spine descends uncarded, its own deviations
 *     recurse again), not a leaf stub.
 *   - Row 708 (LIVE EXPLORATION): the walk mutates the board's actual
 *     game tree incrementally, yielding a paint checkpoint between
 *     steps, so the tree viewer shows the exploration growing in real
 *     time. Pacing is frame/microtask-based (`params.yieldStep`,
 *     defaulting to one `requestAnimationFrame` per step) — never a
 *     wall-clock sleep.
 *   - Row 708 (DEFERRED BATCH MINT), amended by row 718 (BUTTON, NOT
 *     AUTOMATIC): no card is created during the walk, and no card is
 *     created automatically once the walk finishes either. `explore()`
 *     only grows the tree and collects deviation positions, leaving
 *     the result inspectable; a caller-driven `confirmMint()` — wired
 *     to an explicit "mint all" button in the UI, never called
 *     implicitly — mints the whole collected batch in one pass, in
 *     discovery order (always parent-before-child by construction —
 *     see `ParentRef` below), applying the existing-card dedup check
 *     at mint time.
 *   - Row 718 (PRE-MINT MARKERS): every pending deviation that ISN'T
 *     already an existing card gets a live marker
 *     (`learn-path-pending-markers.ts`) the moment the walk finds it —
 *     "this node would be added on mint all." Cleared after
 *     `confirmMint` resolves, or on an explicit discard.
 *   - Row 718 (policy surface ratified): the typed `{K, depth}` config
 *     via `LearnPathPolicy` is the accepted v1 policy surface — no
 *     DSL. The seam (below) stays for a future one to plug into.
 *
 * Two of the three ratified constraints from row 660 that predate this
 * restructure still hold:
 *
 *   1. The context tag is user-supplied, applied via the existing
 *      card-create wire's `tags` field — no tag-DSL changes.
 *   2. Seeded cards mint through the EXISTING mint path
 *      (`useMinting().commitMint`).
 *
 * The THIRD — "candidates come from EXISTING analysis already in the
 * ledger; no new engine queries; a position lacking analysis is a
 * FRONTIER" — is REPEALED by commission ledger row 881 (see "On-demand
 * analysis" below). It was an executor-authored restriction that was
 * never itself ratified by the commissioner; row 881 explicitly names
 * it as such and directs the walk to drive the engine instead. This is
 * the FOURTH unratified de-scope in this feature's history — row 881
 * treats scope with maximal care accordingly. FRONTIER now means a
 * GENUINE engine refusal (the query construction fails synchronously,
 * or the wait times out) at a position the walk DID ask about — never
 * "we never asked."
 *
 * ── On-demand analysis (commission row 881) ───────────────────────────
 * A visited position with no recorded analysis in the ledger is no
 * longer an automatic frontier: `walk()` requests analysis for it
 * through the app's EXISTING one-shot engine-query machinery
 * (`analysisService.analyzeActiveNode(boardId, 'analyze', visits)` —
 * the same one-shot "deep-analyze-this-node" method the codebase
 * already has; never a parallel/bespoke engine client), then awaits
 * the SAME ledger entry (`rawKey`, `nodeId`, `turnNumber`) the walk's
 * own `ledger.getRaw` read already consults — `waitForAnalysis`
 * (`composables/analysis/wait-for-analysis.ts`), the same primitive
 * `useReviewSession.processUserTurn` uses to await a graded move's
 * analysis. Only once the wait settles does the walk rank
 * `moveInfos` and continue descending — the existing ranking law
 * (row 706) is unchanged; it now sometimes runs against a packet that
 * just landed instead of one already in the ledger.
 *
 * **Visit-count governance (the card-visit-count override machinery
 * does NOT apply here — finding, not an assumption).** The review
 * session's per-card visit budget
 * (`ReviewSessionData.visitsOverride` / `ReviewCard.defaultVisits`,
 * `useReviewSession.ts`'s `effectiveVisits`) is keyed to an EXISTING
 * minted card. The positions this walk queries on demand are, by
 * construction, positions with NO card yet (a carded position already
 * has recorded analysis from whatever query minted it, or is
 * unreachable — walk never re-queries a carded node) — there is no
 * override to bypass or to silently apply. The visit count used is
 * `store.profile.settings.minting.defaultVisits` — the SAME
 * profile-level setting `compileMintGradingParameter` bakes into
 * `grading_parameter.data.default_visits` for every card this walk (or
 * any other mint path) creates. Querying at that value means the walk
 * evaluates each position at exactly the visit budget the resulting
 * card will itself carry once minted — not a bypass of the override
 * machinery, since the override machinery has nothing to override yet
 * at an unminted position.
 *
 * **Pacing (engineering choice inside the ratified scope, not a scope
 * choice — rejected alternatives named).** One in-flight on-demand
 * query at a time: the walk is depth-first and already strictly
 * sequential (row 707's spine-before-deviations ordering depends on
 * it), so a second concurrent query would race the SAME sequential
 * ordering guarantee the live-growth feature already promises.
 * Rejected: sibling-batch prefetch (fire every sibling candidate's
 * analysis query up front, before ranking any of them) — candidates
 * are read from `moveInfos` on the JUST-ANALYZED PARENT position, so
 * "prefetch the children" would mean firing queries for positions
 * whose very existence as *ranked* candidates isn't known until the
 * parent's own analysis (which may itself be on-demand) has already
 * landed; batching would only apply once ranking is known, i.e. after
 * this same sequential wait already happened once per node — no
 * actual parallelism opportunity the current per-node walk shape
 * exposes. Rejected: a walk-wide analysis queue draining independently
 * of tree growth — would decouple "which node is being analyzed" from
 * "which node the live tree cursor is on," breaking the "user watches
 * the tree grow in real time as results land" requirement (the
 * cursor/growth and the analysis wait are the SAME await in this
 * design, by construction).
 *
 * **Cancellation.** `learnPathAborts` (module-scope, `BoardId`-keyed,
 * mirroring `useReviewSession.ts`'s `pendingAnalysisAborts`) holds an
 * `AbortController` per in-flight walk. A board-close or
 * workspace-reset teardown handler (registered below) aborts it, which
 * `waitForAnalysis` observes as `AnalysisWaitError('aborted')` — the
 * walk treats this exactly like the existing board-identity-safety
 * abort path (`aborted = true`, stop recursing, return the partial
 * result) rather than recording a spurious frontier. The in-flight
 * engine query itself is released via `analysisService.stopQuery` in a
 * `finally` regardless of how the wait settles (result, refusal,
 * timeout, or abort) — no orphaned query survives past the walk step
 * that issued it, and since the walk is strictly sequential (see
 * "Pacing" above) at most ONE query is ever outstanding to begin with.
 *
 * **Progress honesty (ADR-0002/C6).** `learn-path-progress.ts`'s
 * `setAnalyzingNode` / `clearAnalyzingNode` mark the node currently
 * awaited so `TreeWidget` can render a distinct "analyzing" ring and
 * `LearnPathModal` a distinct status line — the walk's existing
 * live-growth checkpoint alone doesn't distinguish "quietly stepping
 * through recorded positions" from "blocked waiting on the engine";
 * this registry is the honest signal for the difference. No wall-clock
 * fakery — the marker reflects a real in-flight query, cleared the
 * instant it settles.
 *
 * **Precondition (genuinely-impossible input, not a de-scope).** An
 * engine connection must exist before the walk starts — checked
 * synchronously in `explore()` alongside the depth/topK/tag checks,
 * before `resolveAnchor` or any tree mutation, and raised as a
 * `LearnPathPreconditionError` exactly like those. A mid-walk
 * disconnect is NOT this precondition — it surfaces as a genuine
 * per-position frontier (the query construction refuses) or, if the
 * disconnect races the wait itself, whatever `waitForAnalysis` observes
 * (typically a timeout).
 *
 * ── Policy seam (orchestrator, type-driven; ratified row 718) ────────
 * The ranking/role/recursion decisions above are NOT hardcoded in the
 * walk engine below — they live in `learn-path-policy.ts`'s
 * `LearnPathPolicy` interface, and `spineFirstPolicy` (the ratified
 * rows-706-708 behavior) is the sole concrete implementation, passed
 * as this module's default. `LearnPathParams.policy` lets a caller
 * supply a different one; the walk engine only ever calls
 * `policy.rankCandidates` / `policy.shouldRecurse` /
 * `policy.isCardEligible`. A future user-selectable policy DSL (under
 * design consideration, NOT built here) would compile to a
 * `LearnPathPolicy` and plug in at this same seam without touching
 * this file.
 *
 * ── Parent-reference threading (how deviations skip the spine) ───────
 * A deviation's card should parent off the nearest CARDED ancestor —
 * which, since the spine never cards, may be several plies back. This
 * falls out of one small piece of bookkeeping: `walk()` threads a
 * `ParentRef` down through recursion, propagating it UNCHANGED across
 * every spine step (no card minted, so no new parent to hand down) and
 * re-minting it to a fresh placeholder only when it descends into a
 * deviation (which — deferred — doesn't have a real `CardId` yet).
 * `ParentRef` is `{resolved:true, cardId}` (the anchor, or a mint
 * that's already resolved) or `{resolved:false, placeholder}` (a
 * pending deviation, resolved once `confirmMint` reaches it — always
 * before any of its descendants are resolved, because a placeholder is
 * only ever created before recursing into that subtree).
 *
 * ── Live tree growth & pre-mint markers ───────────────────────────────
 * Both spine and deviation steps commit their position into the live
 * board via `updateBoardState` (so `TreeWidget` renders the growing
 * exploration) and then await `yieldStep()` — a paint checkpoint, not a
 * pacing delay; the default implementation is one `requestAnimationFrame`
 * per step. A deviation step additionally registers a pre-mint marker
 * (`learn-path-pending-markers.ts`) UNLESS it's already an existing
 * card (checked against the same pre-fetched dedup snapshot
 * `confirmMint` uses) — the marker set tracks exactly what mint-all
 * would actually create. Neither of these touches cards.db — only the
 * in-memory board's node tree and the marker registry change. Once the
 * walk finishes, the board's cursor (stones/turn/captures/koPoint/
 * currentNodeId) is reset to the anchor's own position — by
 * construction (see "Anchor resolution" above) this is always the SAME
 * position the cursor was at when `explore()` was invoked, whether the
 * anchor is a pre-existing card or one freshly minted from that exact
 * spot — the explored NODES persist (that tree IS the deliverable the
 * user inspects before minting), but the user's viewport doesn't end up
 * stranded wherever the last step landed.
 *
 * Documented limitation: if the caller never calls `confirmMint` (the
 * commissioner explicitly wants to inspect the exploration before
 * anything touches cards.db, rows 708/718), the grown tree nodes are
 * NOT rolled back — only the deferred card-minting and the pre-mint
 * markers are cancelable (`clearPendingMintMarkers`), not the tree
 * structure itself. Removing unconfirmed exploration nodes would
 * require tracking and safely deleting them (a node another concurrent
 * action might have started depending on), which is out of v1 scope.
 *
 * ── Board-identity safety (fresh-context review finding, fixed) ──────
 * `walk()` spans many `await yieldStep()` checkpoints — real time in
 * production (one `requestAnimationFrame` per step), during which the
 * user can close ANY board. `store.boards` is a plain array and
 * `closeBoard` splices it, so an array INDEX resolved once up front and
 * threaded across those checkpoints goes stale the moment an earlier
 * board closes — every subsequent write would land on whatever board
 * now occupies that slot (cross-board corruption, witnessed in review).
 * `writeLiveBoard()` below re-resolves `store.boards.findIndex(...)` by
 * `BoardId` at EVERY write site, never carries an index across an
 * `await`, and reports back whether the write landed. `walk()` treats a
 * missed write (the anchor board itself is gone) as an abort signal —
 * the walk stops recursing/looping and returns whatever partial
 * `LearnPathExploration` it had collected, the same partial-progress
 * posture as a frontier. This mirrors `learn-path-pending-markers.ts`'s
 * own by-`BoardId` keying (that module was never subject to this bug —
 * only the direct `updateBoardState` call sites were).
 *
 * `resolveAnchor` (the anchor-resolution generalization above) adds its
 * OWN pre-walk `await`s — the duplicate-check and, on a miss, the mint
 * — before `walk()`'s first checkpoint. A board close during those
 * awaits is not re-derived from an index (no index is held across
 * them), so it can't corrupt another board the way the stale-index bug
 * above could; the exposure is narrower: a fresh anchor can get minted
 * for a board that closes before `walk()` gets a chance to write
 * anything under it. `walk()`'s own first `writeLiveBoard` call still
 * catches this (the board is gone, so it reports `false` immediately)
 * and the walk aborts with an empty `LearnPathExploration` — the anchor
 * card itself is NOT rolled back (minting already committed
 * server-side), so it can end up a real card with no descendants ever
 * grown under it, the same accepted-cost shape as any other mint whose
 * caller doesn't get to build on it. Not observed in practice;
 * documented for the same reason the rest of this section is.
 *
 * ── Ranking metric — the commissioner's clarification (row 706), and
 * the finding that produced it ───────────────────────────────────────
 * `RawAnalysis.moveInfos` — the ONLY per-sibling-candidate ranking the
 * ledger holds — is keyed by `RawKey`, which is palette-INDEPENDENT by
 * construction (`state/analysis-config.ts::deriveAnalysisKeys`; the
 * ledger's raw/enrichment split exists precisely so a palette swap
 * does not re-key raw data). The palette's `state_fns`/`deltas`
 * enrichment is a per-PLAYED-move, per-turn scalar (`KataExtra.state`,
 * `KataPlayerExtra.deltas`) — there is no per-sibling-candidate
 * palette-derived score anywhere in the ledger to sort by. Row 706
 * confirms this build's reading: "current palette" governs *which
 * analysis identity is live* (`activeAnalysisKeys.value.rawKey`), and
 * *within* that bucket, ranking uses KataGo's own `order` field.
 *
 * ── Anchor resolution (generalized, commission row 832 — supersedes the
 * v1 "board root only" restriction this section used to document) ─────
 * The walk needs a `CardId` to parent depth-1 seeds under — this used
 * to be satisfied only by requiring `BoardState.sourceCardId` (set on
 * the board's ROOT node by the card-load paths) with the cursor pinned
 * at that root. That was a v1 narrowing the commissioner rejected
 * outright (row 832: "you see a position in a game and go 'hey, I want
 * to learn this'... and are greeted with a door slamming shut") — the
 * primary use case is starting from an ARBITRARY position, not only a
 * freshly-loaded card's own root.
 *
 * `resolveAnchor` (below) replaces the two rejected preconditions with
 * a two-outcome resolution of the CURRENT CURSOR POSITION, whatever
 * board/node it is on:
 *
 *   1. **Existing card.** `useKnownPositions.checkForDuplicate` hashes
 *      the position's serialized content through the stateless backend
 *      endpoint and looks the hash up in the boot-hydrated
 *      known-positions map (`hydrateKnownPositions`, plus this
 *      session's own incidental/mint-time appends). A hit anchors
 *      directly to that card — no mint.
 *   2. **No existing card.** The current position is minted as a fresh
 *      anchor, through the SAME real mint path a manual mint uses
 *      (`useMinting.prepareDraft` + `commitMint`), tagged with the
 *      caller's context tag. `commitMint` already calls
 *      `rememberMintedCard` internally, so the new anchor is
 *      immediately known-positions-visible for any later call this
 *      session.
 *
 * **Serialization-match soundness.** `resolveAnchor` builds its
 * duplicate-check content via `prepareDraft(boardId)` — the EXACT call
 * site a manual mint of this same position would use
 * (`serializeActivePath(board)`, root→cursor, per that function's own
 * shape note). Reusing the call site, not just the function, forecloses
 * the failure mode named in the commission: a hand-rolled second
 * serialization of "the current position" that differs from the mint
 * path's own (a different property order, a different path
 * derivation) would silently never match a hash the mint path itself
 * recorded, and duplicate detection would quietly stop working. Because
 * `prepareDraft`'s returned `raw_content` is what's hashed AND (on a
 * miss) exactly what's minted, there is no seam for that drift to open.
 *
 * **Known-positions staleness — reasoned, not solved.** The
 * known-positions map is a CLIENT-SIDE cache: hydrated at boot/re-auth
 * and appended-to on every mint this session, but it can be incomplete
 * (a card minted in another session or before this session's hydrate
 * ran). Its failure mode is a false MISS only — never a false hit,
 * since every entry it holds was itself hash-verified by the backend
 * at the write that recorded it (there is no path that records a hash
 * without the backend having computed it from real content). A false
 * miss costs a redundant anchor mint, not an incorrect one — the same
 * accepted-cost posture `card-position-annotations-design.md` already
 * takes for the mint-dialog's own duplicate warning — and the mint
 * that follows immediately closes the gap for this session (outcome 2
 * above already calls `rememberMintedCard`). The backend's hash
 * computation is the only thing "authoritative" here; the lookup
 * itself is intentionally best-effort, matching `useKnownPositions.ts`'s
 * own file-header framing of the map as "a convenience annotation
 * layer... never a blocking dependency."
 *
 * **The old fast path still exists — as a case of the general one.**
 * A board loaded from a card with the cursor still at that card's own
 * root serializes to exactly that card's own content, so
 * `checkForDuplicate` resolves outcome 1 and anchors to
 * `sourceCardId`'s own card — byte-identical behavior to the v1 special
 * case, now reached through the same path every other position takes
 * rather than a dedicated branch.
 *
 * ── Existing-card dedup ────────────────────────────────────────────────
 * `insert_card` does NOT dedup at the card level — v1 fetches the
 * anchor's already-minted descendant subtree once up front
 * (`resolveRoots` + `fetchTreeByRoot`, still a pre-walk read — only the
 * COMPARISON against it, and the resulting mint-or-skip decision, is
 * deferred to `confirmMint`) and compares each pending candidate's
 * `serializeActivePath` output against existing descendants'
 * `canonicalContent` by exact string equality. Sound within one
 * lineage tree, with the same mint-time-komi-calibration caveat
 * documented in the original v1 design (unchanged here).
 *
 * Domain band (ADR-0003): game-tree-coupled (B2).
 *
 * License: Public Domain (The Unlicense)
 */
import { store, updateBoardState } from '../../store';
import { backendService } from '../../services/backend-service';
import { analysisService } from '../../services/analysis-service';
import { ledger } from '../../state/analysis-ledger';
import { activeAnalysisKeys } from '../../state/analysis-config';
import { serializeActivePath } from '../../engine/sgf-writer';
import { getPath } from '../../engine/navigator';
import { applyGoMove } from '../../logic';
import { gtpToBoard } from '../board/use-move-suggestions';
import { compileMintGradingParameter, useMinting } from '../review/useMinting';
import { useKnownPositions } from './useKnownPositions';
import { waitForAnalysis, AnalysisWaitError } from '../analysis/wait-for-analysis';
import { KATAGO_ANALYSIS_TIMEOUT_MS } from '../../lib/timing';
import { spineFirstPolicy, type LearnPathPolicy, type LearnPathPolicyConfig } from './learn-path-policy';
import { addPendingMintMarker, clearPendingMintMarkers } from './learn-path-pending-markers';
import { setAnalyzingNode, clearAnalyzingNode } from './learn-path-progress';
import {
  registerBoardCloseHandler,
  registerWorkspaceResetHandler,
} from '../../store/teardown-registry';
import type { RawAnalysis } from '../../engine/katago/types';
import type {
  BoardId,
  BoardState,
  CardId,
  CardLineageNode,
  CardCreatePayload,
  GameNode,
  NodeId,
  RawKey,
  StoneColor,
} from '../../types';

export class LearnPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LearnPathError';
  }
}

/** Raised when the chosen node isn't the anchor-card-loaded root (see the precondition note above). */
export class LearnPathPreconditionError extends LearnPathError {
  constructor(message: string) {
    super(message);
    this.name = 'LearnPathPreconditionError';
  }
}

export interface LearnPathParams {
  readonly boardId: BoardId;
  /** Plies to expand beyond the anchor. >= 1. */
  readonly depth: number;
  /** Candidate ranks {1..K} expanded per node (rank 1 = the uncarded spine). >= 1. */
  readonly topK: number;
  /** User-supplied context tag, applied to every minted card. Non-empty after trim. */
  readonly tag: string;
  /** Exploration policy seam — defaults to the ratified `spineFirstPolicy` (rows 706-708, 718). */
  readonly policy?: LearnPathPolicy;
  /**
   * Paint checkpoint awaited after each live-tree step. Defaults to one
   * `requestAnimationFrame`. Tests inject a microtask-based yield
   * (`() => Promise.resolve()`) for determinism and speed — never a
   * wall-clock `setTimeout` pacing delay (banned per the standing
   * gate-memory/no-fixed-delay rule).
   */
  readonly yieldStep?: () => Promise<void>;
}

export interface LearnPathMove {
  readonly x: number;
  readonly y: number;
  readonly color: StoneColor;
}

export interface LearnPathSeeded {
  readonly cardId: CardId;
  readonly parentCardId: CardId;
  readonly plyDepth: number;
  readonly rank: number;
  readonly move: LearnPathMove;
}

export interface LearnPathSkippedExisting {
  readonly reason: 'existing-card';
  readonly existingCardId: CardId;
  readonly parentCardId: CardId;
  readonly plyDepth: number;
  readonly rank: number;
  readonly move: LearnPathMove;
}

export interface LearnPathSkippedUnplayable {
  readonly reason: 'unplayable-move';
  readonly parentCardId: CardId;
  readonly plyDepth: number;
  readonly rank: number;
}

export type LearnPathSkipped = LearnPathSkippedExisting | LearnPathSkippedUnplayable;

export interface LearnPathFrontier {
  readonly parentCardId: CardId;
  readonly plyDepth: number;
  readonly nodeId: NodeId;
}

export interface LearnPathResult {
  readonly tag: string;
  readonly seeded: readonly LearnPathSeeded[];
  readonly skipped: readonly LearnPathSkipped[];
  readonly frontiers: readonly LearnPathFrontier[];
}

/**
 * A not-yet-resolved mint target: either the anchor / an already-
 * resolved mint (`resolved: true`), or a placeholder for a pending
 * deviation `confirmMint` hasn't reached yet (`resolved: false`). See
 * the module header's "Parent-reference threading" section.
 */
type ParentRef =
  | { readonly resolved: true; readonly cardId: CardId }
  | { readonly resolved: false; readonly placeholder: number };

interface PendingSeed {
  readonly placeholder: number;
  readonly parentRef: ParentRef;
  readonly plyDepth: number;
  readonly rank: number;
  readonly move: LearnPathMove;
  readonly candidateSgf: string;
  readonly nodeId: NodeId;
}

interface PendingFrontier {
  readonly parentRef: ParentRef;
  readonly plyDepth: number;
  readonly nodeId: NodeId;
}

interface PendingUnplayable {
  readonly parentRef: ParentRef;
  readonly plyDepth: number;
  readonly rank: number;
}

/**
 * The result of `explore()`: the tree has already grown live in the
 * board (with pre-mint markers on the pending deviation nodes);
 * nothing has been minted. `pendingSeedCount` / `existingCount` /
 * `frontierCount` / `unplayableCount` are the summary a confirm-step
 * UI shows before `confirmMint` touches cards.db. `_pending` is the
 * walk's internal bookkeeping, round-tripped opaquely to
 * `confirmMint` — not for display.
 */
export interface LearnPathExploration {
  readonly tag: string;
  readonly boardId: BoardId;
  readonly anchorCardId: CardId;
  readonly pendingSeedCount: number;
  /** How many pending seeds will resolve as an existing-card skip at mint time (computed now, from the same pre-fetched dedup snapshot `confirmMint` uses — a card minted by someone else between explore and confirm isn't reflected). These are NOT pre-mint-marked (row 718: markers = pending minus existing). */
  readonly existingCount: number;
  readonly frontierCount: number;
  readonly unplayableCount: number;
  readonly _pending: {
    readonly seeds: readonly PendingSeed[];
    readonly frontiers: readonly PendingFrontier[];
    readonly unplayable: readonly PendingUnplayable[];
    readonly existingContent: ReadonlyMap<string, CardId>;
  };
}

function defaultYieldStep(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

/**
 * Writes `nextState` to `boardId`'s live board slot, re-resolving the
 * array index fresh (never carried across an `await`). Returns `false`
 * — without writing anything — if the board is gone (closed mid-walk);
 * `explore()`'s `walk()` treats that as an abort signal. See the
 * module header's "Board-identity safety" section.
 */
function writeLiveBoard(boardId: BoardId, nextState: BoardState): boolean {
  const index = store.boards.findIndex(b => b.id === boardId);
  if (index === -1) return false;
  updateBoardState(index, nextState);
  return true;
}

/**
 * Per-board in-flight-walk abort controllers (module-scope, mirroring
 * `useReviewSession.ts`'s `pendingAnalysisAborts`). `explore()` sets an
 * entry before its first on-demand query can fire and clears it in a
 * `finally` when the walk ends; the two teardown handlers below fire
 * `.abort()` on board-close / workspace-reset so a pending on-demand
 * engine query never outlives the board it was analyzing for. See the
 * module header's "On-demand analysis" → "Cancellation" section.
 */
const learnPathAborts = new Map<BoardId, AbortController>();

registerBoardCloseHandler({
  label: 'learn-path:abort-query',
  // Aborts the closing board's in-flight on-demand analysis wait, if
  // any. `waitForAnalysis` observes this as `AnalysisWaitError('aborted')`;
  // `walk()` treats it as the same abort signal `writeLiveBoard`'s
  // stale-board detection already produces, not a frontier.
  run: (boardId) => {
    learnPathAborts.get(boardId)?.abort();
    learnPathAborts.delete(boardId);
  },
});
registerWorkspaceResetHandler({
  label: 'learn-path:abort-query-all',
  run: () => {
    for (const controller of learnPathAborts.values()) controller.abort();
    learnPathAborts.clear();
  },
});

/**
 * Real-move count along root→`nodeId` — the KataGo wire "turn number"
 * `analysisService.analyzeActiveNode` computes internally for its
 * single-turn query (see `analysis-service.ts`'s
 * `buildMovesAndTurnIndex` docstring for the turn-index-vs-tree-index
 * distinction this mirrors: they coincide only when every node from
 * root to `nodeId` carries a real move). Every node this walk visits
 * was reached by `applyGoMove` (a real move), but an ancestor ABOVE the
 * anchor — reachable since anchor resolution now generalizes to any
 * cursor position (row 832) — could in principle be moveless, so the
 * count is walked explicitly rather than assumed equal to the walk's
 * own `plyDepth` (which counts plies from the ANCHOR, not from root).
 * Used only to make `waitForAnalysis`'s `turnNumber` argument match the
 * packet the on-demand query for this exact node will produce.
 */
function countRealMoves(nodes: Record<NodeId, GameNode>, nodeId: NodeId): number {
  const path = getPath(nodes, nodeId);
  return path.reduce((n, id) => n + (nodes[id]?.move ? 1 : 0), 0);
}

/** Outcome of a single on-demand analysis request — see `requestOnDemandAnalysis`. */
type OnDemandAnalysisResult =
  | { readonly kind: 'ok'; readonly raw: RawAnalysis }
  | { readonly kind: 'refused' }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'aborted' };

/**
 * Requests analysis for `nodeId` (the walk's live board cursor is
 * already sitting there by construction — see `walk()`'s call site)
 * through the EXISTING one-shot engine-query machinery
 * (`analysisService.analyzeActiveNode`, mode `'analyze'` — never a
 * parallel/bespoke client), then awaits the SAME ledger entry the
 * walk's own `ledger.getRaw` read consults. Always releases the
 * engine-side query bookkeeping (`stopQuery`) in a `finally`,
 * regardless of how the wait settles — mirrors
 * `useReviewSession.processUserTurn`'s own
 * request/wait/release shape. See the module header's "On-demand
 * analysis" section for the full design (visit-count governance,
 * pacing, cancellation).
 */
async function requestOnDemandAnalysis(
  boardId: BoardId,
  nodeId: NodeId,
  turnNumber: number,
  rawKey: RawKey,
  visits: number,
  signal: AbortSignal,
): Promise<OnDemandAnalysisResult> {
  if (signal.aborted) return { kind: 'aborted' };
  const queryId = analysisService.analyzeActiveNode(boardId, 'analyze', visits);
  if (queryId === null) {
    // Synchronous refusal — the engine disconnected between the
    // upfront precondition check and this call, or the board itself
    // is gone. A genuine engine refusal, never "we never asked."
    return { kind: 'refused' };
  }
  try {
    const raw = await waitForAnalysis(rawKey, nodeId, turnNumber, {
      timeoutMs: KATAGO_ANALYSIS_TIMEOUT_MS,
      signal,
    });
    return { kind: 'ok', raw };
  } catch (err) {
    if (err instanceof AnalysisWaitError) {
      return err.reason === 'aborted' ? { kind: 'aborted' } : { kind: 'timeout' };
    }
    throw err; // unexpected — propagate (ADR-0002)
  } finally {
    analysisService.stopQuery(queryId);
  }
}

/** DFS for a node matching `cardId` within a `CardLineageNode` tree. */
function findLineageNode(node: CardLineageNode, cardId: CardId): CardLineageNode | null {
  if (node.id === cardId) return node;
  for (const child of node.children) {
    const found = findLineageNode(child, cardId);
    if (found) return found;
  }
  return null;
}

/** Collect every CardId in the subtree, excluding `node` itself. */
function collectDescendantIds(node: CardLineageNode, out: CardId[]): void {
  for (const child of node.children) {
    out.push(child.id);
    collectDescendantIds(child, out);
  }
}

export function useLearnPath() {
  const { commitMint, prepareDraft } = useMinting();
  const { checkForDuplicate } = useKnownPositions();

  /**
   * Resolves the CURRENT CURSOR POSITION on `boardId` to the `CardId`
   * the walk anchors under — see the module header's "Anchor
   * resolution" section for the full design and its soundness argument.
   * Two outcomes: an existing card at this exact position (no mint), or
   * a freshly-minted one (through the real mint path, tagged with the
   * caller's context tag).
   */
  async function resolveAnchor(boardId: BoardId, tag: string): Promise<CardId> {
    const draft = await prepareDraft(boardId);
    if (!draft) {
      // Unreachable in practice: `explore` confirms the board exists
      // synchronously, with no intervening `await`, immediately before
      // calling this. Defensive per ADR-0002 rather than a non-null
      // assertion.
      throw new LearnPathError(
        `Learn this path: board ${boardId} not found while resolving the anchor.`,
      );
    }
    const existingCardId = await checkForDuplicate(draft.raw_content);
    if (existingCardId !== null) return existingCardId;

    // No existing card at this position: mint one now, tagged with the
    // caller's context tag rather than `prepareDraft`'s empty default —
    // everything else (raw_content, parent_card_id/game_metadata XOR,
    // grading_parameter) is the identical real-mint construction.
    const anchorPayload: CardCreatePayload = { ...draft, tags: [tag] };
    // Brand mint: commitMint (-> backendService.createCard) returns the
    // wire's raw numeric id; same ACL re-brand pattern used at the seed
    // mint site in confirmMint below.
    return await commitMint(anchorPayload) as CardId;
  }

  /**
   * Fetches the anchor's already-minted descendants and returns a map
   * of `canonicalContent → CardId` for the existing-card dedup check.
   * Throws `LearnPathError` if the anchor can't be resolved to a game
   * tree the caller owns — a resolve failure means we cannot honestly
   * claim dedup coverage, so per ADR-0002 the walk refuses rather than
   * silently minting possible duplicates.
   */
  async function loadExistingDescendantContent(
    anchorCardId: CardId,
  ): Promise<Map<string, CardId>> {
    const resolved = await backendService.resolveRoots([anchorCardId]);
    const group = resolved.roots.find(r => r.cardIdsInTree.includes(anchorCardId));
    if (!group) {
      throw new LearnPathError(
        `Learn this path: anchor card ${anchorCardId} could not be resolved to an owned game tree ` +
        `(resolve-roots reported it unmatched); refusing to seed without existing-card dedup coverage.`,
      );
    }
    // Browse-leak-fix (ledger rows 417/423): `fetchTreeByRoot` takes the
    // per-user display id (`CardPublicId`), not the raw `CardId` — the
    // tree BODY still speaks raw `CardId` per node (`CardLineageNode.id`),
    // only the root-lookup argument changed shape.
    const tree = await backendService.fetchTreeByRoot(group.rootCardPublicId);
    const anchorNode = findLineageNode(tree.tree, anchorCardId);
    if (!anchorNode) {
      throw new LearnPathError(
        `Learn this path: anchor card ${anchorCardId} was not found in its own resolved tree ` +
        `(root ${group.rootCardPublicId}) — the lineage read is inconsistent with resolve-roots.`,
      );
    }
    const descendantIds: CardId[] = [];
    collectDescendantIds(anchorNode, descendantIds);
    const cards = await Promise.all(descendantIds.map(id => backendService.fetchCard(id)));
    const byContent = new Map<string, CardId>();
    for (const card of cards) byContent.set(card.canonicalContent, card.id);
    return byContent;
  }

  function buildSeedPayload(rawSgf: string, parentCardId: CardId, tag: string): CardCreatePayload {
    return {
      raw_content: rawSgf,
      num_moves: store.profile.settings.minting.defaultNumMoves,
      grading_parameter: compileMintGradingParameter(),
      tags: [tag],
      // CardId brand-strip to the wire's raw number — same justified
      // cast as useMinting.prepareDraft (CardId = Brand<number, 'CardId'>,
      // erases at runtime).
      parent_card_id: parentCardId as unknown as number,
      game_metadata: undefined,
    };
  }

  /**
   * Runs the live-growth walk (spine descends uncarded; deviations
   * recurse as their own subtree, collected — not minted). Validates
   * params and the anchor precondition up front; every other outcome
   * (a missing-analysis frontier, an unplayable candidate) is collected
   * rather than aborting the walk, per ADR-0002 constraint 1. Mints
   * NOTHING — see `confirmMint`.
   */
  async function explore(params: LearnPathParams): Promise<LearnPathExploration> {
    // Genuinely-impossible-input validation stays on `LearnPathPreconditionError`
    // (row 832's design). The two REJECTED preconditions — sourceCardId
    // required, cursor pinned at the board root — are gone; anchor
    // resolution (below) generalizes to any board/cursor position. See
    // the module header's "Anchor resolution" section.
    if (params.depth < 1) throw new LearnPathPreconditionError('Learn this path: depth must be >= 1.');
    if (params.topK < 1) throw new LearnPathPreconditionError('Learn this path: topK must be >= 1.');
    const tag = params.tag.trim();
    if (!tag) throw new LearnPathPreconditionError('Learn this path: a context tag is required.');

    const board = store.boards.find(b => b.id === params.boardId);
    if (!board) throw new LearnPathPreconditionError(`Learn this path: board ${params.boardId} not found.`);

    // On-demand analysis (commission row 881) means the walk may need
    // to issue engine queries — refuse loudly, before any tree
    // mutation or anchor mint, if there's no engine to ask. Genuinely-
    // impossible-input class, same as the depth/topK/tag checks above,
    // not a de-scope: a mid-walk disconnect is a DIFFERENT case (a
    // per-position frontier or wait-timeout), handled where it happens.
    if (store.engine.status !== 'connected') {
      throw new LearnPathPreconditionError(
        'Learn this path: connect to the engine first — the walk may need to analyze positions on demand.',
      );
    }

    const anchorCardId = await resolveAnchor(params.boardId, tag);
    const policy = params.policy ?? spineFirstPolicy;
    const config: LearnPathPolicyConfig = { depth: params.depth, topK: params.topK };
    const yieldStep = params.yieldStep ?? defaultYieldStep;
    const rawKey = activeAnalysisKeys.value.rawKey;

    const existingContent = await loadExistingDescendantContent(anchorCardId);

    // Snapshot the anchor's own cursor fields — restored once the walk
    // finishes (module header's "Live tree growth" section). The
    // accumulated `nodes` growth is NOT part of this snapshot; it's
    // meant to persist.
    const anchorCursor: Pick<BoardState, 'stones' | 'captures' | 'turn' | 'koPoint' | 'currentNodeId'> = {
      stones: board.stones,
      captures: board.captures,
      turn: board.turn,
      koPoint: board.koPoint,
      currentNodeId: board.currentNodeId,
    };

    const pendingSeeds: PendingSeed[] = [];
    const pendingFrontiers: PendingFrontier[] = [];
    const pendingUnplayable: PendingUnplayable[] = [];
    let nextPlaceholder = 0;
    // Set the moment `writeLiveBoard` reports the anchor board is gone
    // (closed mid-walk, by the user or anything else), OR the moment an
    // on-demand analysis wait observes an abort (board-close/workspace-
    // reset — see `learnPathAborts` below). Checked at the top of every
    // loop/recursion so the walk stops promptly rather than continuing
    // to compute moves against a board that no longer exists — see the
    // module header's "Board-identity safety" and "On-demand analysis"
    // → "Cancellation" sections.
    let aborted = false;

    // On-demand analysis: the visit budget (module header's "On-demand
    // analysis" → visit-count governance finding) and the cancellation
    // handle, both captured once for the whole walk (never re-read
    // per-position — the walk is one logical operation).
    const onDemandVisits = store.profile.settings.minting.defaultVisits;
    const walkAbort = new AbortController();
    learnPathAborts.set(params.boardId, walkAbort);

    async function walk(state: BoardState, plyDepth: number, parentRef: ParentRef): Promise<void> {
      if (aborted) return;
      let raw = ledger.getRaw(rawKey, state.currentNodeId);
      if (!raw) {
        // No recorded analysis yet — request it on demand (commission
        // row 881) rather than treating the absence itself as a
        // frontier. See the module header's "On-demand analysis"
        // section.
        setAnalyzingNode(params.boardId, state.currentNodeId);
        const turnNumber = countRealMoves(state.nodes, state.currentNodeId);
        const outcome = await requestOnDemandAnalysis(
          params.boardId, state.currentNodeId, turnNumber, rawKey, onDemandVisits, walkAbort.signal,
        );
        clearAnalyzingNode(params.boardId);
        if (outcome.kind === 'aborted') {
          aborted = true;
          return;
        }
        if (outcome.kind === 'ok') {
          raw = outcome.raw;
        } else {
          // 'refused' (engine declined the query outright) or 'timeout'
          // (no response within KATAGO_ANALYSIS_TIMEOUT_MS) — a GENUINE
          // engine refusal at a position the walk DID ask about, never
          // "we never asked." Reported, never silently truncated
          // (ADR-0002).
          pendingFrontiers.push({ parentRef, plyDepth, nodeId: state.currentNodeId });
          return;
        }
      }
      if (!raw.moveInfos || raw.moveInfos.length === 0) {
        pendingFrontiers.push({ parentRef, plyDepth, nodeId: state.currentNodeId });
        return;
      }
      const ranked = policy.rankCandidates(raw.moveInfos, config);
      if (ranked.length === 0) {
        pendingFrontiers.push({ parentRef, plyDepth, nodeId: state.currentNodeId });
        return;
      }

      // Row 707/708: index 0 (spine) is processed — and, crucially,
      // fully recursed into and AWAITED — before index 1..K-1
      // (deviations). This ordering IS the "trunk drawn first, then
      // branches" live-growth guarantee; no separate scheduling needed.
      for (const candidate of ranked) {
        if (aborted) break;
        const { info, rank, role } = candidate;
        const nextPlyDepth = plyDepth + 1;
        const coords = gtpToBoard(info.move);
        if (!coords) {
          // Pass (or another unplayable GTP token). Recorded, not dropped.
          pendingUnplayable.push({ parentRef, plyDepth: nextPlyDepth, rank });
          continue;
        }
        const nextState = applyGoMove(state, coords.x, coords.y);
        if (!nextState) {
          // Defensive: a move the search engine reported should always
          // be legal against this exact position.
          pendingUnplayable.push({ parentRef, plyDepth: nextPlyDepth, rank });
          continue;
        }
        const move: LearnPathMove = { x: coords.x, y: coords.y, color: state.turn };

        // Live tree growth: commit into the reactive board (re-resolved
        // by BoardId, never a carried-over index — see writeLiveBoard's
        // own doc comment), then yield a paint checkpoint (row 708 LIVE
        // EXPLORATION). A missed write means the board is gone: abort
        // rather than keep computing moves against it.
        if (!writeLiveBoard(params.boardId, nextState)) {
          aborted = true;
          break;
        }
        await yieldStep();

        const eligible = policy.isCardEligible(role);
        const childParentRef: ParentRef = eligible
          ? { resolved: false, placeholder: nextPlaceholder++ }
          : parentRef; // spine: no card, no new parent — thread the same ref down.

        // Discriminant narrowing on `resolved === false` (not a cast) is
        // what recovers `.placeholder`'s type here — sound because
        // `childParentRef` was JUST constructed above with
        // `resolved: false` on exactly the `eligible` branch.
        if (eligible && childParentRef.resolved === false) {
          const candidateSgf = serializeActivePath(nextState);
          pendingSeeds.push({
            placeholder: childParentRef.placeholder,
            parentRef,
            plyDepth: nextPlyDepth,
            rank,
            move,
            candidateSgf,
            nodeId: nextState.currentNodeId,
          });
          // Row 718 PRE-MINT MARKERS: mark live, but only when mint-all
          // would actually create a card here — an already-existing
          // position resolves as a dedup-skip at confirm time, never minted.
          if (!existingContent.has(candidateSgf)) {
            addPendingMintMarker(params.boardId, nextState.currentNodeId);
          }
        }

        if (policy.shouldRecurse(role, nextPlyDepth, config)) {
          await walk(nextState, nextPlyDepth, childParentRef);
        }
      }
    }

    try {
      await walk(board, 0, { resolved: true, cardId: anchorCardId });
    } finally {
      // Release this walk's abort-controller slot (only if it's still
      // ours — a later `explore()` call on the same board may already
      // have replaced it) and clear any lingering "analyzing" marker as
      // a safety net (the normal path already clears it around every
      // `requestOnDemandAnalysis` call; this covers an unexpected throw
      // mid-wait). See "On-demand analysis" → "Cancellation" above.
      if (learnPathAborts.get(params.boardId) === walkAbort) {
        learnPathAborts.delete(params.boardId);
      }
      clearAnalyzingNode(params.boardId);
    }

    // Restore the user's cursor; the grown `nodes` persist (see header).
    // Re-resolves by BoardId (one-time, not carried across an `await`) —
    // a no-op if the board is gone (the `aborted` path above already
    // covers that; this is just the final write's own safety, not a
    // duplicate of the abort logic).
    const finalIndex = store.boards.findIndex(b => b.id === params.boardId);
    if (finalIndex !== -1) {
      const grownBoard = store.boards[finalIndex];
      updateBoardState(finalIndex, { ...grownBoard, ...anchorCursor });
    }

    const existingCount = pendingSeeds.reduce(
      (n, s) => n + (existingContent.has(s.candidateSgf) ? 1 : 0), 0,
    );

    return {
      tag,
      boardId: params.boardId,
      anchorCardId,
      pendingSeedCount: pendingSeeds.length,
      existingCount,
      frontierCount: pendingFrontiers.length,
      unplayableCount: pendingUnplayable.length,
      _pending: {
        seeds: pendingSeeds,
        frontiers: pendingFrontiers,
        unplayable: pendingUnplayable,
        existingContent,
      },
    };
  }

  /**
   * Mints the whole collected batch from a prior `explore()` in one
   * pass (row 708 DEFERRED BATCH MINT, row 718 explicit-button-only —
   * this function is the ONLY thing that calls `commitMint`), in
   * discovery order — always parent-before-child by construction,
   * since a placeholder is only ever created before the walk recurses
   * into that subtree. Clears the board's pre-mint markers when done,
   * regardless of outcome.
   */
  async function confirmMint(exploration: LearnPathExploration): Promise<LearnPathResult> {
    const { seeds, frontiers, unplayable, existingContent } = exploration._pending;
    const resolvedMap = new Map<number, CardId>();

    function resolveParent(ref: ParentRef): CardId {
      if (ref.resolved) return ref.cardId;
      const resolved = resolvedMap.get(ref.placeholder);
      if (resolved === undefined) {
        // Unreachable by construction (see module header); fail loudly
        // per ADR-0002 rather than mint under a dangling reference.
        throw new LearnPathError(
          `Learn this path: internal error — placeholder ${ref.placeholder} referenced before it was resolved.`,
        );
      }
      return resolved;
    }

    const seededOut: LearnPathSeeded[] = [];
    const skippedOut: LearnPathSkipped[] = [];

    try {
      for (const pending of seeds) {
        const parentCardId = resolveParent(pending.parentRef);
        const existingCardId = existingContent.get(pending.candidateSgf);
        if (existingCardId !== undefined) {
          skippedOut.push({
            reason: 'existing-card',
            existingCardId,
            parentCardId,
            plyDepth: pending.plyDepth,
            rank: pending.rank,
            move: pending.move,
          });
          resolvedMap.set(pending.placeholder, existingCardId);
          continue;
        }
        const payload = buildSeedPayload(pending.candidateSgf, parentCardId, exploration.tag);
        // CardId brand mint: commitMint (→ backendService.createCard)
        // returns the wire's raw numeric id; ACL brand mint at this call
        // site, mirroring backend-service.ts's other Band-2 mints.
        const newCardId = await commitMint(payload) as CardId;
        seededOut.push({ cardId: newCardId, parentCardId, plyDepth: pending.plyDepth, rank: pending.rank, move: pending.move });
        resolvedMap.set(pending.placeholder, newCardId);
      }

      for (const u of unplayable) {
        skippedOut.push({
          reason: 'unplayable-move',
          parentCardId: resolveParent(u.parentRef),
          plyDepth: u.plyDepth,
          rank: u.rank,
        });
      }

      const frontiersOut: LearnPathFrontier[] = frontiers.map(f => ({
        parentCardId: resolveParent(f.parentRef),
        plyDepth: f.plyDepth,
        nodeId: f.nodeId,
      }));

      return { tag: exploration.tag, seeded: seededOut, skipped: skippedOut, frontiers: frontiersOut };
    } finally {
      // Row 718: markers clear after mint regardless of outcome (partial
      // mint on a mid-batch failure still leaves no stale "would be
      // added" markers behind — the batch either resolves or the caller
      // sees the rejection and the board is left in whatever state the
      // partial loop reached, same partial-progress posture `runLearnPath`
      // callers already accept for the walk phase).
      clearPendingMintMarkers(exploration.boardId);
    }
  }

  /**
   * Discards a prior `explore()` without minting: clears the pre-mint
   * markers. Per the module header's documented limitation, the grown
   * tree NODES are not rolled back — only the deferred minting and its
   * markers are cancelable.
   */
  function discardExploration(exploration: LearnPathExploration): void {
    clearPendingMintMarkers(exploration.boardId);
  }

  /**
   * Convenience: `explore` then immediately `confirmMint`, for
   * programmatic / test use where the two-phase inspect-before-mint UI
   * (rows 708/718) isn't the caller's concern. The interactive modal
   * calls `explore`, lets the user inspect the live-grown tree and its
   * pre-mint markers, and only calls `confirmMint` on an explicit
   * "mint all" click.
   */
  async function runLearnPath(params: LearnPathParams): Promise<LearnPathResult> {
    const exploration = await explore(params);
    return confirmMint(exploration);
  }

  return { explore, confirmMint, discardExploration, runLearnPath };
}
