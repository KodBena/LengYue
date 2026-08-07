/**
 * src/types/game.ts
 *
 * The game domain module: Go value objects (Point / Move /
 * GameMetadata / NodeDelta), the game-tree state containers
 * (GameNode / BoardState and the play-vs-engine session types), and
 * the game-coupled brands (`NodeId`, `StoneColor`, `ColorMoveIndex`,
 * `PlyIndex`). Deliberately one module per ADR-0003's fork sizing: a
 * domain fork replaces this module wholesale while `types/ids.ts`
 * (the agnostic identity brands) survives. Carved from the
 * single-file `src/types.ts` (2026-06-10, history-lessons audit
 * §3.15); bodies are verbatim from the pre-split file.
 *
 * License: Public Domain (The Unlicense)
 */

import type { Brand, BoardId, CardId } from './ids';
// Type-only import (erased at compile time, no runtime cycle); mirrors
// `types/engine.ts`'s precedent of importing a type from outside `types/`.
// `BranchRangeKey` is declared alongside its sole factory
// (`deriveBranchRangeKey`) in `composables/analysis/branch-range-key.ts`
// per the keyed-cache rule (frontend/CLAUDE.md "Type-driven design").
import type { BranchRangeKey } from '../composables/analysis/branch-range-key';

// ── Game-coupled brands ───────────────────────────────────────────────────────

export type NodeId = Brand<string, 'NodeId'>;

// Stone-sprite cache key — the canvas thumbnail renderer's shared sprite
// store (`composables/cards/thumbnail-render-resources.ts`; sole factory
// `spriteKey` there). Per the keyed-cache rule (frontend/CLAUDE.md
// "Type-driven design"), the brand's declaration names the dependency set
// of the value it buckets: a rendered stone sprite depends on exactly two
// legs —
//   colour [domain-bound] — the StoneColor ('B' | 'W') being drawn;
//   rpx    [agnostic]     — the device-pixel radius the sprite renders at.
// An input the sprite depended on but the key omitted would surface as
// stale sprites served across that input's values; naming the legs here
// makes the omission reviewable at the declaration.
export type SpriteKey = Brand<string, 'SpriteKey'>;

// Two distinct ways to count moves in a game; the project's prior practice
// of typing both as bare `number` admitted a class of off-by-color bugs
// (heatmap thumbnail hint indexed `variationPath` with a color-local move
// number instead of an absolute ply, surfacing as misaligned thumbnails).
//
//   ColorMoveIndex — 0-indexed within a single colour's move sequence.
//     ColorMoveIndex 0 for Black is Black's first move; for White, White's
//     first. The triangular heatmap data emitted by KataProxy is natively
//     in this space (proxy/bsa.py SubStream → Triangular).
//
//   PlyIndex — 0-indexed position into a `variationPath: NodeId[]`.
//     PlyIndex 0 is the root (no move played); PlyIndex N is the position
//     after the Nth overall move. Black's k-th move → PlyIndex 2k-1;
//     White's k-th → PlyIndex 2k.
//
// Conversion happens through a single named helper at the boundary where
// a ColorMoveIndex is consumed against a variationPath; see
// `composables/useTriangularHeatmap::colorMoveToPly`.
export type ColorMoveIndex = Brand<number, 'ColorMoveIndex'>;
export type PlyIndex       = Brand<number, 'PlyIndex'>;

// Two distinct root-anchored path shapes through the game tree; the prior
// practice of typing both as bare `NodeId[]` admitted the confusion class
// the 2026-05-15 match postmortem records (two shipped bugs: a query built
// from root→leaf evaluated the wrong position; a termination condition
// counted path-length growth) — see
// `docs/notes/postmortem/postmortem-match-pre-existing-variation-2026-05.md`
// §4/§5b and the 2026-06-10 history-lessons audit §3.4. The two shapes
// coincide exactly when the current node is the active variation's leaf —
// which every test fixture used to construct, which is why the confusion
// stayed invisible.
//
//   RootToLeafPath — root → the active variation's leaf (following
//     `activeChildIndex` at each branch). "What does the active line as a
//     whole look like?" — chart x-axes, full-game analysis, fast-forward
//     to the mainline end. Sole producer: `getActiveVariationPath`
//     (`engine/util.ts`).
//
//   RootToCurrentPath — root → an explicitly-named position ("current" is
//     the canonical role from the postmortem; the position is always an
//     explicit parameter, never read from global cursor state). "What
//     moves has the engine seen?" — analysis-query move lists, turn-index
//     derivation. Producers: `getPath` (`engine/navigator.ts`) and the
//     named prefix conversion `rootToCurrentPrefix` (same module).
//
// These brand `NodeId[]` itself (not the elements), so a RootToLeafPath
// cannot be passed where a RootToCurrentPath is required (and vice versa)
// while either remains assignable to plain `NodeId[]`. Array operations
// (slice / concat / map) erase the brand by construction — re-branding
// goes through the named producers / conversions above, never an inline
// cast. Tree-positional (B2 within this module), not Go-bound: a domain
// fork that keeps a tree skeleton keeps these shapes.
export type RootToLeafPath    = Brand<NodeId[], 'RootToLeafPath'>;
export type RootToCurrentPath = Brand<NodeId[], 'RootToCurrentPath'>;

/**
 * Named union for consumers that genuinely operate on either shape — a
 * caller-supplied root-anchored line indexed by explicit turn positions
 * (`analyzeRange` is the worked example: full-game callers pass
 * root→leaf, the review session passes root→current, and the explicit
 * `startTurn`/`endTurn` parameters carry the position intent). Accepting
 * `RootedPath` is the sanctioned alternative to silently widening a
 * parameter back to `NodeId[]`, which would re-open the confusion class
 * the brands exist to close.
 */
export type RootedPath = RootToLeafPath | RootToCurrentPath;

export type StoneColor = 'B' | 'W';

// ── Value Objects (readonly preserved) ────────────────────────────────────────

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Move extends Point {
  readonly color: StoneColor;
  readonly type: 'place' | 'pass';
}

export type SgfProperties = Record<string, string[]>;

export interface GameMetadata {
  readonly blackName: string;
  readonly whiteName: string;
  readonly komi: number;
  readonly rules: string;
  readonly boardSize: number;
  readonly gameName?: string;
}

export interface NodeDelta {
  readonly captures: string[];
  readonly setupOverwritten: Record<string, StoneColor | null>;
  readonly prevKoPoint: Point | null;
  readonly newKoPoint: Point | null;
}

// ── State Containers (readonly removed per ADR-0001 Path A) ───────────────────

export interface GameNode {
  id: NodeId;
  parent: NodeId | null;
  children: NodeId[];
  activeChildIndex: number;
  // Per-branch cursor memory (2026-08-06 branch-switch-semantics veto):
  // when this node is itself a fork's child (a branch root), the last
  // node the cursor actually stood on *within this node's own subtree*
  // — inclusive of this node itself. `activeChildIndex` above already
  // remembers which CHILD each fork last descended into (the path);
  // this remembers the DEPTH the cursor stopped at along that path, so
  // a branch switch restores the exact node last occupied instead of
  // always landing back on the branch's immediate child.
  //
  // Write-through: `navigateTo` (`engine/navigator.ts`) sets this on
  // every ancestor of the new `currentNodeId` (including the node
  // itself) on every call — a fact of moving the cursor, not a
  // switch-time special case. Read-side: `resolveBranchTarget`
  // (`engine/navigator.ts`) validates the remembered id still exists
  // and is still inside this node's subtree before trusting it,
  // falling back loudly (this node's own id) otherwise — the case a
  // pruned/deleted node's stale memory would otherwise land the
  // cursor at a wrong or missing node.
  //
  // Optional and omitted at construction (mirrors `delta?` below):
  // `undefined` reads as "never visited independently of the branch
  // head," which is exactly a never-visited branch's correct fallback,
  // so no backfill migration is needed for blobs saved before this
  // field existed — the persisted shape degrades to "always fall back
  // to head," never to a crash or a wrong node.
  lastVisitedDescendant?: NodeId;
  properties: SgfProperties;
  move: Move | null;
  delta?: NodeDelta;
}

export interface BoardState {
  id: BoardId;
  rootNodeId: NodeId;
  currentNodeId: NodeId;
  stones: Record<string, StoneColor>;
  // Captures inner fields are mutated by `applyGoMove` (`nextCaptures[turn] += 1`);
  // the captures container's mutability propagates to its fields.
  captures: { B: number; W: number };
  koPoint: Point | null;
  turn: StoneColor;
  nodes: Record<NodeId, GameNode>;
  maxVisitsTarget?: number;
  // Analysis-chart selection ranges, keyed per branch-stem
  // (`BranchRangeKey`, `composables/analysis/branch-range-key.ts`) so a
  // range set on one variation survives navigating away and back, and
  // does not silently apply to an unrelated sibling branch. Each value
  // is `[startPly, endPly]` indices into the branch's own active
  // variation path, branded `[PlyIndex, PlyIndex]` so the off-by-colour
  // confusion the brand pair exists to prevent (a caller passing a
  // colour-local move-range here would be a compile error) cannot
  // recur. Mutated by `useAnalysisTimeline` via `mutateBoard`; persisted
  // across tab switches and board switches (BoardState survives both).
  // A missing entry for the current branch key means "use the default
  // fit-to-path range" — set on first observation of a non-empty
  // variation under that key. Wire shape unaffected: brands erase at
  // JSON serialisation, so SyncService persistence is transparent.
  //
  // Deliberately UNCAPPED (commissioner adjudication, ledger rows
  // 112/119 — overrules the original design proposal's 32-entry LRU
  // eviction). Growth is bounded in practice by the number of distinct
  // branch stems a human actually visits in a review session, not by
  // any enforced limit; a deleted variation can orphan a stem's entry
  // permanently, accepted as a documented bounded leak under the
  // Resource-ownership checklist (`frontend/CLAUDE.md` "Resource
  // ownership at mutation sites" §3) rather than wiring a sweep at
  // every delete-variation call site. Do not add an eviction policy
  // here without a new adjudication overturning this one.
  analysisRanges?: Partial<Record<BranchRangeKey, [PlyIndex, PlyIndex]>>;
  // CardId of the card whose SGF populated this board, when known.
  // Set by the card-load paths — `useDirtyBoardGuard.handleLoadCard`
  // (database tab) and `useReviewSession.loadCard` (SR queue) — before
  // `updateBoardState`. Preserved across moves and navigation because
  // `applyGoMove` / `applySetup` spread the state. Absent on fresh
  // boards from `createInitialBoard` and on SGF file uploads via
  // `useSgfLoader` — those are genuine roots with no upstream card.
  // After a successful mint the field is intentionally not advanced:
  // subsequent mints from the same exploration session land as
  // siblings under the original source, matching the natural
  // variation-tree fan-out shape rather than forcing a linear chain.
  // Read by `useMinting.prepareDraft` to populate the new card's
  // `parent_card_id`; absence triggers the root-mint branch that
  // supplies `game_metadata` instead. Persisted across SyncService
  // round-trips transparently — the brand erases at JSON
  // serialisation.
  sourceCardId?: CardId;
  // Opaque client-managed UUID for game-source dedup. Generated at
  // board-creation time (`createInitialBoard` for blanks, `loadSgf`
  // for SGF file uploads) and stable for the board's persistence
  // lifetime. Sent in every mint's `game_metadata.client_game_id`
  // (when `sourceCardId` is absent and the root-mint branch fires);
  // backend uses `(user_id, client_game_id)` as a get-or-create key
  // so two mints from positions A and B on the same board resolve
  // to a single game_source row with two roots underneath, instead
  // of two distinct "Untitled Game" entries with one root each.
  // First-mint-wins on the description / player metadata per the
  // backend's contract (`docs/dispatch/backend-to-frontend-game-source-dedup-status.md`).
  // Schema-version 23 introduces this field; the migration backfills
  // existing persisted boards with fresh UUIDs so each becomes its
  // own group (no retroactive grouping — pre-rollout game_sources
  // remain isolated, which matches the backend's NULL-client_game_id
  // posture for legacy rows).
  clientGameId: string;
  // Filename of the SGF the board was loaded from, when known.
  // Captured by `useSgfLoader` from the user's File.name; absent on
  // blank boards from `createInitialBoard` and on card-load paths
  // (where `sourceCardId` is the better handle). Read by
  // `resolveGameName` (`engine/util.ts`) as the third rung of the
  // description fallback ladder (after SGF GN / EV root properties),
  // before falling through to the date-stamped catch-all. The
  // `.sgf` extension is stripped by `resolveGameName`; this field
  // stores the raw filename so a future surfacing (e.g., a tooltip
  // showing "loaded from <file>") doesn't have to reconstruct it.
  sourceFileName?: string;
  /**
   * "Play vs engine" sessions on this board, keyed by the
   * session's start NodeId (stable game identity). Each session
   * has a frozen `config` and a moving `currentHeadNodeId` that
   * tracks the single green-ring position where the engine will
   * respond to the user's next move.
   *
   * Lifecycle per session:
   *   - Start: user clicks "Start game" in the modal at some
   *     node X. `games[X] = { config, currentHeadNodeId: X }`.
   *     If it's the engine's color's turn at X, the engine plays
   *     immediately (one auto-fire on creation) and `currentHeadNodeId`
   *     advances to the engine-response result.
   *   - Step: user plays a move FROM the current head. The
   *     engine queries the resulting position, plays its
   *     response, and `currentHeadNodeId` advances to the
   *     engine-response result (the new user-turn position).
   *   - End: user clicks "End" in the modal — entry deleted.
   *     Off-line navigation (cursor away from head) does not
   *     advance the head; engine doesn't fire on non-head moves.
   *
   * Multiple sessions can coexist on one board — each has its
   * own green ring at its current head. Two sessions whose heads
   * collide → behaviour undefined (the responder picks
   * whichever entry it iterates first; KataGo's nondeterminism
   * means collision is unlikely in practice).
   *
   * Schema-version 52 introduces this field; the migration
   * backfills `{}` on existing persisted boards.
   */
  games: Record<NodeId, EnginePlayGameSession>;
}

/**
 * Per-session state for a "play vs engine" game. The `config`
 * is captured at session-start and frozen for the session's
 * lifetime; `currentHeadNodeId` advances each round to track
 * the single green-ring position. See the `games` field's doc
 * on `BoardState` for the lifecycle semantics.
 */
export interface EnginePlayGameSession {
  config: EnginePlayGameConfig;
  /**
   * The single green-ring position for this session — the node
   * where the engine will respond to the user's next move.
   * Advances on each engine response. Distinct from the
   * session's key (the start NodeId), which never moves.
   */
  currentHeadNodeId: NodeId;
}

/**
 * Engine config for a "play vs engine" session — captured at
 * session-start and frozen. Per-session, lives inside
 * `EnginePlayGameSession.config`.
 */
export interface EnginePlayGameConfig {
  /** Color the user plays — the engine plays the other. */
  userColor: StoneColor;
  /** Max visits the engine uses per move. */
  engineMaxVisits: number;
  /** SELECTOR-mode model label, or null on LEAF / non-SELECTOR. */
  engineModel: string | null;
}
