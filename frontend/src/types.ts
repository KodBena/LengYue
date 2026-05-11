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
    // Hue-rotation offset (degrees) applied uniformly across the
    // intensity gradient in CIELAB space. Default -43° is a
    // hand-applied orientation chosen for typical-trichromat
    // readability; users with different colour-vision profiles can
    // adjust via the slider in the Gradient Calibration view.
    intensityHueShift: number;
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

// CardSet is mutated through the CardSetEditor. Decks are pure
// strategies (the DSL pipeline) — context (root card-id list) is
// supplied by the caller at execution time, lifted out of the deck
// declaration in schema-version 11. SR and Database tabs each carry
// their own context in `UISession.{sr,database}ContextIds`.
export interface CardSet {
  id: string;
  name: string;
  description: string;
  pipeline: PipelineStage[];
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
  // Per-board review-session rows. `Partial<Record<>>` (rather than
  // bare `Record<>`) reflects the runtime contract honestly: rows
  // are added by `mutateReviewSession`, deleted by `closeBoard` when
  // the owning board exits, and replaced wholesale by
  // `resetWorkspace` on identity flip. Bare `Record<>` would lie
  // about indexed reads — TS would say `ReviewSessionData`, the
  // runtime would return `undefined` after a delete. Per ADR-0001
  // (types reflect runtime reality) and ADR-0002 (type assertions
  // must be justified — bare-Record reads were unjustified).
  reviews: Partial<Record<BoardId, ReviewSessionData>>;
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
  // Per-board analysis mode. `Partial<Record<>>` reflects that keys
  // are added by analyze* calls, set to `'none'` by stopBoardAnalysis,
  // deleted by `closeBoard` when the owning board exits, and replaced
  // wholesale by analysisService.disconnect / onDisconnect. Same
  // ADR-0001 / ADR-0002 reasoning as `reviews` above. Consumers
  // (App.vue, useUserIORegistry) compare against `'ponder'`, which
  // is correct against both `'none'` and `undefined`.
  activeMode: Partial<Record<BoardId, AnalysisMode>>;
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
