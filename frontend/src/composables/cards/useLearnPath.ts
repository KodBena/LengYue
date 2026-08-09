/**
 * src/composables/cards/useLearnPath.ts
 *
 * "Learn this path" (wiki Wanted feature #8): grow a card tree beneath
 * an anchor position by following the engine's palette-ranked
 * candidate moves, marking the interesting deviations for the batch
 * card-minting affordance instead of minting anything itself.
 * Pedagogical rationale (verbatim from the wiki item): the
 * perfect/best-move-only line is easy to memorise; what's hard is
 * handling deviations from either side.
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
 *   - Row 718 (policy surface ratified): the typed `{K, depth}` config
 *     via `LearnPathPolicy` is the accepted v1 policy surface — no
 *     DSL. The seam (below) stays for a future one to plug into.
 *
 * ── SUPERSEDED BY THE BATCH CARD-MINTING AFFORDANCE (commissioner-
 * designed, ledger rows 926/957/1008) ─────────────────────────────────
 * Rows 708/718's own "DEFERRED BATCH MINT" / "BUTTON, NOT AUTOMATIC" /
 * "PRE-MINT MARKERS" design (no card during the walk; a caller-driven
 * `confirmMint()` mints the whole collected batch in one pass;
 * `learn-path-pending-markers.ts` renders a live "would be added"
 * ring) is now IMPLEMENTED THROUGH the general batch-mint affordance
 * instead of a bespoke mint path of Learn Path's own:
 *
 *   - `explore()` mints NOTHING — same invariant as before — but it no
 *     longer collects a placeholder-linked pending-mint batch of its
 *     own either. Every position the walk would have carded (the
 *     anchor, if freshly resolved, plus every non-duplicate deviation)
 *     is instead added LIVE to `mint-selection.ts`'s per-board
 *     selection Set (`addToSelection`) — the SAME registry a manual
 *     ctrl+click in `TreeWidget.vue` writes to.
 *   - There is no more `confirmMint()` / `runLearnPath()`: minting
 *     itself is the generic "Mint card(s)" affordance
 *     (`MintCardModal.vue`, one `POST /cards/batch` call built by
 *     `batch-mint-core.ts` from whatever is currently selected on the
 *     board) — Learn Path's own job ends at "grow the tree and mark
 *     what would be minted." The user reviews the grown tree (now
 *     rendered with the SAME dashed selection ring the pending-mint
 *     marker used to own) and hits Mint card(s) explicitly.
 *   - `discardExploration()` survives, narrowed: it un-marks exactly
 *     the NodeIds THIS exploration added (`LearnPathExploration.
 *     addedNodeIds`) — never the whole board's selection, which may
 *     also hold unrelated ctrl+click selections the user made by hand.
 *   - The per-walk "context tag" field is RETIRED (decision, not an
 *     oversight): since nothing mints from inside Learn Path anymore,
 *     a tag applied at explore-time had no channel left to reach the
 *     eventual mint call — `MintCardModal`'s own tag input already
 *     applies uniformly to every card in a batch (mirroring the old
 *     per-walk-tag behavior exactly, just applied at mint time instead
 *     of explore time). Rejected: keeping an inert tag field in
 *     `LearnPathModal` "for continuity" — a form control with no
 *     observable effect is a genre violation (ADR-0019), not a
 *     harmless leftover.
 *   - The anchor itself no longer mints eagerly when no existing card
 *     is found at the current cursor position — `resolveAnchor` (below)
 *     now returns `cardId: null` for that case and the walk adds the
 *     anchor's own NodeId to the selection instead, exactly like any
 *     other newly-discovered deviation. `LearnPathExploration.
 *     anchorCardId` is therefore `CardId | null`.
 *   - The existing-card dedup check (`loadExistingDescendantContent`)
 *     only has a card to fetch descendants FOR when the anchor
 *     resolved to an EXISTING card — a freshly-selected (not yet
 *     minted) anchor has, by construction, no descendants recorded
 *     anywhere yet, so that case skips the fetch entirely (empty dedup
 *     map) rather than being a special case to detect.
 *
 * Two of the three ratified constraints from row 660 that predate this
 * restructure — retired above along with row 718's own mint machinery:
 *
 *   1. ~~The context tag is user-supplied, applied via the existing
 *      card-create wire's `tags` field~~ — superseded (see above).
 *   2. ~~Seeded cards mint through the EXISTING mint path
 *      (`useMinting().commitMint`)~~ — superseded; Learn Path no
 *      longer mints anything itself.
 *
 * The THIRD — "candidates come from EXISTING analysis already in the
 * ledger; no new engine queries; a position lacking analysis is a
 * FRONTIER" — is REPEALED by commission ledger row 881 (see "On-demand
 * analysis" below, UNCHANGED by the batch-mint supersession above). It
 * was an executor-authored restriction that was never itself ratified
 * by the commissioner; row 881 explicitly names it as such and directs
 * the walk to drive the engine instead. This is the FOURTH unratified
 * de-scope in this feature's history — row 881 treats scope with
 * maximal care accordingly. FRONTIER now means a GENUINE engine
 * refusal (the query construction fails synchronously, or the wait
 * times out) at a position the walk DID ask about — never "we never
 * asked."
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
 * ── Parent linkage (no longer this module's concern) ──────────────────
 * Pre-supersession, a deviation's eventual card had to parent off the
 * nearest CARDED ancestor via a `ParentRef`/placeholder chain this
 * module owned (since the spine never cards, that ancestor could be
 * several plies back, and nothing here had a real `CardId` to parent
 * against until `confirmMint` minted it). That entire chain is GONE:
 * `batch-mint-core.ts::buildBatchMintPayload` resolves each selected
 * node's parent purely from the LIVE board's tree structure plus
 * current selection membership at MINT TIME (nearest ancestor that is
 * ALSO selected → `batch_index`; otherwise the board's own lineage) —
 * this module only ever needs to know WHICH NodeIds to select, never
 * how they'll parent each other once minted.
 *
 * ── Live tree growth & selection marking ────────────────────────────────
 * Both spine and deviation steps commit their position into the live
 * board via `updateBoardState` (so `TreeWidget` renders the growing
 * exploration) and then await `yieldStep()` — a paint checkpoint, not a
 * pacing delay; the default implementation is one `requestAnimationFrame`
 * per step. A deviation step additionally adds the node to
 * `mint-selection.ts`'s selection (`addToSelection`) UNLESS it's
 * already an existing card (checked against the same pre-fetched dedup
 * snapshot as before) — the selection tracks exactly what "Mint
 * card(s)" would actually create if hit right now. Neither of these
 * touches cards.db — only the in-memory board's node tree and the
 * selection registry change. Once the walk finishes, the board's
 * cursor (stones/turn/captures/koPoint/currentNodeId) is reset to the
 * anchor's own position — by construction (see "Anchor resolution"
 * below) this is always the SAME position the cursor was at when
 * `explore()` was invoked, whether the anchor is a pre-existing card
 * or a freshly-selected (not yet minted) position — the explored NODES
 * persist (that tree IS the deliverable the user inspects before
 * minting), but the user's viewport doesn't end up stranded wherever
 * the last step landed.
 *
 * Documented limitation: if the caller never mints the resulting
 * selection (the commissioner explicitly wants to inspect the
 * exploration before anything touches cards.db, rows 708/718), the
 * grown tree nodes are NOT rolled back — only the selection additions
 * are cancelable (`discardExploration`), not the tree structure
 * itself. Removing unconfirmed exploration nodes would require
 * tracking and safely deleting them (a node another concurrent action
 * might have started depending on), which is out of v1 scope.
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
 * OWN pre-walk `await` — the duplicate-check — before `walk()`'s first
 * checkpoint. A board close during that await is not re-derived from
 * an index (no index is held across it), so it can't corrupt another
 * board the way the stale-index bug above could; post-supersession
 * there's no mint exposure to document here either (a miss no longer
 * mints anything — it marks the anchor's NodeId selected, which
 * `walk()`'s own first `writeLiveBoard` call already covers: a missed
 * write means the board is gone, and the walk aborts with an empty
 * `LearnPathExploration`, same partial-progress posture as a
 * frontier).
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
 *      directly to that card — no mint, nothing added to the
 *      selection (it's already a card).
 *   2. **No existing card** (post-supersession, ledger rows
 *      926/957/1008). The current position is NOT minted — its NodeId
 *      is added to `mint-selection.ts`'s selection instead, exactly
 *      like any other newly-discovered deviation the walk finds.
 *      `resolveAnchor` returns `cardId: null` for this outcome;
 *      `explore()` is the one that calls `addToSelection` (both
 *      outcomes funnel through the same call site every other
 *      selection addition uses).
 *
 * **Serialization-match soundness.** `resolveAnchor` builds its
 * duplicate-check content via `serializeActivePath(board)` — the SAME
 * function `useMinting.prepareDraft` calls for a manual mint of this
 * same position (root→cursor, per that function's own shape note) —
 * rather than a hand-rolled second serialization that could silently
 * drift from the mint path's own (a different property order, a
 * different path derivation) and quietly stop matching a hash the mint
 * path itself would record. `batch-mint-core.ts::buildBatchMintPayload`
 * calls the SAME function (with an explicit `targetNodeId`) at mint
 * time, so the eventual mint's `raw_content` is byte-identical to what
 * this duplicate-check hashed.
 *
 * **Known-positions staleness — reasoned, not solved.** The
 * known-positions map is a CLIENT-SIDE cache: hydrated at boot/re-auth
 * and appended-to on every mint this session, but it can be incomplete
 * (a card minted in another session or before this session's hydrate
 * ran). Its failure mode is a false MISS only — never a false hit,
 * since every entry it holds was itself hash-verified by the backend
 * at the write that recorded it (there is no path that records a hash
 * without the backend having computed it from real content). A false
 * miss costs a redundant anchor SELECTION (the position gets marked for
 * minting even though a card for it may already exist), not an
 * incorrect one — the same accepted-cost posture
 * `card-position-annotations-design.md` already takes for the
 * mint-dialog's own duplicate warning; the eventual mint (whenever the
 * user hits "Mint card(s)") closes the gap for this session via
 * `useMinting.commitMint`/`commitMintBatch`'s own `rememberMintedCard`
 * call. The backend's hash computation is the only thing
 * "authoritative" here; the lookup itself is intentionally best-effort,
 * matching `useKnownPositions.ts`'s own file-header framing of the map
 * as "a convenience annotation layer... never a blocking dependency."
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
 * `insert_card` does NOT dedup at the card level — the walk fetches the
 * anchor's already-minted descendant subtree once up front
 * (`resolveRoots` + `fetchTreeByRoot`) ONLY when the anchor itself
 * resolved to an EXISTING card (a freshly-selected, not-yet-minted
 * anchor has no descendants recorded anywhere yet, by construction —
 * `existingContent` is the empty map in that case, no fetch needed) and
 * compares each candidate deviation's `serializeActivePath` output
 * against existing descendants' `canonicalContent` by exact string
 * equality, live during the walk (no longer deferred to a separate
 * confirm step — there is no confirm step). Sound within one lineage
 * tree, with the same mint-time-komi-calibration caveat documented in
 * the original v1 design (unchanged here).
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
import { useKnownPositions } from './useKnownPositions';
import { waitForAnalysis, AnalysisWaitError } from '../analysis/wait-for-analysis';
import { KATAGO_ANALYSIS_TIMEOUT_MS } from '../../lib/timing';
import { spineFirstPolicy, type LearnPathPolicy, type LearnPathPolicyConfig } from './learn-path-policy';
import { addToSelection, removeFromSelection } from './mint-selection';
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
  GameNode,
  NodeId,
  RawKey,
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

/**
 * The result of `explore()`: the tree has already grown live in the
 * board, with every newly-discovered mintable position (the anchor, if
 * freshly resolved, plus every non-duplicate deviation) added to
 * `mint-selection.ts`'s selection — nothing has been minted.
 * `pendingSeedCount` / `existingCount` / `frontierCount` /
 * `unplayableCount` are the summary `LearnPathModal` shows; `addedNodeIds`
 * is `discardExploration`'s own undo list — the exact set of NodeIds
 * THIS exploration added, never the whole board's selection (which may
 * also hold unrelated manual ctrl+click picks).
 */
export interface LearnPathExploration {
  readonly boardId: BoardId;
  /** `null` when the anchor itself was freshly selected (not yet minted) rather than resolved to an existing card. */
  readonly anchorCardId: CardId | null;
  readonly pendingSeedCount: number;
  /** How many candidate deviations matched an already-existing card and were therefore SKIPPED (not added to the selection). Only ever nonzero when `anchorCardId !== null` — a freshly-selected anchor has no existing descendants to match against. */
  readonly existingCount: number;
  readonly frontierCount: number;
  readonly unplayableCount: number;
  readonly addedNodeIds: readonly NodeId[];
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
  const { checkForDuplicate } = useKnownPositions();

  /**
   * Resolves the CURRENT CURSOR POSITION on `boardId` — see the module
   * header's "Anchor resolution" section for the full design and its
   * soundness argument. Two outcomes: an existing card at this exact
   * position (`cardId` set, no selection change — it's already a
   * card), or a genuinely new position (`cardId: null` — the caller
   * adds `nodeId` to the selection instead of minting).
   */
  async function resolveAnchor(boardId: BoardId): Promise<{ cardId: CardId | null; nodeId: NodeId }> {
    const board = store.boards.find(b => b.id === boardId);
    if (!board) {
      // Unreachable in practice: `explore` confirms the board exists
      // synchronously, with no intervening `await`, immediately before
      // calling this. Defensive per ADR-0002 rather than a non-null
      // assertion.
      throw new LearnPathError(
        `Learn this path: board ${boardId} not found while resolving the anchor.`,
      );
    }
    // Same serialization `useMinting.prepareDraft` uses for a manual
    // mint of this position (module header's "Serialization-match
    // soundness") — root→cursor, no `targetNodeId` (defaults to
    // `board.currentNodeId`).
    const rawContent = serializeActivePath(board);
    const existingCardId = await checkForDuplicate(rawContent);
    return { cardId: existingCardId, nodeId: board.currentNodeId };
  }

  /**
   * Fetches the anchor's already-minted descendants and returns a map
   * of `canonicalContent → CardId` for the existing-card dedup check.
   * Throws `LearnPathError` if the anchor can't be resolved to a game
   * tree the caller owns — a resolve failure means we cannot honestly
   * claim dedup coverage, so per ADR-0002 the walk refuses rather than
   * silently selecting possible duplicates.
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

  /**
   * Runs the live-growth walk (spine descends uncarded; deviations
   * recurse as their own subtree). Validates params and the anchor
   * precondition up front; every other outcome (a missing-analysis
   * frontier, an unplayable candidate) is collected rather than
   * aborting the walk, per ADR-0002 constraint 1. Mints NOTHING —
   * every mintable position found is added to `mint-selection.ts`'s
   * selection instead (see the module header's "SUPERSEDED BY THE
   * BATCH CARD-MINTING AFFORDANCE" section).
   */
  async function explore(params: LearnPathParams): Promise<LearnPathExploration> {
    // Genuinely-impossible-input validation stays on `LearnPathPreconditionError`
    // (row 832's design). The two REJECTED preconditions — sourceCardId
    // required, cursor pinned at the board root — are gone; anchor
    // resolution (below) generalizes to any board/cursor position. See
    // the module header's "Anchor resolution" section.
    if (params.depth < 1) throw new LearnPathPreconditionError('Learn this path: depth must be >= 1.');
    if (params.topK < 1) throw new LearnPathPreconditionError('Learn this path: topK must be >= 1.');

    const board = store.boards.find(b => b.id === params.boardId);
    if (!board) throw new LearnPathPreconditionError(`Learn this path: board ${params.boardId} not found.`);

    // On-demand analysis (commission row 881) means the walk may need
    // to issue engine queries — refuse loudly, before any tree
    // mutation, if there's no engine to ask. Genuinely-impossible-input
    // class, same as the depth/topK checks above, not a de-scope: a
    // mid-walk disconnect is a DIFFERENT case (a per-position frontier
    // or wait-timeout), handled where it happens.
    if (store.engine.status !== 'connected') {
      throw new LearnPathPreconditionError(
        'Learn this path: connect to the engine first — the walk may need to analyze positions on demand.',
      );
    }

    const anchor = await resolveAnchor(params.boardId);
    const addedNodeIds: NodeId[] = [];
    if (anchor.cardId === null) {
      // Fresh anchor: select it instead of minting it (module header's
      // "SUPERSEDED..." section) — the SAME call site every other
      // selection addition below uses.
      addToSelection(params.boardId, anchor.nodeId);
      addedNodeIds.push(anchor.nodeId);
    }

    const policy = params.policy ?? spineFirstPolicy;
    const config: LearnPathPolicyConfig = { depth: params.depth, topK: params.topK };
    const yieldStep = params.yieldStep ?? defaultYieldStep;
    // NOT captured here (fresh-context review MEDIUM finding, fixed): a
    // walk spans many `await` checkpoints, during which the user can
    // change the active model/palette/overrides. `rawKey` is re-derived
    // from `activeAnalysisKeys.value` fresh at the top of every `walk()`
    // step instead — see the module header note near that read for the
    // full rationale.

    // Existing-descendant dedup only has a card to fetch descendants
    // FOR when the anchor resolved to an EXISTING card (module header's
    // "Existing-card dedup" section) — a freshly-selected anchor has no
    // descendants recorded anywhere yet.
    const existingContent = anchor.cardId !== null
      ? await loadExistingDescendantContent(anchor.cardId)
      : new Map<string, CardId>();

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

    let pendingSeedCount = 0;
    let existingCount = 0;
    let frontierCount = 0;
    let unplayableCount = 0;
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

    async function walk(state: BoardState, plyDepth: number): Promise<void> {
      if (aborted) return;
      // Fresh-context review MEDIUM finding, fixed: re-derived at the top
      // of every step rather than captured once for the whole `explore()`
      // call. `analysisService.analyzeActiveNode` (inside
      // `requestOnDemandAnalysis` below) derives its own key from LIVE
      // settings at the moment it fires; a `rawKey` captured once at walk
      // start would drift the instant a mid-walk model/palette/overrides
      // change landed, stranding `waitForAnalysis` on a key the engine's
      // response will never match — silently riding the 30s timeout and
      // misreporting a live engine as having refused. Reading it fresh
      // here keeps the expected key and the fired query's actual key in
      // lockstep at every step.
      const rawKey = activeAnalysisKeys.value.rawKey;
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
          // "we never asked." Counted, never silently truncated
          // (ADR-0002).
          frontierCount++;
          return;
        }
      }
      if (!raw.moveInfos || raw.moveInfos.length === 0) {
        frontierCount++;
        return;
      }
      const ranked = policy.rankCandidates(raw.moveInfos, config);
      if (ranked.length === 0) {
        frontierCount++;
        return;
      }

      // Row 707/708: index 0 (spine) is processed — and, crucially,
      // fully recursed into and AWAITED — before index 1..K-1
      // (deviations). This ordering IS the "trunk drawn first, then
      // branches" live-growth guarantee; no separate scheduling needed.
      //
      // Tree-integrity fix (commission-witnessed "variations are
      // eradicated" defect): `writeLiveBoard`/`updateBoardState` REPLACE
      // the board's entire `nodes` map on every write (never a merge —
      // see `updateBoardState`'s own doc comment). `applyGoMove` builds
      // its returned `nodes` map as a spread of ITS INPUT state's own
      // `nodes` plus one new child. Every candidate in this loop is a
      // sibling move from the SAME parent position, so if each call below
      // spread from the ORIGINAL `state` captured at this `walk()`
      // invocation's entry, every candidate after the first would
      // overwrite the live board with a snapshot that predates
      // everything the prior candidates (and their own recursion) just
      // grew — silently deleting it. `parentState` is refreshed with the
      // live board's current `nodes` after each candidate (write +
      // optional recursion) settles, so the next sibling's own write
      // builds on top of everything grown so far rather than clobbering
      // it. Only `nodes` is refreshed — `stones`/`captures`/`turn`/
      // `koPoint`/`currentNodeId` stay `parentState`'s own throughout the
      // loop, since every candidate is evaluated as an alternative from
      // the SAME parent position, never accumulating a sibling's move.
      let parentState = state;
      for (const candidate of ranked) {
        if (aborted) break;
        const { info, role } = candidate;
        const nextPlyDepth = plyDepth + 1;
        const coords = gtpToBoard(info.move);
        if (!coords) {
          // Pass (or another unplayable GTP token). Counted, not dropped.
          unplayableCount++;
          continue;
        }
        const nextState = applyGoMove(parentState, coords.x, coords.y);
        if (!nextState) {
          // Defensive: a move the search engine reported should always
          // be legal against this exact position.
          unplayableCount++;
          continue;
        }

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
        if (eligible) {
          const candidateSgf = serializeActivePath(nextState);
          pendingSeedCount++;
          if (existingContent.has(candidateSgf)) {
            // Already a card somewhere in the anchor's own tree — skip,
            // never add to the selection (module header's "Existing-card
            // dedup" section).
            existingCount++;
          } else {
            addToSelection(params.boardId, nextState.currentNodeId);
            addedNodeIds.push(nextState.currentNodeId);
          }
        }

        if (policy.shouldRecurse(role, nextPlyDepth, config)) {
          await walk(nextState, nextPlyDepth);
        }

        // Refresh before the next sibling (see the tree-integrity note
        // above) — re-resolved by BoardId per the board-identity-safety
        // discipline (`writeLiveBoard`'s own doc comment): a missed
        // resolution means the board is gone, which is an abort, not a
        // stale-nodes continuation.
        if (aborted) break;
        const liveBoard = store.boards.find(b => b.id === params.boardId);
        if (!liveBoard) {
          aborted = true;
          break;
        }
        parentState = { ...parentState, nodes: liveBoard.nodes };
      }
    }

    try {
      await walk(board, 0);
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

    return {
      boardId: params.boardId,
      anchorCardId: anchor.cardId,
      pendingSeedCount,
      existingCount,
      frontierCount,
      unplayableCount,
      addedNodeIds,
    };
  }

  /**
   * Discards a prior `explore()` without minting: un-marks exactly the
   * NodeIds THIS exploration added to the selection
   * (`exploration.addedNodeIds`) — never the whole board's selection,
   * which may also hold unrelated manual ctrl+click picks. Per the
   * module header's documented limitation, the grown tree NODES are
   * not rolled back — only the selection additions are cancelable.
   */
  function discardExploration(exploration: LearnPathExploration): void {
    removeFromSelection(exploration.boardId, exploration.addedNodeIds);
  }

  return { explore, discardExploration };
}
