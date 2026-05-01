/**
 * src/types.ts
 * Domain Modeling with Branded Types (Haskell-style Newtypes).
 *
 * ─── Policy on `readonly` (per ADR-0001 Path A) ──────────────────────────────
 * Two distinct categories of interface live in this file, and they have
 * opposite `readonly` policies:
 *
 *   STATE CONTAINERS (no `readonly`):
 *     Interfaces representing state that the application mutates as part
 *     of normal operation — the store mutates `BoardState`, the navigator
 *     updates `GameNode.activeChildIndex`, the analysis service writes
 *     to `EngineState`, registry editors mutate `AppSettings` and friends.
 *     Annotating these `readonly` was an aspirational lie that strict mode
 *     refused to accept; ADR-0001 Path A removes the annotation in favor
 *     of mutator-convention enforcement at code review.
 *
 *     In this category: BoardState, GameNode, EngineState, UISession,
 *     SessionState, ReviewSessionData, ProfileState, AppSettings (and
 *     its nested types), AnalysisEnvironment, AnalysisPalette,
 *     MintingSettings, NavigationSettings, ThumbnailSettings, CardSet.
 *
 *   VALUE OBJECTS (`readonly` preserved):
 *     Interfaces that flow through the system but are never mutated;
 *     new instances are constructed from old ones (functional update).
 *     The `readonly` annotation here matches actual behavior — strict
 *     mode never had a problem with these because the codebase never
 *     mutates them.
 *
 *     In this category: Point, Move, GameMetadata, NodeDelta, EbisuModel,
 *     ReviewCard, SystemMessage, ForestStat, TagStat, ReviewFeedback,
 *     CardLineageNode, RootGroup, ResolveRootsResult, CardLineageTree,
 *     EngineMetrics (the metrics object itself is swapped wholesale by
 *     the analysis service; its inner fields are never individually
 *     mutated — `metrics: EngineMetrics` on EngineState is mutable, but
 *     the EngineMetrics value object is immutable, which is the
 *     idiomatic functional-state pattern: mutable container, immutable
 *     value), AuthState (discriminated union; each constructor's
 *     fields are immutable; new state values are produced rather than
 *     mutated in place).
 *
 * The `Brand<K, T>` phantom field uses `readonly` as a structural-typing
 * trick, not as an immutability annotation; it is unrelated to either
 * category above.
 * ──────────────────────────────────────────────────────────────────────────
 */

// ── Re-exports: KataGo wire-protocol types ────────────────────────────────────
export type {
  KataAnalysisResponse,
  KataExtra,
  KataPlayerExtra,
} from './engine/katago/types';

// ── Re-exports: PV animation settings shape ───────────────────────────────────
// Imported (not just re-exported) so `UISession.pvAnimation` can
// reference the alias locally; `export type … from` is a pure
// re-export and does not introduce the name into module scope.
import type {
  PvAnimationSettings,
  PvAnnotation,
  PvMode,
} from './composables/use-pv-animation';
export type { PvAnimationSettings, PvAnnotation, PvMode };

// ── Type Branding Utilities ───────────────────────────────────────────────────
type Brand<K, T> = K & { readonly __brand: T };

export type BoardId    = Brand<string, 'BoardId'>;
export type NodeId     = Brand<string, 'NodeId'>;
export type ProfileId  = Brand<string, 'ProfileId'>;
export type SessionId  = Brand<string, 'SessionId'>;
export type BookmarkId = Brand<string, 'BookmarkId'>;

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
  lastActivity: number;
  maxVisitsTarget?: number;
  // Analysis-chart selection range as [startTurn, endTurn] indices into
  // the active variation path. Mutated by `useAnalysisTimeline` via
  // `mutateBoard`; persisted across tab switches and board switches
  // (BoardState survives both). `undefined` means "use the default
  // fit-to-path range" — set on first observation of a non-empty
  // variation. Release-scope item 2.
  analysisRange?: [number, number];
}

// EngineMetrics is a value object (immutable, swapped wholesale); the
// `metrics` *field* on EngineState below is mutable (the swap is the
// mutation). This is the idiomatic functional-state pattern.
export interface EngineMetrics {
  readonly packetsPerSecond: number;
  readonly lastResponseId: BoardId | null;
  readonly lastWatchdogTimestamp: number;
  readonly latencyMs: number;
}

export type RegistryLeaf = string | number | boolean | null;
export interface Registry {
  [key: string]: RegistryLeaf | Registry | RegistryLeaf[];
}

// ThumbnailSettings is mutated through the registry editor.
export interface ThumbnailSettings {
  showOnHover: boolean;
  sizePx: number;
}

// AnalysisPalette is mutated through the PaletteEditor.
export interface AnalysisPalette {
  id: string;
  name: string;
  delta_fn: string;
  summary_fn: string;
  state_fns: Record<string, string>;
}

// Per-parameter metadata for the qEUBO calibration loop. Authored
// via the PaletteEditor's Analysis Environment view; mutated in
// place. `range` is required when `qeubo_controlled` is true (the
// optimizer needs both endpoints to map [0, 1]^d → actual values);
// the editor surfaces a validation error when the contract is
// violated, per ADR-0002. Parameter declarations not under qEUBO
// control may still carry a range for documentation, or carry
// neither field. Snake_case matches the surrounding analysis_env
// subtree convention (sibling to `parameters`, `symbols`).
export interface ParameterMeta {
  range?: [number, number];
  qeubo_controlled?: boolean;
}

export interface AnalysisEnvironment {
  symbols: Record<string, string>;
  parameters: Record<string, number>;
  parameter_meta?: Record<string, ParameterMeta>;
  palettes: AnalysisPalette[];
  activePaletteId: string;
}

// ── qEUBO calibration domain types ────────────────────────────────────────────
//
// Camel-case projections of the wire shapes documented in
// `docs/dispatch/frontend-to-backend-qeubo-integration.md` §2.4. The
// ACL at `services/qeubo-service.ts` translates between these and the
// generated `components['schemas']['*']` wire types from
// `types/backend.ts`. The phase string is narrowed from `string` (wire)
// to `'init' | 'optimization'` (domain); the ACL fails loudly per
// ADR-0002 if the wire reports anything outside that set.
//
// Owned at runtime by the `useQeubo` composable in
// `composables/useQeubo.ts`; declared here for accessibility by future
// consumers (toolbar, bookmarks UI, parameter-meta editor).

export type QeuboPhase = 'init' | 'optimization';

export interface QeuboExperiment {
  experimentId: string;
  config: Record<string, unknown>;
  controlledParameters: string[];
  phase: QeuboPhase;
  initIndex: number;
  numInitQueries: number;
  iteration: number;
  numAlgoQueries: number;
}

export interface QeuboStatus {
  experimentId: string;
  phase: QeuboPhase;
  initIndex: number;
  numInitQueries: number;
  iteration: number;
  numAlgoQueries: number;
  totalResponses: number;
  hasPending: boolean;
  pendingQueryUuid?: string;
}

export interface QeuboPair {
  queryUuid: string;
  pointA: number[];
  pointB: number[];
  valuesA: Record<string, number>;
  valuesB: Record<string, number>;
  phase: QeuboPhase;
  iteration: number;
  reissued: boolean;
}

export interface QeuboBest {
  point: number[];
  values: Record<string, number>;
  phase: QeuboPhase;
  iteration: number;
}

export interface QeuboPreferenceResult {
  phase: QeuboPhase;
  iteration: number;
  initIndex: number;
  totalResponses: number;
  completed: boolean;
}

export interface QeuboHistory {
  history: unknown[];
  phase: QeuboPhase;
  iteration: number;
  totalResponses: number;
}

export interface QeuboCreateInput {
  controlledParameters: string[];
  parameterRanges: Record<string, [number, number]>;
  configOverrides?: Record<string, unknown>;
}

// Discriminated error class. Three kinds get classified from HTTP
// status; everything else propagates as the generic `Error` thrown by
// `api-client.ts`. Consumers do `if (err instanceof QeuboError && err.kind === 'disabled') ...`.
export type QeuboErrorKind =
  | 'disabled'         // 503: QEUBO_ENABLED=False on this backend
  | 'no-experiment'    // 404: no experiment exists for this user
  | 'init-not-ready';  // 409 from /best: model not yet fitted

export class QeuboError extends Error {
  readonly kind: QeuboErrorKind;
  readonly status: number;
  constructor(kind: QeuboErrorKind, status: number, message: string) {
    super(message);
    this.name = 'QeuboError';
    this.kind = kind;
    this.status = status;
  }
}

export interface MintingSettings {
  defaultVisits: number;
  defaultNumMoves: number;
  defaultPaletteId: 'active' | string;
}

export interface NavigationSettings {
  actionOnDirtyBoard: 'ask' | 'new' | 'overwrite';
}

export interface AppSettings {
  engine: {
    katago: {
      url: string;
      analysis_env: AnalysisEnvironment;
    };
  };
  appearance: {
    theme: 'dark' | 'light';
    // Hue-rotation offset (degrees) applied uniformly across the
    // intensity gradient in CIELAB space. Default -43° is a
    // hand-applied orientation chosen for typical-trichromat
    // readability; users with different colour-vision profiles can
    // adjust via the slider in the Gradient Calibration view.
    intensityHueShift: number;
  };
  persistence: {
    debounceInterval: number;
  };
  minting: MintingSettings;
  navigation: NavigationSettings;
}

export interface UISession {
  activeTab: string;
  sidebarExpanded: boolean;
  treeExpanded: boolean;
  controlsExpanded: boolean;
  boardExpanded: boolean;
  // Persistent system-log bar below the top nav. Default true — hidden
  // only when the user explicitly unchecks it in the Session (UI) registry.
  systemLogExpanded: boolean;
  controlPanelWidth: number;
  // Release-scope item 7: user-controlled cap on the square board's
  // width, in pixels. The board column is height-driven via
  // aspect-ratio: 1/1; `boardSquareMaxWidthPx` puts an additional
  // upper bound, letting the user shrink the board (giving the
  // control panel more room) below the height-natural max. The
  // resizer drag mutates this. `undefined` = no cap; the board
  // saturates at column.height.
  boardSquareMaxWidthPx?: number;
  moveFilterThreshold: number;
  moveFilterExpression: string;
  analysisLayout: 'horizontal' | 'vertical';
  showMoveSuggestions: boolean;
  // Per-board PV-preview animation settings — surfaces the knobs of
  // `usePvAnimation` (mode / timings / opacity / annotation / cycle)
  // through the registry editor. Schema-version 10 introduced the
  // field and backfills existing blobs against `PV_DEFAULTS`. The
  // composable's hard-coded fallback remains as a safety net for
  // unconfigured callers.
  pvAnimation: PvAnimationSettings;
  // Per-metric board overlays. Each metric carries its own set of
  // orthogonal sub-toggles describing the visual mode(s) the user
  // wants applied to that data; multiple sub-modes may be
  // simultaneously enabled. Mutated in place via the keyboard
  // registry. The wire-flag plumbing in analysis-service consults
  // these to decide whether to request `includeOwnership` (and later
  // `includePolicy`) — any sub-toggle being on is sufficient.
  overlayLayers: {
    ownership: {
      // Adjacent gap-less squares filling empty intersections.
      // Reads as a continuous territory map.
      continuous: boolean;
      // Small discrete confidence markers at empty intersections.
      // Less visually dominant; useful alongside MoveSuggestions.
      dots: boolean;
      // Sign-inversion overlay on stones whose own colour disagrees
      // with the predicted ownership at their position. Highlights
      // dead stones; conveys liveness without territory clutter.
      liveness: boolean;
    };
  };
  activeCardSetId: string;
  // Per-tab ephemeral context for deck pipelines. Schema-version 11
  // moved `contextIds` off `CardSet` and onto these per-tab UI fields:
  // the deck is a pure strategy, the context is supplied at the call
  // boundary. SR's `startSession` reads `srContextIds`;
  // `ForestDirectory`'s Decks panel reads `databaseContextIds`. Edited
  // via simple comma-separated text inputs in each tab today; a roots
  // picker is queued separately.
  srContextIds: number[];
  databaseContextIds: number[];
  // Which view the qEUBO toolbar cluster is currently showing.
  // 'applied' = engine sees the persistent values from
  // analysis_env.parameters; 'A' / 'B' temporarily override what
  // the engine sees with the corresponding qEUBO point's decoded
  // values, without writing to analysis_env.parameters. Default
  // 'applied'. Mutated by the toolbar; consumed by useQeubo's
  // effectiveParameterValues computed.
  qeuboToolbarView?: 'applied' | 'A' | 'B';
}

export type CardId = Brand<number, 'CardId'>;
export type GameSourceId = Brand<number, 'GameSourceId'>;
export type CardSetKey = Brand<string, 'CardSetKey'>;
export type ReviewSessionId = Brand<string, 'ReviewSessionId'>;

// ── Value Objects (readonly preserved) — SR domain ────────────────────────────

export interface EbisuModel {
  readonly alpha: number;
  readonly beta: number;
  readonly t: number;
}

/**
 * A card surfaced to the SR session. Backend sources (`CardWithRecall` on
 * the wire) are translated through `BackendService::mapToReviewCard` into
 * this shape; everything that consumes a card downstream — the SR
 * composable, the lineage tree, the chart panels — sees only this type,
 * never the wire shape.
 *
 * ─── `gradingParameter` field (Commit 4 — closes TODO item 18) ───────────────
 * The opaque grading-parameter blob carries domain-specific configuration
 * for how the card's recall is graded — for KataGo cards, this includes
 * `default_visits`, `analysis_config` (the palette payload), and
 * `gamma`. The wire shape is `Record<string, any> | null`, intentionally
 * untyped on the OpenAPI boundary because the inner shape is application-
 * defined and changes more often than the schema. Surfacing it on the
 * domain type lets the SR composable read `currentCard.gradingParameter
 * ?.data?.analysis_config` to override the active palette per card,
 * without re-fetching the wire shape from anywhere downstream.
 *
 * `current_recall` and `halflife_units` (also part of item 18): the
 * backend computes these on every `CardWithRecall` response; surfacing
 * them lets the UI display "this card will be at 50% recall in N hours"
 * style diagnostics. Both are optional because they're snapshots at
 * read-time, not core card identity, and a card may be constructed
 * without them in test contexts.
 */
export interface ReviewCard {
  readonly id: CardId;
  readonly sgf: string;
  readonly numMoves: number;
  readonly parentId?: CardId;
  readonly model: EbisuModel;
  readonly lastReviewedAt: Date | null;
  readonly numReviews: number;
  readonly suspended: boolean;
  readonly defaultVisits: number;
  readonly gamma: number;
  // ─── Item 18 surfacing (Commit 4) ────────────────────────────────────────
  readonly gradingParameter?: Record<string, any> | null;
  readonly currentRecall?: number;
  readonly halflifeUnits?: number;
}

// ── State Container (readonly removed) — SR domain ────────────────────────────

// CardSet is mutated through the CardSetEditor. Decks are pure
// strategies (the DSL pipeline) — context (root card-id list) is
// supplied by the caller at execution time, lifted out of the deck
// declaration in schema-version 11. SR and Database tabs each carry
// their own context in `UISession.{sr,database}ContextIds`.
export interface CardSet {
  id: string;
  name: string;
  description: string;
  pipeline: any[];
}

// User-pinned snapshot of analysis_env.parameters values.
// Survives qEUBO experiment lifecycle (creating, replacing, or
// deleting an experiment does not affect the bookmark list). The
// id is generated frontend-side at pin time; createdAt is unix
// ms; parameters is a value-snapshot, not a reference.
export interface QeuboBookmark {
  id: BookmarkId;
  name: string;
  createdAt: number;
  parameters: Record<string, number>;
}

export interface ProfileState {
  id: ProfileId;
  username: string;
  settings: AppSettings;
  thumbnailSettings: ThumbnailSettings;
  cardSets: Record<string, CardSet>;
  knownTags: string[];
  qeuboPinnedBookmarks?: QeuboBookmark[];
}

export interface SessionState {
  id: SessionId;
  profileId: ProfileId;
  ui: UISession;
  reviews: Record<BoardId, ReviewSessionData>;
}

export interface GlobalStore {
  activeBoardIndex: number;
  boards: BoardState[];
  profile: ProfileState;
  session: SessionState;
  engine: EngineState;
}

export type EngineStatus = 'disconnected' | 'connecting' | 'connected';
export type AnalysisMode = 'none' | 'ponder' | 'analyze';

// ── Value Object (readonly preserved) — Authentication state ──────────────────
//
// Discriminated union over the five legitimate states of the SPA's auth
// identity. Constructors carry exactly the data each state needs; no
// impossible combinations are representable (no `authenticated` without
// a username; no `error` without a message). Owned at runtime by the
// `useAuth` composable in `composables/useAuth.ts`; declared here for
// accessibility by future consumers (UserBadge, LoginModal, etc.).
//
// Lifecycle:
//   unknown         → pre-bootstrap, no attempt yet made.
//   authenticating  → login/register call in flight.
//   authenticated   → JWT in localStorage; identity known.
//   unauthenticated → no token, idle. Reachable via logout (B4) or via
//                     a deliberate identity-clear (B5).
//   error           → last attempt failed; surfaced via system log;
//                     transient until the next attempt.
export type AuthState =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'authenticating' }
  | { readonly kind: 'authenticated'; readonly username: string; readonly userId?: number }
  | { readonly kind: 'error'; readonly message: string };

// ── Value Object (readonly preserved) — SystemMessage ─────────────────────────

export interface SystemMessage {
  readonly id: string;
  readonly type: 'error' | 'warning' | 'info';
  readonly text: string;
  readonly timestamp: number;
}

// ── State Container (readonly removed) — EngineState ──────────────────────────

export interface EngineState {
  status: EngineStatus;
  // `metrics` field is reassigned wholesale by analysis-service
  // (`store.engine.metrics = { ...metrics, packetsPerSecond: x }`); the
  // EngineMetrics value object inside is itself immutable. Mutable
  // container, immutable value.
  metrics: EngineMetrics;
  activeMode: Record<BoardId, AnalysisMode>;
  messages: SystemMessage[];
}

export type ReviewStatus = 'IDLE' | 'LOADING' | 'AWAITING_MOVE' | 'ANALYZING' | 'FINISHED';

// ReviewSessionData is mutated through `mutateReviewSession` in store/index.ts;
// the SR session writes back queue progression, scores, override values.
export interface ReviewSessionData {
  status: ReviewStatus;
  queue: ReviewCard[];
  currentIndex: number;
  startingNodeId: NodeId | null;
  userMovesCount: number;
  userMoveScores: number[];
  // Per-card sticky visits override. `null` means "no override, use the
  // card's defaultVisits." Set by the UI; reset to `null` by loadCard
  // when a new card becomes active (each card gets its own starting
  // point). Bang-bang semantics: once set, it persists across every
  // subsequent move within the same card until the user either changes
  // it again or advances to the next card.
  visitsOverride: number | null;
}

// ── Value Object (readonly preserved) — ReviewFeedback ────────────────────────

export interface ReviewFeedback {
  readonly finished: boolean;
  readonly acc: number;
  readonly discounted: number;
  readonly visitRatio: number;
  readonly nEff: number;
}

// ── Wire types (going outbound) — no readonly, mutable construction ───────────

export interface GameMetadataPayload {
  description?: string;
  player_white?: string;
  player_black?: string;
}

// ─── 34b: Wire-format rename ──────────────────────────────────────────────────
// `sgf` → `raw_content` (domain-neutral name for the serialized content).
// `default_visits` has moved off the top level; it now lives inside
// `grading_parameter.data`. See `composables/useMinting.ts::prepareDraft` for
// the construction site that places it there.
// ──────────────────────────────────────────────────────────────────────────────
export interface CardCreatePayload {
  raw_content: string;
  num_moves: number;
  grading_parameter: Record<string, any>;
  tags: string[];
  parent_card_id?: number;
  game_metadata?: GameMetadataPayload;
}

// ── Value Objects (readonly preserved) — backend-sourced stats ────────────────

export interface ForestStat {
  readonly root_card_id: number;
  readonly game_source_id: number;
  readonly description: string;
  readonly player_white: string;
  readonly player_black: string;
  readonly total_cards: number;
  readonly total_reviews: number;
  readonly average_recall: number;
}

export interface TagStat {
  readonly name: string;
  readonly count: number;
}

// ── Value Objects (readonly preserved) — Card-tree domain ─────────────────────
//
// Camel-case projections of the wire shapes for the two card-tree
// endpoints (POST /lineage/resolve-roots, POST /lineage/tree-by-root).
// The ACL at `services/backend-service.ts` translates between these and
// the generated `components['schemas']['*']` wire types from
// `types/backend.ts`. Branded ids (`CardId`, `GameSourceId`) replace
// raw `number` so the rest of the app cannot confuse a card id with a
// game-source id.
//
// The structure-only `CardLineageNode` mirrors the backend's `TreeNode`:
// `id` and `children` only, no per-card metadata. Per-card data
// (SGF, recall, palette etc.) is fetched separately via
// `fetchCard(cardId)` and merged in at the render boundary.

export interface CardLineageNode {
  readonly id: CardId;
  readonly children: CardLineageNode[];
}

export interface RootGroup {
  readonly rootCardId: CardId;
  readonly gameSourceId: GameSourceId;
  // Subset of the resolve-roots input that descends from this root, in
  // input order. Useful for the consumer that wants to associate
  // pipeline-result cards with the tree they belong in.
  readonly cardIdsInTree: CardId[];
}

export interface ResolveRootsResult {
  readonly roots: RootGroup[];
  // Input ids the backend could not match (not owned, or not present).
  // The wire contract guarantees `roots` ∪ `unmatchedCardIds` partitions
  // the original input — the caller can decide how loud to be about a
  // miss, but never has to wonder where an id went.
  readonly unmatchedCardIds: CardId[];
}

export interface CardLineageTree {
  readonly rootCardId: CardId;
  readonly gameSourceId: GameSourceId;
  readonly tree: CardLineageNode;
}

// Per-node role in the projected display tree (see card-tree-frontend-spec).
// `active` — present in the input active set; visually loud.
// `context` — not active, but on a path to an active descendant; quiet
//             default rendering ("structural connective tissue").
// `stub`    — single-subtree summary glyph for a cold region with a
//             real-card head; click expands.
// `bucket`  — synthetic node grouping multiple cold leaves of the same
//             parent into one glyph; click expands into individuals.
export type CardTreeNodeRole = 'active' | 'context' | 'stub' | 'bucket';

// Structured 422 from POST /lineage/tree-by-root. The backend reports
// `actual_size` exactly so the UI can say "this game has N nodes; cap
// is M — increase or narrow." Per ADR-0002, no silent truncation.
export class CardTreeOverflowError extends Error {
  readonly rootCardId: CardId;
  readonly actualSize: number;
  readonly maxNodes: number;
  constructor(rootCardId: CardId, actualSize: number, maxNodes: number) {
    super(
      `Card-tree at root ${rootCardId} exceeds max_nodes ` +
      `(actual ${actualSize} > cap ${maxNodes})`,
    );
    this.name = 'CardTreeOverflowError';
    this.rootCardId = rootCardId;
    this.actualSize = actualSize;
    this.maxNodes = maxNodes;
  }
}
