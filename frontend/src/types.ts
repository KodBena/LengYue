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
  RawAnalysis,
  Enrichment,
} from './engine/katago/types';

// ── Re-exports: PV animation settings shape ───────────────────────────────────
// Imported (not just re-exported) so `UISession.pvAnimation` can
// reference the alias locally; `export type … from` is a pure
// re-export and does not introduce the name into module scope.
import type {
  PvAnimationSettings,
  PvAnnotation,
  PvMode,
} from './composables/board/use-pv-animation';
export type { PvAnimationSettings, PvAnnotation, PvMode };

// ── Re-exports: i18n supported-locale union ───────────────────────────────────
// AppSettings.appearance.locale references SupportedLocale; the SSOT
// for the supported set lives next to the catalog registry in
// src/i18n/locales.ts. Re-exported here so consumers of the AppSettings
// shape don't need a second import path.
import type { SupportedLocale } from './i18n/locales';
export type { SupportedLocale };

// ── Re-exports: generated wire schemas ────────────────────────────────────────
// Imported here so this file can alias selected wire shapes under
// domain-friendly names. The generated module is the single source of
// truth for the wire boundary; re-exporting keeps consumers free of
// `components['schemas']['…']` boilerplate.
import type { components } from './types/backend';

// ── Type Branding Utilities ───────────────────────────────────────────────────
type Brand<K, T> = K & { readonly __brand: T };

export type BoardId    = Brand<string, 'BoardId'>;
export type NodeId     = Brand<string, 'NodeId'>;
export type ProfileId  = Brand<string, 'ProfileId'>;
export type SessionId  = Brand<string, 'SessionId'>;
export type BookmarkId = Brand<string, 'BookmarkId'>;

/**
 * Per-board store partitioning. A `Partial<Record<BoardId, T>>`: cells are
 * added lazily per board, torn down by `closeBoard` (each a teardown O-pair),
 * and cleared wholesale by `resetWorkspace`. The alias makes board-scope a
 * named, greppable property of the type — `grep 'PerBoard<'` enumerates every
 * per-board store surface. `Partial<>` (not bare `Record<>`) is load-bearing:
 * it keeps indexed reads honest about the `undefined`-after-delete contract
 * (ADR-0001 reflects runtime reality; ADR-0002 forbids the unjustified
 * bare-Record read). The board-scope analog of the backend's `user_id`
 * tenancy spec — see `frontend/docs/notes/board-scope.md`.
 */
export type PerBoard<T> = Partial<Record<BoardId, T>>;

/**
 * Stable identifier for a user-rebindable keyboard action. Branded
 * to prevent string typos from silently mis-routing key dispatch.
 * Naming convention: `<domain>.<verb>` (e.g., `nav.next`,
 * `display.toggleMoveNumbers`). Authoritative constructor and
 * registry live at `src/lib/keybindings.ts`. See
 * `docs/notes/keybindings-plan.md` for the substrate design.
 */
export type KeybindingActionId = Brand<string, 'KeybindingActionId'>;

/**
 * Derived content-hash bucket keys for the analysis ledger's two
 * provenance-stratified stores. These are NOT entity identities — they are
 * DJB2 hashes over a structured analysis descriptor, branded distinct so a
 * raw-store read cannot be issued with an enrichment key (or vice versa):
 * the wrong-key read becomes a compile error (ADR-0002, strongest channel).
 *
 * `RawKey` = hash(model + overrideSettings) — palette-independent.
 * `EnrichedKey` = hash(model + overrideSettings + palette).
 *
 * Sole construction site: `deriveAnalysisKeys` in
 * `services/analysis-config.ts` (no raw `as RawKey` casts at consumers).
 * Soundness: bucket keys, not collision-free identities — collision risk is
 * the DJB2 birthday bound, identical to the prior single composite hash.
 * See `IDENTIFIERS.md` ("Derived content hashes") and the stratification
 * consult under `docs/notes/consult/`.
 */
export type RawKey      = Brand<string, 'RawKey'>;
export type EnrichedKey = Brand<string, 'EnrichedKey'>;

/**
 * Ephemeral correlation id for an in-flight engine query — minted by the SPA,
 * echoed back by the proxy as the wire `id`, and used to correlate a query
 * across the analysis-service bookkeeping maps (activeQueries /
 * activeSubscriptions / restartCallbacks / boardToQueries) and the
 * queue-telemetry store. Session-scoped, not persisted. Sole factory:
 * `mintQueryId` / `asQueryId` in `services/query-id.ts`; the wire-response
 * `id` is re-branded to `QueryId` at the analysis-service correlation
 * boundary (a justified ACL cast — the proxy echoes back the SPA's own id).
 */
export type QueryId = Brand<string, 'QueryId'>;

/**
 * Identifier for a registered stability extractor (a fixed vocabulary: the
 * keys of `STABILITY_EXTRACTORS` in `engine/analysis/stability-extractors.ts`,
 * e.g. `scoreLead_sign`, `top1_move`). Branded so an extractor id can't be
 * confused with a metric id or a bare string in the stability composables and
 * the trajectory store's composite key. The `STABILITY_EXTRACTORS` map is the
 * authoritative vocabulary.
 */
export type ExtractorId = Brand<string, 'ExtractorId'>;

/**
 * Identifier for a registered stability metric (a fixed vocabulary: the keys
 * of `STABILITY_METRICS` in `engine/analysis/stability-extractors.ts`).
 * Branded as the symmetric sibling of `ExtractorId` so the two parallel
 * stability vocabularies can't be swapped.
 */
export type MetricId = Brand<string, 'MetricId'>;

/**
 * Discriminated expand-key for the card-tree view: either a stringified
 * `CardId` (a card row) or a `bucket:<cardId>` bucket header. Branded so the
 * dual-shape key can't be confused with a bare string or a `CardId`; the
 * shape discriminator (`isBucketKey`) and the factories
 * (`cardExpandKeyFor` / `bucketIdFor`) live in
 * `composables/cards/useCardTreeProjection.ts`. Persisted in
 * `CardTreeNavState.manuallyExpanded`.
 */
export type CardTreeExpandKey = Brand<string, 'CardTreeExpandKey'>;

/**
 * Stable identity of an analysis panel (the scrollable charts on the
 * Analysis tab). Frozen-forever: it is the persistence key by which an
 * `AnalysisTab` references a panel, so renaming one orphans any saved
 * tab that points at it. Canonical id values live in the SFC-free
 * `components/charts/panel-ids.ts`; the id→component registry is
 * `components/charts/panel-registry.ts`.
 */
export type AnalysisPanelId = Brand<string, 'AnalysisPanelId'>;

/** Stable identity of a user-defined analysis tab. */
export type AnalysisTabId = Brand<string, 'AnalysisTabId'>;

/**
 * A user-defined Analysis-tab: a named, ordered subset of the panel
 * registry. Persisted in `AppSettings.analysisTabs`; rendered one tab
 * at a time (inactive tabs' panels unmount). `panelIds` referencing a
 * panel no longer in the registry are dropped at resolution time
 * (ADR-0002 — a removed/renamed panel, logged not crashed).
 */
export interface AnalysisTab {
  readonly id: AnalysisTabId;
  label: string;
  panelIds: AnalysisPanelId[];
}

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
  maxVisitsTarget?: number;
  // Analysis-chart selection range as [startPly, endPly] indices into
  // the active variation path. Branded `[PlyIndex, PlyIndex]` so the
  // off-by-colour confusion the brand pair exists to prevent (a caller
  // passing a colour-local move-range here would be a compile error)
  // cannot recur. Mutated by `useAnalysisTimeline` via `mutateBoard`;
  // persisted across tab switches and board switches (BoardState
  // survives both). `undefined` means "use the default fit-to-path
  // range" — set on first observation of a non-empty variation.
  // Wire shape unaffected: brands erase at JSON serialisation, so
  // SyncService persistence is transparent. Release-scope item 2.
  analysisRange?: [PlyIndex, PlyIndex];
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

// EngineMetrics is a value object (immutable, swapped wholesale); the
// `metrics` *field* on EngineState below is mutable (the swap is the
// mutation). This is the idiomatic functional-state pattern.
export interface EngineMetrics {
  readonly packetsPerSecond: number;
  readonly lastResponseId: BoardId | null;
  readonly lastWatchdogTimestamp: number;
  readonly latencyMs: number;
  /**
   * Wall-clock ms at which the most recent watchdog `query_version`
   * was fired and has not yet received a response. `null` means
   * either no ping in flight (the last pong has arrived), or the
   * watchdog hasn't fired yet on this session. Used by the
   * Toolbar's optional ping-tandem watchdog-dot animation
   * (`session.ui.watchdogColorTransition`) — the animation runs
   * while this is non-null and resets on `null`.
   */
  readonly pingPendingSince: number | null;
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
//
// `delta_ordering` declares which direction of `delta_fn`'s output
// counts as worse (a mistake). SPA-side consumer-only — the proxy
// emits `extra.<color>.deltas` as the user-authored `delta_fn`
// returns it; this flag tells consumers (mistake-finder, future
// ranking composables) how to orient those scalars for severity.
// The substrate stays non-opinionated about `delta_fn`'s sign
// convention; the flag records the palette author's choice.
// See `docs/notes/mistake-finder-design-space.md` §Option α.
export interface AnalysisPalette {
  id: string;
  name: string;
  delta_fn: string;
  delta_ordering: 'lower_is_worse' | 'higher_is_worse';
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

// ── Knob registry (substrate-level) ───────────────────────────────────────────
//
// User-controllable variables in the SPA live in scattered places today
// (registry editor settings, the Other tab's hue slider, move-filter
// thresholds, per-card metadata, magic-literals residue). The knob
// registry is the substrate that brings them under one declaration
// vocabulary: each controllable variable is a `KnobDecl` declaring its
// input vector (R^N), output vector (R^K), the transform connecting
// them, and the widget shape that edits it. Consumers (the SPA UI's
// editor surfaces, qEUBO when active, autonomous-SR harnesses) sit
// above the substrate and read/write knobs through a stable interface.
//
// Phase 1 ships the type vocabulary, path-walk accessors, the
// named-transform library, and a seeded-empty registry on the profile.
// Phase 3+ promotes the originating-riddle scalars onto KnobDecls and
// wires the cross-domain editor surface. See
// `docs/notes/knob-registry-plan.md` for the full design.

/** Stable identifier for a registry-declared knob. */
export type KnobId = Brand<string, 'KnobId'>;

/**
 * Dot-separated path into the reactive `GlobalStore`, terminating at
 * a numeric leaf. v1 stays as `string`; the deferred v2 shape is a
 * `Path<GlobalStore>` discriminated union over the literal dot-paths
 * the store admits (so a renamed setting fails the typecheck at every
 * KnobDecl pointing at the old path). Until that lands, startup-time
 * validation in `src/lib/knobs.ts::validateRegistry` catches stale or
 * type-mismatched paths at one layer earlier than runtime.
 */
export type StorePath = string;

/**
 * UX taxonomy — categorises a knob by *where it lives in the user's
 * mental model*, not by *who might claim it*. The latter is
 * `ConsumerClaim.consumerId` plus `KnobDecl.qeuboControlled`; the
 * two are deliberately orthogonal per the substrate / consumer
 * split in `docs/notes/knob-registry-plan.md` §2.
 *
 * `'qeubo'` was a value here in the v1 spec; that was a category
 * error (consumer-name leaking into the domain enum) corrected on
 * 2026-05-14 — see
 * `docs/notes/postmortem-knob-registry-qeubo-domain-2026-05.md`.
 * `'palette'` is its successor: the analysis-environment / palette
 * subsystem where `analysis_env.parameter_meta`-derived knobs live.
 * qEUBO is one consumer that may hold a hard claim on palette
 * knobs during an experiment; that's `qeuboControlled` territory,
 * not `KnobDomain` territory.
 */
export type KnobDomain =
  | 'display'
  | 'engine'
  | 'review'
  | 'palette'
  | 'experimental';

/**
 * Closed widget enum. The substrate is widget-agnostic — the
 * `KnobDecl` declares the shape; the editor consumer maps shape to
 * widget per §6's dispatch policy. The slider widget is scalar-only
 * (`inputs.length === 1`) by construction; vector knobs require
 * bespoke widgets per their domain. Adding a new widget is a
 * frontend code change so dispatch stays exhaustively-checkable.
 */
export type KnobWidget =
  | 'slider'
  | 'gamut-picker'
  | 'two-d-pad'
  | 'matrix-editor';

/** One dimension of a knob's input vector. */
export interface KnobInputDecl {
  readonly range: readonly [number, number];
  /**
   * Optional sub-identifier disambiguating the dimensions of a
   * multi-input knob. When this knob is qEUBO-controlled the
   * wire key is `${id}.${subId}` per the predecessor plan's
   * encoding; for manual-only knobs the sub-identifier is editor
   * metadata only.
   */
  readonly subId?: string;
  readonly label?: string;
  /**
   * Optional cross-knob constraint: when set, the slider's
   * effective max is `min(range[1], readKnob(linkedKnob))` rather
   * than the static `range[1]`. The KnobSlider widget reads the
   * linked knob's value reactively, so the slider's max bound
   * tracks the linked knob's current value. The store leaf
   * itself is NOT auto-clamped — the user's preference is
   * preserved while the slider's effective range follows the
   * constraint. Wire-layer consumers should defense-in-depth
   * clamp at send time so the contract reaching the engine is
   * always coherent (see `analysis-service.ts`'s cadence-knob
   * sites for the worked example).
   *
   * `validateRegistry` (`lib/knobs.ts`) checks at startup that
   * any `maxFromKnob` reference resolves to an actual KnobDecl;
   * an unresolved reference is a loud failure per ADR-0002.
   *
   * Added 2026-05-15 with the KataGo cadence-knob pair
   * (`engine.first-report-during-search-after` bounded by
   * `engine.report-during-search-every`). One use case today;
   * the field is optional and absent on every existing decl.
   */
  readonly maxFromKnob?: KnobId;
  /**
   * Optional absolute lower bound, in the knob's native unit.
   * Distinct from `range[0]`: `range[0]` describes the knob's
   * intrinsic meaningful range from the SPA's perspective;
   * `minFloor` represents an external-constraint-induced lower
   * bound — typically an upstream protocol minimum or a
   * dependency-imposed limitation. The substrate keeps the two
   * separate so the SSOT for the upstream constraint is one
   * field rather than entangled with `range[0]`'s editorial
   * choice.
   *
   * When set, the KnobSlider widget's effective min is
   * `max(range[0], minFloor)` — drags below the floor pin to it.
   * The stored leaf is NOT auto-clamped (user preference is
   * preserved); the wire-layer consumer should
   * `Math.max(minFloor, …)` as defence-in-depth so the contract
   * reaching the dependency respects the floor regardless of
   * stored-leaf state. `analysis-service.ts`'s first-report-after
   * sites are the worked example: the KataGo protocol-documented
   * minimum (`KATAGO_FIRST_REPORT_FLOOR_S`) is exported from the
   * timing catalog (`lib/timing.ts`, §7) and clamped at send time.
   *
   * `validateRegistry` (`lib/knobs.ts`) checks that `minFloor` is
   * a finite number when present and (when both are set) does not
   * exceed `range[1]`. Per ADR-0002, an incoherent declaration is
   * a loud startup failure rather than a silent runtime fallback.
   */
  readonly minFloor?: number;
}

/**
 * One dimension of a knob's output vector. The path resolves into
 * the reactive store; `writeKnob` walks it and writes through Vue's
 * reactivity so downstream consumers (CSS variables, watchers, etc.)
 * respond the same way they do to manual edits.
 */
export interface KnobOutputDecl {
  readonly path: StorePath;
  readonly label?: string;
}

/**
 * Named transforms from the input vector (R^N) to the output vector
 * (R^K). Discriminated by `kind` so dispatch is exhaustively checked.
 * Parameter data the transform needs (the linear coefficient matrix,
 * the hue anchors, the luminance-arc waypoints) lives on the
 * discriminant itself rather than as code — adding a new instance is
 * a runtime data change, not a code change. The closed set of
 * `kind`s is what stays exhaustive.
 */
export type KnobTransform =
  | { readonly kind: 'identity' }
  | {
      readonly kind: 'linear';
      /** `K × N` coefficient matrix. `output[k] = Σ_n coefficients[k][n] * input[n]`. */
      readonly coefficients: readonly (readonly number[])[];
    }
  | {
      readonly kind: 'lockstep-hue-rotate';
      /**
       * Length-K vector of base hue anchors in degrees [0, 360). A
       * scalar input rotates every anchor by the same offset modulo
       * 360. Drives the theme-anchor case the predecessor plan
       * articulates.
       */
      readonly anchors: readonly number[];
    }
  | {
      readonly kind: 'fixed-luminance-arc';
      /**
       * Sequence of waypoints in the K-dimensional output space.
       * A scalar input in [0, 1] interpolates linearly through the
       * waypoints (with `t = 0` at `waypoints[0]`, `t = 1` at
       * `waypoints[waypoints.length - 1]`). Phase 1 uses linear
       * interpolation as the simplest correct implementation; a
       * later phase may refine to a perceptually-coherent arc
       * preserving CIELab luminance.
       */
      readonly waypoints: readonly (readonly number[])[];
    };

/** A registry-declared user-controllable variable. */
export interface KnobDecl {
  readonly id: KnobId;
  readonly label?: string;
  readonly domain: KnobDomain;
  readonly inputs: readonly KnobInputDecl[];
  readonly outputs: readonly KnobOutputDecl[];
  /**
   * Defaults to `{ kind: 'identity' }` when `inputs.length ===
   * outputs.length` and no transform is specified.
   */
  readonly transform?: KnobTransform;
  /**
   * Editor-side hint. Absent → derive from `inputs.length` plus
   * transform per the §6 dispatch policy.
   */
  readonly widget?: KnobWidget;
  /**
   * When `true` AND a qEUBO experiment is active, this knob
   * participates in the optimizer's search. When `false` or absent,
   * the knob is user-controlled-only.
   */
  readonly qeuboControlled?: boolean;
  /**
   * Optional render-order hint. Editor surfaces (the cross-domain
   * KnobRegistryEditor, the toolbar quick-access popover) sort by
   * ascending priority within each domain; `undefined` sorts last.
   * Smaller numbers render first — `priority: 0` is the user's
   * most-likely-needed knob.
   *
   * The field is also a hook for a future preference-learning
   * surface that promotes frequently-used knobs to lower numbers
   * automatically. Auto-promotion isn't shipped (a reordering that
   * happens behind the user's back would be jarring); the field
   * exists so that future consumer can write to it through the
   * same shape the user authors today.
   */
  readonly priority?: number;
}

/**
 * The persisted registry. Keyed by `KnobId` (as a string at the
 * `Record` type level; runtime values carry the brand). Phase 1
 * seeds empty; Phase 3+ populates as scalars promote off of
 * inline literals.
 */
export type KnobRegistry = Record<string, KnobDecl>;

/** Claim policy in the per-knob ownership state machine (§7). */
export type ClaimPolicy = 'hard' | 'soft';

/**
 * Active claim record held by a non-UI consumer (qEUBO during an
 * experiment, an autonomous-SR scenario, a test harness). Claims
 * are runtime-only — they live in the substrate's in-memory state,
 * never in the persisted profile.
 */
export interface ConsumerClaim {
  readonly consumerId: string;
  readonly policy: ClaimPolicy;
  /** Human-readable; surfaced in disabled-slider tooltips. */
  readonly reason?: string;
}

/** Return value of `claimKnob`. First-come-first-served arbitration. */
export type ClaimResult =
  | { readonly kind: 'acquired' }
  | {
      readonly kind: 'rejected';
      readonly reason: 'already-claimed';
      readonly holder: ConsumerClaim;
    };

/** Return value of `releaseKnob`. Only the holding consumer may release. */
export type ReleaseResult =
  | { readonly kind: 'released' }
  | {
      readonly kind: 'rejected';
      readonly reason: 'not-claim-holder';
      readonly holder: ConsumerClaim | null;
    };

/**
 * Caller identity for `writeKnobValue` — drives the per-state policy
 * dispatch. The SPA UI passes `{ kind: 'manual' }`; non-UI consumers
 * (qEUBO, autonomous-SR, test harnesses) pass their consumer id so
 * the substrate can verify they hold the claim.
 */
export type WriteContext =
  | { readonly kind: 'manual' }
  | { readonly kind: 'consumer'; readonly consumerId: string };

/**
 * Outcome of a policy-aware write. The four variants name the
 * states the substrate distinguishes:
 *
 *   - `written`: the write succeeded against an unclaimed knob, or
 *     a soft-claimed knob held by the writer, or a hard-claimed
 *     knob held by the writer. No side effects beyond the store
 *     mutation.
 *   - `written-after-soft-release`: a manual write on a soft-claimed
 *     knob; the substrate released the soft claim on the user's
 *     behalf (firing the standard claim-change event) before
 *     performing the write. The replaced claim is named so
 *     consumers can react.
 *   - `refused` / `hard-claim-held`: a manual write or a non-holder
 *     consumer write attempted against a hard-claimed knob. The
 *     store is unchanged.
 *   - `refused` / `consumer-not-claim-holder`: a consumer write
 *     attempted without holding the knob's claim. The store is
 *     unchanged. `activeClaim` names the current holder (null if
 *     unclaimed — consumer writes always require an active claim).
 */
export type WriteResult =
  | { readonly kind: 'written' }
  | {
      readonly kind: 'written-after-soft-release';
      readonly releasedHolder: ConsumerClaim;
    }
  | {
      readonly kind: 'refused';
      readonly reason: 'hard-claim-held';
      readonly holder: ConsumerClaim;
    }
  | {
      readonly kind: 'refused';
      readonly reason: 'consumer-not-claim-holder';
      readonly activeClaim: ConsumerClaim | null;
    };

/** Single argument to `ClaimChangeListener`. */
export interface ClaimChangeEvent {
  readonly knobId: KnobId;
  readonly previous: ConsumerClaim | null;
  readonly next: ConsumerClaim | null;
}

/**
 * Callback registered through `onClaimChange`. Fires synchronously
 * on every claim transition (claim, release, soft-release fallout
 * from a manual write).
 */
export type ClaimChangeListener = (event: ClaimChangeEvent) => void;

/** Returned by every `on…` subscriber registration. */
export type UnsubscribeFn = () => void;

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
  // Recall-discount γ baked into each newly-minted card's
  // `grading_parameter.data.gamma`. The MintCardModal exposes the
  // field per-card so the user can override at mint time; this
  // setting is the starting value the modal opens with. Matches the
  // `?? 0.9` fallback in `backend-service.ts::mapToReviewCard`'s
  // gamma read for legacy cards that lack the field.
  defaultGamma: number;
}

export interface NavigationSettings {
  actionOnDirtyBoard: 'ask' | 'new' | 'overwrite';
}

/**
 * Analysis-bundle wire-format choices. `'v1-json'` is the legacy
 * canonical-JSON wire (backend codec: json / json+gzip);
 * `'json-projected-v1'` is the cross/analysis-bundle-compression-v2
 * arc's lossless leaf (frontend projects + JSON-stringifies +
 * UTF-8s; backend brotli-wraps unconditionally for storage). See
 * `AppSettings.engine.katago.bundleCompressionScheme` below for
 * the contract and `services/analysis-bundle/encoder.ts` for the
 * encoder hierarchy. Tuple-then-type pattern mirrors
 * `WINRATE_FRAMINGS` in `engine/katago/types.ts`; consumers
 * (RegistryEditor's PATH_ENUMS, the auto-save composable) import
 * the const tuple directly so this declaration is the single
 * source of truth.
 */
/**
 * The user-facing registry values name the wire-format choice
 * (`'v1'` = legacy canonical-JSON, `'v2-projected'` = v2 with
 * the SPA-side projection encoder). The encoder's *internal*
 * scheme tag — the string the backend stores in
 * `format_descriptor.scheme` forever — is `'json-projected-v1'`
 * (declared in `services/analysis-bundle/encoder.ts`); the
 * registry-to-encoder mapping lives in
 * `analysis-persistence-service.ts::readCompressionScheme`.
 * Decoupling the two strings keeps the user-facing names
 * versionable (`'v2-projected'` may grow `'v2-projected-q4'`
 * later) without breaking the on-wire scheme tag's stable
 * identity.
 */
export const BUNDLE_COMPRESSION_SCHEMES = [
  'v1',
  'v2-projected',
  'v2-quantized',
  'v2-quantized-hifi',
  'v2-quantized-hifi-xor',
] as const;
export type BundleCompressionScheme = typeof BUNDLE_COMPRESSION_SCHEMES[number];

export interface AppSettings {
  engine: {
    katago: {
      url: string;
      // Proxy replay-cache control flags. Project verbatim to the
      // `cache` / `lookup_cache` / `replay_final_only` fields on
      // `KataGoAnalysisQuery` (see `engine/katago/types.ts` for the
      // authoritative wire-protocol semantics). Snake-case spelling
      // matches the wire vocabulary — the same convention `analysis_env`
      // follows for the same reason. All three default `false`: a fresh
      // install neither writes to the cache nor reads from it, and
      // observes the full anytime-optimization stream during any replay
      // it does perform. Users opt in via the registry editor:
      //   `cache: true` while running through SR queues to make
      //     re-visits cheap;
      //   `lookup_cache: true` to short-circuit known positions during
      //     qEUBO calibration sweeps;
      //   `replay_final_only: true` to suppress mid-search packets
      //     during cache replay (no effect when not replaying — i.e.
      //     when `lookup_cache: false` or on cache miss).
      // Read by `services/analysis-service.ts` at every `analyzeRange`
      // / `analyzeActiveNode` call site; closure capture is fine
      // because the restart-callback re-enters the same call path.
      cache: boolean;
      lookup_cache: boolean;
      replay_final_only: boolean;
      // Visibility toggle for the experimental analysis-persistence
      // panel (manual save / restore of analysis bundles per
      // BoardId; see services/analysis-persistence-service.ts and
      // components/AnalysisControls.vue). Camel-case rather than
      // snake_case because this is a frontend user-facing toggle,
      // not a wire-protocol field. Default `true`: the panel
      // surfaces in AnalysisControls.vue with a clearly marked
      // "experimental" tag and an inline tooltip explaining the
      // semantics, so testers can discover it without spelunking the
      // registry editor. Users who want to hide the panel — e.g.,
      // because the experimental scaffolding bothers them, or they
      // never use save/restore — can flip this to false via the
      // registry editor under engine → katago. The save action
      // itself is always manual regardless; the toggle controls only
      // the panel's visibility, not auto-save behaviour.
      analysisStorageEnabled: boolean;
      // Auto-save toggle for the experimental analysis-persistence
      // feature. When `true` AND `analysisStorageEnabled` is also
      // `true`, the SPA debounces a `PUT /analysis-bundles/{boardId}`
      // after every authoritative (final-packet) ledger record for
      // that board, so the user no longer has to click Save manually.
      // Default `false`: opt-in. The toggle is itself experimental —
      // it inherits the persistence feature's warning surface (the
      // `?` tooltip on the persist-box and the `⚠` glyph on the
      // registry-editor leaf), with an additional callout about the
      // continuous bandwidth / quota cost of continuous saving.
      //
      // Gating: auto-save is only active when both
      // `analysisStorageEnabled` AND `analysisAutoSave` are true. The
      // first is the panel-visibility / overall feature toggle; the
      // second is the manual-vs-automatic distinction. Flipping
      // `analysisStorageEnabled` off implicitly disables auto-save
      // (no save path exists for the user to see anyway).
      //
      // Trigger semantics: the auto-save composable
      // (`composables/useAutoSaveAnalyses.ts`) watches a per-BoardId
      // dirty counter (incremented by `analysis-service.ts` on every
      // `!response.isDuringSearch` ledger.record call) and debounces
      // the actual `save()` by `AUTO_SAVE_DEBOUNCE_MS` (see the
      // composable). During-search previews don't trigger saves —
      // only the authoritative finals do — so a burst of analyze
      // updates produces at most one save per debounce window.
      //
      // Failure handling: per ADR-0002's fail-loud-on-expensive-ops
      // calibration, persistent quota / too-large failures disable
      // auto-save in-memory (per board, until either a manual save
      // succeeds or the user toggles the leaf off and back on),
      // surfacing the error in the persist-box rather than
      // re-firing on every subsequent record. The toggle itself
      // stays true so the user's preference isn't silently flipped.
      analysisAutoSave: boolean;
      // Wire-format choice for analysis-bundle persistence. The
      // 'v1-json' value preserves the historical wire shape (the
      // backend's `json` / `json+gzip` codecs round-trip canonical
      // JSON record arrays). 'json-projected-v1' (the
      // cross/analysis-bundle-compression-v2 arc's lossless leaf)
      // projects each packet through the SPA's typed-shape allow-
      // list before upload, dropping fields the SPA doesn't read
      // (`scoreStdev`, `scoreMean`, per-move `ownership`, etc.) —
      // backend brotli-wraps the projected bytes unconditionally
      // for further storage win.
      //
      // Default `'v1-json'`: existing users see no behavioural
      // change until they explicitly opt into the projected scheme
      // via the registry editor. The 'v1-json' tag IS the v1 wire
      // shape; flipping to it later from 'json-projected-v1'
      // returns the SPA to verbatim canonical-JSON upload. v2-side
      // stored rows decode-on-read regardless of this toggle — the
      // server-side `format_descriptor` is the read-time discriminator.
      //
      // Loss profile of 'json-projected-v1': reconstruction is
      // bit-identical for every field the SPA's typed shape
      // declares. Fields the SPA *never reads* are dropped on
      // encode and absent on decode; the SPA's runtime path
      // therefore sees no behaviour change. A CI gate in
      // `services/analysis-bundle/projection.ts` enforces that the
      // allow-list stays in sync with the typed shape — adding a
      // key to `KataMoveInfo` (etc.) without registering it in the
      // allow-list is a build error at `vue-tsc -b`.
      //
      // Design rationale at
      // `docs/notes/analysis-bundle-compression-plan.md`. The set
      // of accepted values is exported as the const tuple
      // `BUNDLE_COMPRESSION_SCHEMES` below — the RegistryEditor's
      // `PATH_ENUMS` table imports it (the same pattern as
      // `WINRATE_FRAMINGS`) so the dropdown options stay in sync
      // with this type union without separate hand-listing.
      bundleCompressionScheme: BundleCompressionScheme;
      // Whether the analysis-service ACL injects the `transposition`
      // capability into outgoing analysis queries (proxy v1.0.14+
      // capability-negotiation contract). When the proxy advertises
      // `transposition` in its `query_version` capabilities AND this
      // toggle is on, the proxy's `transposition_enricher` Transformer
      // engages on each query, producing the `clusterId` field on
      // `KataMoveInfo` consumed by the cluster-rings overlay
      // (`MoveSuggestions.vue` gated on `session.ui.showTranspositionRings`).
      //
      // Two independent toggles by deliberate separation of concerns:
      //   - `engine.katago.useTransposition` (this one) — wire request:
      //     does the proxy do the work? Costs the Python↔C++ boundary
      //     when on. Persisted with the user's profile (a calibration
      //     concern).
      //   - `session.ui.showTranspositionRings` — rendering: does the
      //     overlay paint the rings? Pure UI; persisted with the
      //     session UI.
      //
      // Default `true` preserves pre-v1.0.14 behaviour (proxy
      // unconditionally engaged the Transformer when wired); users
      // who don't want the boundary cost can flip via the registry
      // editor.
      //
      // ADR-0002 surfacing path: when the toggle is on but the proxy
      // does NOT advertise the `transposition` capability (a v1.0.14+
      // proxy with the module not compiled in, or
      // `PROXY_ADVERTISE_CAPABILITIES=true` but the wiring absent),
      // the analysis service pushes a one-shot system message naming
      // the unmet capability so the user knows their toggle isn't
      // being honoured. Wire request is omitted in that case (no
      // point asking for what the proxy doesn't have).
      //
      // Schema-version 29 introduces this field; the migration
      // backfills `true` on existing blobs to preserve behaviour.
      useTransposition: boolean;
      // User-controlled opt-in for the proxy's adaptive_reevaluate
      // middleware (proxy v1.0.14+ capability) plus the per-query
      // metadata schema overrides. Surfaced as a checkbox + two
      // number inputs in the analysis tab, gated on the proxy
      // actually advertising `adaptive_reevaluate` (no UI noise on
      // proxies that can't honour it). When `enabled` is true and
      // the query is live + range-based, the analysis-service ACL
      // injects `adaptive_reevaluate: { worst_quantile, extra_visits }`
      // into the per-query capabilities dict. Review-session queries
      // (analyzeRange called with `forReview=true` from
      // `useReviewSession.processUserMove`) and turn-locked queries
      // (analyzeActiveNode) always omit it regardless of `enabled`,
      // because the middleware's mid-stream follow-ups would either
      // inflate the visit count beyond the card's defaultVisits
      // (corrupting review-session grading) or be structurally
      // inappropriate for a single-turn target.
      //
      // Default off — adaptive's deeper-analysis follow-ups change
      // the visit count of resulting packets in ways that surprise
      // any consumer expecting a specific maxVisits, so opt-in is
      // explicit.
      //
      // worstQuantile defaults to 0.05 (top 5% of moves get re-
      // evaluated, more conservative than the proxy's 0.25 default
      // — the SPA's review-session palettes already pick out the
      // user's worst moves separately, so a tighter quantile here
      // avoids double-attention on the same positions).
      // extraVisits defaults to 800 (matches proxy default;
      // increment-not-absolute, so KataGo's NN cache continues
      // search from where the original left off).
      //
      // Schema-version 30 introduces this field; the migration
      // backfills `{ enabled: false, worstQuantile: 0.05,
      // extraVisits: 800 }` on existing blobs.
      adaptiveReevaluate: {
        enabled: boolean;
        worstQuantile: number;
        extraVisits: number;
        // v1.0.26 — Phase 3.5 learned value-function opt-in.
        // Empty string `""` (or `"default"`) means "use the proxy's
        // built-in v1.0.24 worst-quantile allocation; no Phase 3
        // fields sent." A `learned_*` string opts into the
        // proxy-hosted LightGBM predictor with that version name
        // (e.g. `"learned_v1"`); the SPA verifies the name appears
        // in `adaptive_reevaluate.available_value_bindings` before
        // sending it, hiding the dropdown option otherwise.
        // Defaults to `""` for backward compatibility.
        //
        // Schema-version 31 introduces this field; the migration
        // backfills `""` on existing blobs.
        valueBinding: string;
      };
      // Ceiling on ponder mode's KataGo `maxVisits`. Ponder runs
      // indefinitely on the engine side; this is the practical
      // backstop that prevents a strong network on a fast GPU from
      // accumulating an unbounded visit count over a long session
      // (and, more relevantly to the default's choice, prevents the
      // pre-v1.0.20 ceiling of 100,000 from making a weak network on
      // a CPU-only setup hit the cap in seconds). User-tunable via the
      // registry editor under engine → katago; default 2,000,000.
      //
      // Single source of truth for ponder-depth across three
      // consumer sites:
      //   - `services/analysis-service.ts` — passed as `maxVisits`
      //     in the wire query for ponder mode (the actual KataGo-
      //     side ceiling on per-query search depth).
      //   - `components/charts/AnalysisTimelinePanel.vue` — caps
      //     the visits-input's HTML `max` attribute so the user
      //     cannot request a one-shot range analyze deeper than
      //     the ponder ceiling permits.
      //   - `components/BoardTab.vue` — uses it as the floor for
      //     the analysis-meter rugplot's intensity-gradient
      //     target, so the meter doesn't saturate instantly when
      //     the user hasn't run a range analysis.
      //
      // The pre-v1.0.20 shape had a hardcoded `PONDER_MAX_VISITS`
      // constant (100,000) in `engine/constants.ts` consumed by
      // the same three sites; v1.0.20 surfaces the value as a
      // registry-tunable setting and removes the constant.
      //
      // Schema-version 31 introduces this field; the migration
      // backfills 2,000,000 on existing blobs.
      ponderMaxVisits: number;
      /**
       * Watchdog ping-tandem keyframe duration in milliseconds
       * (knob-registry Phase 3a). The CSS keyframe in
       * `Toolbar.vue::.watchdog-dot.watchdog-pinging` animates
       * green → red over this duration when a ping is in flight,
       * via a `--watchdog-animation-ms` CSS custom property bound
       * to this leaf. Promoted from the hardcoded keyframe
       * duration; the `engine.watchdog-animation-ms` KnobDecl
       * drives it. Schema-version 36 → 37 backfills the field;
       * default 500.
       */
      watchdogAnimationMs: number;
      /**
       * Watchdog latency-threshold in milliseconds (knob-registry
       * Phase 6 sweep). In the un-animated watchdog mode (when
       * `session.ui.watchdogColorTransition` is false), the dot
       * flips red when the most-recent ping's round-trip latency
       * exceeds this value. In the animated mode the threshold is
       * conceptually independent — the keyframe sweeps over
       * `watchdogAnimationMs` regardless — but historically the
       * two defaulted to the same 500 ms by design, tying the
       * animation's full-saturation moment to "the engine is
       * taking long enough to be concerning." Users on slow
       * networks can raise this to avoid spurious red-flash;
       * users wanting tighter latency feedback can lower it.
       * Promoted from `Toolbar.vue`'s prior
       * `WATCHDOG_LATENCY_THRESHOLD_MS` const. Default 500;
       * range [50, 5000]. Schema-version 39 → 40 backfills.
       */
      watchdogLatencyThresholdMs: number;
      /**
       * KataGo `reportDuringSearchEvery` cadence in seconds — wire
       * field on every analyze query that streams intermediate
       * packets. Replaces the prior hardcoded 0.15 (ponder) / 0.5
       * (analyze) literals in `analysis-service.ts`; the single
       * registry-driven value applies to both modes per the user's
       * 2026-05-15 simplification choice. Bound through the
       * `engine.report-during-search-every` KnobDecl. Default 0.15;
       * range [0.01, 4.0]. Schema-version 41 → 42 backfills.
       */
      reportDuringSearchEvery: number;
      /**
       * KataGo `firstReportDuringSearchAfter` cadence in seconds —
       * wire field controlling when KataGo emits the FIRST in-
       * search report for an analyze query, independent of the
       * subsequent `reportDuringSearchEvery` cadence. A small value
       * here closes the perceived "delay until first packet"
       * friction on fresh ponder queries against unevaluated
       * positions. Bound through the
       * `engine.first-report-during-search-after` KnobDecl, whose
       * `inputs[0].maxFromKnob` constrains it to be ≤ the cadence
       * above (semantically: first-report-after a value larger
       * than the cadence would delay first-paint past what would
       * have been the second regular report). Default 0.05; range
       * [0.001, 4.0]. Schema-version 41 → 42 backfills.
       */
      firstReportDuringSearchAfter: number;
      // Engine-side runtime overrides forwarded verbatim to KataGo as
      // the Analysis Engine's `overrideSettings` field. Documented at
      // the wire-shape boundary on `KataGoAnalysisQuery` in
      // `engine/katago/types.ts`; this entry is the registry-editable
      // container the user mutates. Shape is `Record<string, unknown>`
      // because the accepted-key set is engine-version-dependent and
      // the surface here is intentionally an open dynamic node in
      // RegistryEditor (add / remove keys, not a fixed-leaf form).
      //
      // A small set of keys carries frontend-side meaning and is
      // typed via dedicated unions in `engine/katago/types.ts`
      // (`WinrateFraming` for `reportAnalysisWinratesAs` is the
      // current entry); RegistryEditor's `PATH_ENUMS` table mirrors
      // these so the user gets a dropdown for the typed slots and
      // free-text for the rest. Adding a new typed key: declare its
      // union in `engine/katago/types.ts`, append a `PATH_ENUMS`
      // entry rooted at `engine.katago.overrideSettings.<key>`.
      //
      // Defaults seeded in `store/defaults.ts`; backfilled by the
      // schema-version 27 → 28 migration. Read by
      // `services/analysis-service.ts` at every analyze call site,
      // conditionally spread (an empty object is omitted from the
      // wire so the user clearing every key falls back to KataGo's
      // config-file values rather than overriding them with a no-op).
      overrideSettings: Record<string, unknown>;
      analysis_env: AnalysisEnvironment;
    };
  };
  appearance: {
    // Active chrome theme. Mirrored onto `<html data-theme="...">`
    // by useAppBootstrap, which resolves theme.css's
    // `[data-theme="X"]` block. The historical `'light'` value was
    // declared but never wired to anything; schema-version 15
    // retired it (a migration coerces existing `'light'` blobs to
    // `'dark'`) and added `'cluster'` as a real second theme
    // (cluster-12-mapped light variant). Adding a new theme:
    // extend this union, add a `[data-theme="X"]` block in
    // theme.css, extend RegistryEditor's PATH_ENUMS, append a
    // migration if a prior valid value retires.
    theme: 'dark' | 'cluster';
    /**
     * MiniBoard thumbnail renderer (the analysis-chart preview boards + the
     * multiresolution heatmap preview). `'svg'` is the declarative SVG
     * projection (default; slightly more prominent last-move ring); `'canvas'`
     * is the ADR-0010 canvas projection (lighter paint/jank at high stone
     * counts — measured in a live Firefox profile). Only the chosen renderer
     * mounts (`MiniBoard.vue` dispatches on this), so neither path's performance
     * is affected by the other. Selectable via the RegistryEditor enum dropdown
     * (extend PATH_ENUMS for a new value). Schema-version 55 → 56 backfills
     * `'svg'`.
     */
    miniBoardRenderer: 'svg' | 'canvas';
    // Hue-rotation offset (degrees) applied uniformly across the
    // intensity gradient in CIELAB space. Default -43° is a
    // hand-applied orientation chosen for typical-trichromat
    // readability; users with different colour-vision profiles can
    // adjust via the slider in the Gradient Calibration view.
    intensityHueShift: number;
    /**
     * Ceiling on the territory-overlay opacity (knob-registry Phase 3a).
     * `BoardWidget.vue::ownershipColor` caps the rendered opacity at
     * this value so even fully-owned points don't visually dominate
     * the board grid and stones beneath. Promoted from a hardcoded
     * 0.55 literal to a registry leaf; the `display.ownership-opacity-ceiling`
     * KnobDecl drives it. Default 0.55 (matches the prior literal so
     * the promotion is behaviourally invisible until the user adjusts).
     * Schema-version 36 → 37 backfills the field.
     */
    ownershipOpacityCeiling: number;
    /**
     * Dead-band threshold for the territory overlay (knob-registry
     * Phase 6 sweep). Below this absolute magnitude the engine's
     * ownership signal is too weak to render — paints transparent
     * to prevent flicker as confidence wavers around 0. Default
     * 0.05; range [0, 1]. Promoted from `BoardWidget.vue::ownershipColor`'s
     * prior `if (mag < 0.05)` literal. Schema-version 39 → 40
     * backfills the field.
     */
    ownershipDeadbandThreshold: number;
    /**
     * Liveness-marker threshold (knob-registry Phase 6 sweep).
     * Stones with engine-disagreement magnitude below this aren't
     * flagged as dead; below it the engine is genuinely undecided
     * about the region and the highlight would flicker as packets
     * arrive. Default 0.3; range [0, 1]. Promoted from
     * `BoardWidget.vue`'s prior `LIVENESS_THRESHOLD` const.
     * Schema-version 39 → 40 backfills the field.
     */
    livenessThreshold: number;
    /**
     * Mistake-finder severity quantile threshold ∈ [0, 1]. The
     * mistake-finder composable surfaces dots on the delta charts
     * for moves whose oriented `delta_fn` output (oriented by the
     * palette's `delta_ordering`) lands in the worst per-board
     * quantile: 0.15 means "show the worst 15% of moves on this
     * board". 0 disables the overlay entirely. Per-board (not
     * per-color), so a quiet game has fewer dots and a chaotic
     * game more — the threshold is a display calibration, not a
     * substrate constant. Wired through the
     * `display.mistake-finder-threshold` knob. Default 0.15.
     */
    mistakeFinderThresholdQuantile: number;
    /**
     * Fade duration (ms) for the suggestion-ring outline + suggestion-
     * disk opacity transitions in `MoveSuggestions.vue`. Promoted from
     * a hardcoded `transition: opacity 60ms ease` inline literal that
     * the magic-literals audit (Pass 2) had left deferred — the
     * calibration concern named in `deferred-items.md`'s
     * PV-overlay-typography-proportions entry is satisfied by
     * surfacing the value as a user knob (the user is now the one
     * choosing the calibration, so internal pairwise-tuning no longer
     * applies).
     *
     * Range [0, 200] ms; 0 = no animation (CSS interprets `0ms ease`
     * as a no-op — the value snaps without an intermediate frame).
     * Default 60 preserves the prior behaviour.
     *
     * Knob: `display.move-suggestions-fade-ms`.
     * Schema-version 46 → 47 backfills this field.
     */
    moveSuggestionsFadeMs: number;
    // Active UI locale. Mirrored onto `<html lang="...">` and
    // `i18n.global.locale.value` by useAppBootstrap. Schema-version
    // 24 introduces this field; the migration backfills existing
    // workspace blobs with the user-agent's preferred locale via
    // `detectBrowserLocale()`. The supported set is the union of
    // catalogs registered in src/i18n/index.ts; SUPPORTED_LOCALES
    // in src/i18n/locales.ts is the SSOT. Adding a locale: extend
    // SUPPORTED_LOCALES, add a JSON catalog under src/locales/,
    // register it in src/i18n/index.ts. Adding a value here NOT in
    // the supported set is a real ADR-0002 violation; the
    // composable's defensive resolver catches it but the type
    // should agree with the runtime contract.
    locale: SupportedLocale;
  };
  persistence: {
    debounceInterval: number;
  };
  minting: MintingSettings;
  navigation: NavigationSettings;
  /**
   * User-controllable-variable registry. Each entry is a `KnobDecl`
   * declaring the input/output vector, transform, and editor widget
   * for one controllable variable. Phase 1 of the knob-registry arc
   * seeds this empty; later phases populate it as the cross-domain
   * editor and promotion sweep land. The empty-default + idempotent
   * migration shape means existing consumers see a no-op until a
   * KnobDecl points at a path they read. See
   * `docs/notes/knob-registry-plan.md` for the design.
   */
  knobs: KnobRegistry;
  /**
   * User overrides for keybinding actions. Sparse map keyed by
   * `KeybindingActionId` — absence means "use the registry's
   * `defaultKey`"; explicit `null` means "user has unbound this
   * action even though it has a default". The registry itself
   * (`src/lib/keybindings.ts::KEYBINDINGS_REGISTRY`) holds the
   * authoritative action list with their default keys; this
   * field stores only the deltas the user has authored. Per the
   * keybindings-plan design, fresh installs serialise to `{}`
   * (defaults rule); migration 52 → 53 backfills the same on
   * legacy persisted blobs.
   */
  keybindings: Partial<Record<KeybindingActionId, string | null>>;
  /**
   * User-defined Analysis-tab layout: an ordered list of tabs, each a
   * named, ordered subset of the panel registry. The default (migration
   * 54 → 55 / `defaults.ts`) is the four-tab Basic / Distributions /
   * Stability / Multiresolution split. Phase 3's Settings editor mutates
   * this; the dashboard renders only the active tab.
   */
  analysisTabs: AnalysisTab[];
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
  // Render the move-number on every placed stone in the active
  // variation. Toggled from StatusBar's "#" button; default off
  // because the numbers can crowd the board on long games.
  // Setup stones (root AB/AW properties) get no number — they
  // have no move ordinal to display.
  showStoneMoveNumbers: boolean;
  // When true, the SGF-load path (file-upload via `useSgfLoader`)
  // post-walks the freshly-loaded board to the leaf of its active
  // variation. The user lands on the final position of the
  // mainline instead of the root — natural for "open a complete
  // game from disk" exploration, opt-in because card-load flows
  // and review sessions intentionally start at a specific
  // position rather than the leaf. Default false preserves
  // pre-feature behaviour. Toggled via the Settings tab's
  // `RegistryEditor` over `store.session.ui`.
  loadSgfAtLastNode: boolean;
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
  // Single ephemeral context for deck pipelines. The deck is a pure
  // strategy; the context is supplied at the call boundary. The
  // `Cards` tab (formed by merging the prior SR and Database tabs)
  // reads this for both pipeline runs and review-session starts;
  // schema-version 16 collapsed the prior per-tab `srContextIds` and
  // `databaseContextIds` into this single field as part of the tab
  // merge. Per-board scoping was considered and parked: today's
  // workflow has the user adjusting context-ids occasionally, not
  // tab-by-tab. Edited via a simple comma-separated text input in
  // the Cards tab.
  cardsContextIds: number[];
  // Which view the qEUBO toolbar cluster is currently showing.
  // 'applied' = engine sees the persistent values from
  // analysis_env.parameters; 'A' / 'B' temporarily override what
  // the engine sees with the corresponding qEUBO point's decoded
  // values, without writing to analysis_env.parameters. Default
  // 'applied'. Mutated by the toolbar; consumed by useQeubo's
  // effectiveParameterValues computed.
  qeuboToolbarView?: 'applied' | 'A' | 'B';
  // Board-overlay rendering posture for sibling variations from
  // the current node. Surfaced by `BoardVariationsOverlay.vue`.
  //   'off'     — no variation markers rendered.
  //   'circles' — each sibling variation = colored stroke-only
  //               ring, cycling through a small palette of
  //               distinct hues. Outline-only (not a filled disc)
  //               so the marker overlays cleanly with
  //               `MoveSuggestions`'s filled discs and stays
  //               visually distinguishable from them.
  //   'letters' — same colored ring as 'circles', plus a centered
  //               letter label A, B, C... in the matching tint.
  //               A is the first non-active sibling (declaration
  //               order); the active child never gets a letter.
  // Distinct from `showMoveSuggestions` (which gates KataGo's
  // analysis overlay): this is the user's own game-tree state, not
  // engine analysis. Independent of `showActiveNextMove` (below);
  // the two settings compose. Schema-version 18 introduces the
  // field.
  boardVariations: 'off' | 'circles' | 'letters';
  // Whether to render a hint marker at the next move on the active
  // path (the position the variation widget would land at if the
  // user advanced one step). When true, draws a gray stroke-only
  // ring at that intersection. Independent of `boardVariations`:
  // the user can have variations on without the active marker, or
  // vice versa, or both, or neither. Default `true` (common GUI
  // posture); users who find the marker noisy disable it via the
  // Session (UI) registry. Schema-version 19 introduces the field.
  showActiveNextMove: boolean;
  // Whether `MoveSuggestions` paints its solid colored ring around
  // moves that participate in a multi-tenant cluster (a
  // transposition — multiple distinct positions reachable via
  // different move orders that converge to the same node, surfaced
  // by the proxy's clustering pass and consumed via
  // `KataMoveInfo.clusterId`). Default `true` preserves the
  // pre-feature behaviour. Schema-version 20 introduces the field.
  // The variations overlay's dashed-stroke ring shape is chosen
  // specifically to compose with the solid transposition ring when
  // both are visible at the same intersection.
  showTranspositionRings: boolean;
  // Whether the Toolbar's WATCHDOG dot fades smoothly when its
  // colour flips (green ↔ red on the 500ms-latency threshold) or
  // switches instantly. Pure rendering preference — the watchdog
  // sampling cadence (5000ms poll of `query_version`) and the
  // threshold are unaffected. Default true (the transition is
  // less startling than the instant flip during concurrent
  // queries that briefly push proxy command-queue latency past
  // the threshold); users who find the fade distracting can
  // opt out via the registry editor. Schema-version 34
  // introduces the field.
  watchdogColorTransition: boolean;
  // Forest Directory navigator state — which game nodes are expanded
  // (showing their roots) and which game/root the user has selected.
  // Schema-version 21 introduces the field. Persisted across reloads
  // per the file-manager idiom users expect; collapsed games stay
  // collapsed. Mutated through `useForestNavigation`'s named
  // mutators (toggle / expandAll / collapseAll / select). See the
  // `ForestNavState` declaration above for the persistence shape and
  // `composables/useForestNavigation.ts` for the render-shape
  // projection.
  forestNav: ForestNavState;
  // Per-board card-tree navigator state — persists the manual-expand
  // axis the `CardTreeWidget` mutates on stub / bucket clicks so a
  // board re-opened mid-session (or in a fresh browser session)
  // restores the user's exploration path through the card forest.
  // Schema-version 45 introduces the field. See `CardTreeNavState`
  // declaration below for the persistence shape. Per-board cleanup
  // fires from `closeBoard` (audit pair O14); `resetWorkspace`
  // clears the whole dictionary via the `defaultSessionUI` reset.
  // Per-slot cleanup also fires from `useCardTreeData::reset` so the
  // user's exploration choices clear alongside the data they were
  // applied to — they are no longer meaningful against the new
  // forest.
  cardTreeNav: PerBoard<CardTreeNavState>;
}

export type CardId = Brand<number, 'CardId'>;
export type GameSourceId = Brand<number, 'GameSourceId'>;
export type CardSetKey = Brand<string, 'CardSetKey'>;
export type ReviewSessionId = Brand<string, 'ReviewSessionId'>;

// ── Forest Directory navigator persistence (UISession.forestNav) ─────────────
//
// String-discriminated id for navigator tree nodes. Template-literal
// type so the discriminator (`game:` / `root:`) is a structural
// property of the value, not a convention. Serializable to JSON via
// SyncService for cross-reload persistence.
export type NavNodeId = `game:${number}` | `root:${number}`;

// The user's current selection in the Forest navigator. `null` = no
// selection (right-pane shows empty state). The discriminated union
// matches the navigator's two selectable kinds; widening to add a
// `'card'` variant later will require both a schema migration and
// a composable update — the persistence and render layers stay in
// lockstep on the union shape.
export type NavSelection =
  | { readonly kind: 'game'; readonly gameSourceId: GameSourceId }
  | { readonly kind: 'root'; readonly rootCardId: CardId };

// Persisted navigator state on `session.ui.forestNav`. Schema-version
// 21 introduces this field. `expanded` is an array (not a Set) so it
// JSON-round-trips through SyncService cleanly; the composable
// projects it into a ReadonlySet for O(1) lookup at render time.
// Persistent state — collapsed games stay collapsed across reloads
// per the file-manager idiom users expect.
export interface ForestNavState {
  expanded: NavNodeId[];
  selection: NavSelection | null;
}

// ── Card-tree navigator persistence (UISession.cardTreeNav) ──────────────────
//
// Per-board manual-expand state for the `CardTreeWidget`. Keys come
// from the projection's two key shapes (see `useCardTreeProjection.ts`):
// `String(cardId)` for individual card expansion (cold internals
// revealed by stub-click) and `bucket:${parentCardId}` for cold-leaf
// bucket expansion. Schema-version 45 introduces the field.
//
// Array (not Set) so the value JSON-round-trips through SyncService
// cleanly; `useCardTreeData::manualExpand` projects it into a
// `ReadonlySet<string>` for the `useCardTreeProjection` contract.
export interface CardTreeNavState {
  manuallyExpanded: CardTreeExpandKey[];
}

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
 * ─── `gradingParameter` field (Item 18) ──────────────────────────────────────
 * The opaque grading-parameter blob carries domain-specific configuration
 * for how the card's recall is graded — for KataGo cards, this includes
 * `default_visits`, `analysis_config` (the palette payload), and
 * `gamma`. The wire shape is `Record<string, any> | null`, intentionally
 * untyped on the OpenAPI boundary because the inner shape is application-
 * defined and changes more often than the schema. Surfacing it on the
 * domain type lets the SR composable read `currentCard.gradingParameter
 * ?.data?.analysis_config` (`useReviewSession.ts:235`) to override the
 * active palette per card, without re-fetching the wire shape from
 * anywhere downstream.
 *
 * The ACL routes the wire blob through `engine/analysis-config-curation.ts
 * ::rewriteGradingParameterAnalysisConfig` before surfacing — pre-v1.0.3
 * cards carry baked configs with `np.<fn>` references that the proxy
 * v1.0.3 stdlib rejects at call time, and the bit-equivalent rewrite is
 * what keeps those cards reviewable. Residue (bodies referencing fns
 * outside the curated stdlib, attribute walks like `np.linalg.<fn>`)
 * passes through unchanged for the proxy's call-time NameError to
 * surface as a SystemMessage at review time per ADR-0002.
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
  // ─── Item 18 surfacing ───────────────────────────────────────────────────
  readonly gradingParameter?: Record<string, any> | null;
  readonly currentRecall?: number;
  readonly halflifeUnits?: number;
  // ─── Card-metadata inline-edit arc 1 (backend tag, 2026-05-13) ───────────
  // Plain tags attached to this card (virtual `$tag` macros are a
  // deck-DSL construct, not per-card metadata; they don't appear
  // here). The wire schema marks the field optional (Pydantic
  // serialises the default `[]` when the card has no tags but
  // declares the field as having a default — which OpenAPI maps to
  // optional), so the ACL coerces `undefined → []` at the
  // boundary. Domain-side the field is always present.
  readonly tags: readonly string[];
}

/**
 * Patch shape consumed by `BackendService::updateCardMetadata`.
 * CamelCase domain projection of the wire `CardPatch`
 * (card-metadata inline-edit arc 2; see
 * `docs/dispatch/backend-to-frontend-card-metadata-inline-edit-arc2-shipped.md`).
 *
 * Every field is optional. The ACL projects each present field
 * to its snake_case wire counterpart; absent fields stay absent
 * on the wire so the backend's "absent → preserve" semantics
 * apply. Senders compose only what they intend to change.
 *
 * Semantics mirror the wire contract:
 *
 *   - `tags` — full replacement. `[]` wipes; absent preserves.
 *   - `numMoves` — direct overwrite.
 *   - `suspended` — direct overwrite.
 *   - `gradingParameterData` — JSON-merge-patch at one level
 *     against the stored `grading_parameter.data`. Keys
 *     present overwrite same-named stored keys; absent keys
 *     are preserved. The backend reads exactly `gamma`;
 *     every other key is frontend-defined pass-through.
 *   - `resetPrior` — atomic Ebisu-prior reset
 *     (`(α, β, t)` to defaults, `lastReviewedAt → null`,
 *     `numReviews → 0`). Independent of `numMoves` —
 *     settable on its own when the user decides the prior
 *     is corrupted.
 */
export interface CardMetadataPatch {
  readonly tags?:                 readonly string[];
  readonly numMoves?:             number;
  readonly suspended?:            boolean;
  readonly gradingParameterData?: Readonly<Record<string, unknown>>;
  readonly resetPrior?:           boolean;
}

// ── State Container (readonly removed) — SR domain ────────────────────────────

// Pipeline-stage discriminated union, sourced from the generated
// wire schema. Backend item 31 closed the typed-pipeline arc on
// the server side (`SelectStage | TakeStage | ShuffleStage |
// OrderStage` over `domain/pipeline_dsl.py`); this alias projects
// that union into the frontend domain so `CardSet.pipeline` is no
// longer `any[]`. The discriminant is the `stage` field
// (`"select" | "take" | "shuffle" | "order"`); each variant carries
// its own typed payload (selection + ordering for `select`, `n` for
// `take`, ordering for `order`, nothing for `shuffle`). Inner
// selection / ordering strategies are themselves wire-typed
// discriminated unions — see `types/backend.ts` for the full leaf
// vocabulary (DescendantSelection, EbisuRecallKey, BfsOrder, …).
//
// The CardSetEditor remains a free-form JSON authoring surface; the
// boundary cast there carries an ADR-0002 justification naming the
// backend's pipeline executor as the loud-failure surface for
// malformed pipelines.
export type PipelineStage =
  | components['schemas']['SelectStage']
  | components['schemas']['TakeStage']
  | components['schemas']['ShuffleStage']
  | components['schemas']['OrderStage'];

// ── Hyperparameter harness — schema-version 33 ──────────────────────
//
// Decks carry hyperparameters by nature (the n a `take` pulls, the
// expression a tag-DSL filter uses). The harness exposes chosen leaf
// values as named handles bound at pipeline-run time, leaving the
// deck declaration untouched. The disambiguator is syntactic: every
// legitimate DSL atom is either quoted or numeric, so a bare
// identifier in value position unambiguously marks a hole. See
// `docs/archive/notes/dsl-hyperparameter-harness-plan.md` for the design.

// Hole marker: a bare identifier in the authoring dialect parses to
// this shape. The `$param` field is the declared hyperparameter name
// the leaf binds to at run time.
export interface Hole {
  readonly $param: string;
}

// `Holed<T>` lifts a wire-typed value into the holey-AST shape: every
// open-primitive leaf may be replaced by a Hole, while literal types
// (the `stage` and `type` discriminators in particular) pass through
// unchanged so the union still narrows on the wire shape. Optional
// fields stay optional; arrays recurse element-wise; objects recurse
// on each value. After `substitute()` walks the AST and resolves
// holes, the result type-narrows back to `PipelineStage`.
export type Holed<T> =
  string extends T ? T | Hole :
  number extends T ? T | Hole :
  boolean extends T ? T | Hole :
  T extends ReadonlyArray<infer U> ? Holed<U>[] :
  T extends object ? { [K in keyof T]: Holed<T[K]> } :
  T;

export type PipelineStageWithHoles = Holed<PipelineStage>;

// HyperparamDecl: one entry in a deck's harness. The discriminated
// union over `type` selects which inline editor the prompt modal and
// the harness panel render. `enum` is the tag-DSL case (a fixed list
// of named filters the user maintains for that deck); `number` and
// `string` are the general cases.
export type HyperparamDecl =
  | {
      name: string;
      type: 'number';
      default: number;
      range?: [number, number];
      label?: string;
    }
  | {
      name: string;
      type: 'string';
      default: string;
      options?: string[];
      label?: string;
    }
  | {
      name: string;
      type: 'enum';
      default: string;
      options: string[];
      label?: string;
    };

// CardSet is mutated through the CardSetEditor. Decks are pure
// strategies (the DSL pipeline) — context (root card-id list) is
// supplied by the caller at execution time, lifted out of the deck
// declaration in schema-version 11. SR and Database tabs each carry
// their own context in `UISession.{sr,database}ContextIds`. Schema-
// version 33 added `hyperparameters` for the bind-time harness; the
// pipeline shape generalised from `PipelineStage[]` to the holey
// variant — decks without holes type-check identically.
export interface CardSet {
  id: string;
  name: string;
  description: string;
  pipeline: PipelineStageWithHoles[];
  hyperparameters: HyperparamDecl[];
}

// User-pinned snapshot of analysis_env.parameters values.
// Survives qEUBO experiment lifecycle (creating, replacing, or
// deleting an experiment does not affect the bookmark list). The
// id is generated frontend-side at pin time; createdAt is unix
// ms; parameters is a value-snapshot, not a reference.
//
// `parameters` is keyed by the substrate-native `KnobId`
// (`qeubo.<param-name>`) and holds each knob's value *vector*, not a
// bare scalar — aligning the bookmark with the knob-registry's own
// representation so an apply is a direct `writeKnobValue` pass-through.
// qEUBO parameters are scalar knobs today, so the arrays are length-1
// in practice; the `number[]` shape is what lets a future vector knob
// be bookmarked without another schema reshape. The flat
// `Record<string, number>` (bare param name → scalar) it replaced is
// migrated forward by schema migration 56 → 57.
export interface QeuboBookmark {
  id: BookmarkId;
  name: string;
  createdAt: number;
  parameters: Record<KnobId, number[]>;
}

// User-authored, persisted profile state.
//
// INVARIANT: the persisted profile holds user-authored data only.
// Server-derived caches (the tag dictionary, stats, …) must NOT live
// here — they carry no user intent, are re-fetched every boot, and
// persisting one means hydration's deepMerge races whatever wrote it
// at cold-start. Put such caches as non-persisted top-level
// `GlobalStore` fields instead (see `GlobalStore.knownTags`). A
// server-cache wedged into the profile is the category error that
// produced the boot-time hydrate-vs-fetch race
// (`tags-fetch-hydration-race`); keeping them out is what makes that
// class of race structurally impossible.
export interface ProfileState {
  id: ProfileId;
  username: string;
  settings: AppSettings;
  thumbnailSettings: ThumbnailSettings;
  cardSets: Record<string, CardSet>;
  qeuboPinnedBookmarks?: QeuboBookmark[];
}

export interface SessionState {
  id: SessionId;
  profileId: ProfileId;
  ui: UISession;
  // Per-board review-session rows. `Partial<Record<>>` (rather than
  // bare `Record<>`) reflects the runtime contract honestly: rows
  // are added by `mutateReviewSession`, deleted by `closeBoard` when
  // the owning board exits, and replaced wholesale by
  // `resetWorkspace` on identity flip. Bare `Record<>` would lie
  // about indexed reads — TS would say `ReviewSessionData`, the
  // runtime would return `undefined` after a delete. Per ADR-0001
  // (types reflect runtime reality) and ADR-0002 (type assertions
  // must be justified — bare-Record reads were unjustified).
  reviews: PerBoard<ReviewSessionData>;
}

export interface GlobalStore {
  activeBoardIndex: number;
  boards: BoardState[];
  profile: ProfileState;
  session: SessionState;
  engine: EngineState;
  // Server-derived tag dictionary for autocomplete. NON-PERSISTED:
  // excluded from `buildPersistencePayload`, untouched by
  // `updateFromRemote`, re-fetched every boot via
  // `backendService.getTags()`; `useMinting.commitMint` unions
  // just-minted tags in for the session. It lives here rather than in
  // `profile` per the ProfileState invariant — out of the persisted
  // blob, it can't be clobbered by the hydrate-vs-fetch race.
  knownTags: string[];
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
  // Per-board analysis mode. `Partial<Record<>>` reflects that keys
  // are added by analyze* calls, set to `'none'` by stopBoardAnalysis,
  // deleted by `closeBoard` when the owning board exits, and replaced
  // wholesale by analysisService.disconnect / onDisconnect. Same
  // ADR-0001 / ADR-0002 reasoning as `reviews` above. Consumers
  // (App.vue, useUserIORegistry) compare against `'ponder'`, which
  // is correct against both `'none'` and `undefined`.
  activeMode: PerBoard<AnalysisMode>;
  messages: SystemMessage[];
  // Engine identity captured from the upstream KataGo backend on
  // every fresh WebSocket open: `query_version` returns the engine
  // version string; `query_models` returns the loaded neural-net
  // model list. Consumed by the Toolbar for the "what am I talking
  // to" surface so a config change at the engine side is visible
  // without restarting the frontend. Both fields are populated
  // optimistically — `null` / empty until the probe round-trips on
  // connect / reconnect; `EngineInfo` is a value object the
  // analysis-service reassigns wholesale (same shape as `metrics`
  // above). Visible label uses `internalName` (KataGo's model
  // self-identifier — short, no path leakage); the full responses
  // are retained in `versionPayload` / `modelsPayload` so a hover
  // tooltip can surface the privacy-concerning `name` field
  // (typically a filesystem path) on demand for debugging.
  info: EngineInfo;
  // SELECTOR-mode model selection. Set when the proxy advertises
  // `selector` on its `query_version` capabilities AND the user has
  // chosen one of the labelled models from the Toolbar dropdown;
  // `null` means "no selection" (LEAF mode, or SELECTOR mode where
  // the user hasn't picked yet — the proxy will reject queries with
  // missing/unknown `model` field per ADR-0002).
  //
  // Consumed at the analysis-service ACL: when non-null, injected
  // into outgoing analysis queries as the `model` wire field
  // (proxy reads, dispatches via labelled WebSocket pool, strips
  // before forwarding to upstream LEAF). Above the ACL no module
  // learns that model selection is happening — the selection is a
  // proxy-routing concern, not a domain concern.
  //
  // Mutated through the named mutator `setSelectedModel` in
  // `store/index.ts`; persists through SyncService like any other
  // engine setting (see `closeBoard`'s comment on why the engine
  // surface is intentionally preserved across the `resetWorkspace`
  // identity-flip — the WebSocket URL is not user-keyed in the
  // current local-machine deployment).
  selectedModel: string | null;
}

export interface EngineModelEntry {
  // Identifier the SPA passes back via the `model` query field
  // when SELECTOR routing is in play. For SELECTOR-mode proxies
  // this is the `label` field on each `models[i]` entry (an
  // operator-chosen short name like `"strong"`); for LEAF-mode
  // proxies the array has a single entry whose `label` is derived
  // from `internalName` so the dropdown's data shape is uniform.
  readonly label: string;
  // Per-label availability, surfaced by SELECTOR's synthesised
  // `query_models` response (proxy v1.0.18+) so the model-selector
  // dropdown can grey out advertised-but-disconnected labels — a
  // SELECTOR may list every configured model regardless of upstream
  // state, and the SPA should not let the user pick one whose
  // upstream is currently unreachable. Pre-v1.0.18 proxies (and
  // LEAF-mode responses) don't carry the field; the parser defaults
  // it to `true` so older proxies and the LEAF-mode shape behave as
  // they did before this addition.
  readonly healthy: boolean;
}

export interface EngineInfo {
  // Engine version string, e.g. "1.13.0".
  readonly version: string | null;
  // Short model identifier — `models[0].internalName` from KataGo's
  // `query_models` response. Short and path-free, suitable for
  // streaming / screenshare contexts where the filesystem-path
  // `name` field would leak operator info. On a SELECTOR proxy this
  // is null (SELECTOR's synthesized `query_models` carries `label`
  // not `internalName`); the Toolbar's MODEL slot reads
  // `availableModels` instead in that mode.
  readonly internalName: string | null;
  // Full payloads of the two probe responses, retained verbatim so
  // a hover tooltip can show the entire engine response (including
  // the privacy-concerning `name` field) on demand. Null until the
  // corresponding probe round-trips. Plain `Record<string, unknown>`
  // because the per-version response shape is loose at the wire.
  readonly versionPayload: Record<string, unknown> | null;
  readonly modelsPayload: Record<string, unknown> | null;
  // Normalised model list — derived once at probe time from
  // `modelsPayload.models[i]`, picking up either `.label` (SELECTOR
  // mode) or `.internalName` (LEAF mode) per the dispatch's wire
  // contract. Empty when neither field is parseable. Single-source
  // for the Toolbar dropdown (rendered when `capabilities.selector`
  // is present in the advertisement) and for the SELECTOR's routing
  // key validation. Reactive-friendly readonly array; the analysis-
  // service reassigns the entire `info` value object wholesale.
  readonly availableModels: readonly EngineModelEntry[];
  // Capability advertisement from `query_version`'s response (the
  // optional `capabilities` field on `KataActionResponse`). Null when
  // the field is absent — either a pre-v1.0.14 proxy, or a v1.0.14+
  // proxy with `PROXY_ADVERTISE_CAPABILITIES=false` (the operator
  // hasn't opted into surfacing capabilities yet). Non-null when the
  // field is present, even when the dict is empty (proxy advertises
  // "no capabilities at all" — distinct from "absent advertisement"
  // semantically per the dispatch's Q1 sign-off; the SPA's
  // capability-injection helper distinguishes legacy auto-engage
  // from explicit empty advertisement when computing per-query
  // opt-ins).
  //
  // Read by the analysis service to gate per-query capability
  // injection (`delta_analysis`, `transposition`,
  // `adaptive_reevaluate`) and by the Toolbar to gate the SELECTOR
  // dropdown render (which requires `selector` in the advertised
  // dict).
  readonly capabilities: Record<string, Record<string, unknown>> | null;
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

// ─── Card-create wire shapes ──────────────────────────────────────────────────
//
// Aliases for the generated wire types from `types/backend.ts`. The
// handwritten interfaces that previously sat here (one per shape)
// retired in favour of the codegen-sourced declarations to close a
// drift hazard — they were the same shape as the generated schemas,
// declared twice. The fields are snake_case because these are wire
// shapes, not camelCase domain projections; there is no inverse-mapper
// for the create flow analogous to `mapToReviewCard`. The composable
// (`composables/useMinting.ts::prepareDraft`) constructs the payload
// literally and the ACL (`services/backend-service.ts::createCard`)
// forwards it.
//
// 34b note: `default_visits` lives inside `grading_parameter.data`,
// not at the top level. See `composables/useMinting.ts::prepareDraft`
// for the construction site that places it there.
export type CardCreatePayload = components['schemas']['CardCreate'];
export type GameMetadataPayload = components['schemas']['GameSourceCreate'];

// ── Value Objects (readonly preserved) — backend-sourced stats ────────────────
//
// camelCase domain projections of the `/stats/forests` and `/stats/tags`
// wire shapes. The ACL at `services/backend-service.ts` translates between
// these and the generated `components['schemas']['ForestStat'|'TagStat']`
// wire types. Branded ids (`CardId`, `GameSourceId`) replace raw `number`
// at the boundary; the wire's nullable string metadata (description,
// player names) is preserved as `string | null` so consumers can choose
// how to surface "no metadata" rather than the ACL silently coercing per
// ADR-0002.

export interface ForestStat {
  readonly rootCardId: CardId;
  readonly gameSourceId: GameSourceId;
  readonly description: string | null;
  readonly playerWhite: string | null;
  readonly playerBlack: string | null;
  readonly totalCards: number;
  readonly totalReviews: number;
  readonly averageRecall: number;
}

// `TagStat`'s wire and domain shapes are field-for-field identical (no
// snake_case to translate, no ids to brand — counts stay bare per the
// "brand the meaningful, not the trivial" pattern). The ACL's
// `mapTagStat` is therefore structurally redundant today; it exists as
// a forward-looking indirection point so a future wire rename or added
// field can be absorbed at the boundary rather than rippling through
// consumers.
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

// ── Value Objects (readonly preserved) — SGF library domain ───────────────────
//
// Camel-case domain projections of the /library/* wire shapes
// (LibraryGame, LibraryGameListItem, ListGamesResponse,
// ListPlayersResponse, ImportOutcome, plus the import request items).
// The ACL at `services/library-service.ts` translates between these
// and the generated `components['schemas']['*']` wire types in
// `types/backend.ts`. Branded ids (`GameSourceId`, `BoardId`)
// replace raw `number` / `string` at the boundary; the library row's
// primary key is the same `GameSourceId` the forest navigator uses
// (the library and forest are two views over the same `game_source`
// table), and the row's `client_game_id` UUID is the same `BoardId`
// that boards keyed-by-`client_game_id` use — so opening a library
// game on a board carries the brand through, and a subsequent
// card-mint dedups against the library row via the existing
// `get_or_create_game_source_by_client_id` path.
//
// Per ADR-0008's classification discipline: the sort column is a
// closed Literal union — the camelCase domain names map 1:1 to the
// snake_case wire vocabulary via the ACL. Invalid sort columns are
// 422'd by the backend's Pydantic validator; the frontend's type
// system rules them out at compile time.

export type LibrarySortColumn =
  | 'createdAt'
  | 'date'
  | 'playerWhite'
  | 'playerBlack'
  | 'result'
  | 'ruleset'
  | 'boardSize';

export type LibrarySortDirection = 'asc' | 'desc';

// Distinct-player view row — name + the number of games the player
// appears in across either colour. Backend computes the counts; the
// SPA renders a two-column accordion (name, count) and feeds names
// into the autocomplete suggest. Both surfaces consume the same
// frequency-ordered list.
export interface PlayerCount {
  readonly name: string;
  readonly count: number;
}

// One library row in the list view. Excludes `rawContent` — the SGF
// body ships only via the detail endpoint per the column-projection
// discipline (~2 KB/row × 100 rows would dwarf the metadata).
export interface LibraryGameListItem {
  readonly id: GameSourceId;
  readonly clientGameId: BoardId | null;
  readonly playerWhite: string | null;
  readonly playerBlack: string | null;
  readonly date: string | null;
  readonly result: string | null;
  readonly ruleset: string | null;
  readonly boardSize: number | null;
  readonly createdAt: string;  // ISO 8601 — leave as string at the ACL
}

// Full library row including raw SGF body. Returned by GET
// /library/games/{id}; consumed by the preview pane and the
// "Open in board" flow. `metadataExtra` is the JSON-column blob —
// uppercase SGF property keys (KM, HA, EV, RO, …) plus the lowercase
// `source_path` provenance field stamped at import time.
export interface LibraryGame {
  readonly id: GameSourceId;
  readonly clientGameId: BoardId | null;
  readonly playerWhite: string | null;
  readonly playerBlack: string | null;
  readonly date: string | null;
  readonly result: string | null;
  readonly ruleset: string | null;
  readonly boardSize: number | null;
  readonly metadataExtra: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly rawContent: string;
}

// Filter predicates for GET /library/games. All optional; omitted
// fields don't constrain the query. Substring-match (`*Like`) on
// player names, lexicographic range on date string, exact match on
// result / ruleset / boardSize.
//
// Per ADR-0001 (state containers drop `readonly`): this is a
// reactive state container — `useLibraryQuery` holds it via
// Vue's `reactive(...)` and the SPA's filter inputs v-model
// fields on it directly to trigger refetches. Keep mutability
// honest at the type level.
export interface LibraryFilter {
  // Any-color player filter — ORs across player_white / player_black
  // on the backend. The "show me all of X's games regardless of
  // colour" affordance, distinct from the per-color filters below
  // which target one side specifically. All three filters AND
  // together when set simultaneously.
  playerLike: string | null;
  playerWhiteLike: string | null;
  playerBlackLike: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  resultEq: string | null;
  rulesetEq: string | null;
  boardSizeEq: number | null;
}

// Per-file input to the batch-import endpoint. `sourcePath` carries
// the directory-upload `File.webkitRelativePath` so the user's
// on-disk layout (`sgf_db/1996/cho-vs-lee.sgf`) survives into
// `metadataExtra.source_path` at the backend. `null` for single-file
// uploads and curl clients.
export interface LibraryImportInput {
  readonly rawContent: string;
  readonly sourcePath: string | null;
}

// Per-file outcome of a batch import. Discriminated union; the
// `status` field is the dispatch witness. `errored` carries the
// per-file failure message (malformed SGF, adapter SAVEPOINT
// failure, etc.) — the batch as a whole stays 200 OK and the
// remaining files are unaffected. `deduplicated.clientGameId` may
// be `null` for legacy rows that pre-date the dedup arc.
export type LibraryImportOutcome =
  | { readonly status: 'created'; readonly gameId: GameSourceId; readonly clientGameId: BoardId }
  | { readonly status: 'deduplicated'; readonly gameId: GameSourceId; readonly clientGameId: BoardId | null }
  | { readonly status: 'errored'; readonly error: string };
