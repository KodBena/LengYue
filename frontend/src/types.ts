/**
 * src/types.ts
 * Domain Modeling with Branded Types (Haskell-style Newtypes) — the
 * barrel over the per-domain type modules.
 *
 * Split 2026-06-10 along the former single file's banner seams
 * (history-lessons audit §3.15; ADR-0007's type-catalogue exception:
 * "split along clean domain seams"). Import sites keep importing
 * from `./types`; the declarations live in:
 *
 *   - `types/ids.ts`          — `Brand<>` + the domain-agnostic identity brands + `PerBoard`.
 *   - `types/game.ts`         — Go value objects, game-tree state, game-coupled brands.
 *   - `types/engine.ts`       — engine-connection state (EngineState / EngineInfo / metrics).
 *   - `types/analysis-env.ts` — analysis-palette / analysis-environment vocabulary.
 *   - `types/knobs.ts`        — knob-registry substrate vocabulary.
 *   - `types/qeubo.ts`        — qEUBO calibration domain + `QeuboError` + bookmarks.
 *   - `types/cards.ts`        — SR-card domain (cards, decks, review session, card wire aliases).
 *   - `types/lineage.ts`      — card-tree / forest-stats browse domain.
 *   - `types/library.ts`      — SGF library domain.
 *   - `types/app.ts`          — application-shell value objects (AuthState, SystemMessage).
 *   - `store/schema.ts`       — the persisted GlobalStore schema (AppSettings / UISession /
 *                               ProfileState / SessionState / GlobalStore), colocated with
 *                               `store/defaults.ts`.
 *
 * This barrel is a RUNTIME module, not types-only: three value
 * exports flow through it (`BUNDLE_COMPRESSION_SCHEMES`,
 * `QeuboError`, `CardTreeOverflowError`). The leaf modules above
 * therefore never import from this barrel — they import from sibling
 * leaf modules directly — which keeps the re-export graph acyclic.
 *
 * ─── Policy on `readonly` (per ADR-0001 Path A) ──────────────────────────────
 * Two distinct categories of interface live in this catalog (the
 * modules above), and they have opposite `readonly` policies:
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
 * category above. (`Brand<>` itself is exported by `types/ids.ts` for
 * the sibling modules' declarations; it is deliberately not re-exported
 * here — it was not part of this file's pre-split public surface.)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * License: Public Domain (The Unlicense)
 */

// ── Re-exports: KataGo wire-protocol types ────────────────────────────────────
export type {
  KataAnalysisResponse,
  KataExtra,
  KataPlayerExtra,
  RawAnalysis,
  Enrichment,
  CapabilityAdvertisement,
} from './engine/katago/types';

// ── Re-exports: PV animation settings shape ───────────────────────────────────
export type {
  PvAnimationSettings,
  PvAnnotation,
  PvMode,
} from './composables/board/use-pv-animation';

// ── Re-exports: i18n supported-locale union ───────────────────────────────────
export type { SupportedLocale } from './i18n/locales';

// ── Identity brands (domain-agnostic) ─────────────────────────────────────────
export type {
  BoardId,
  ProfileId,
  SessionId,
  BookmarkId,
  PerBoard,
  KeybindingActionId,
  RawKey,
  EnrichedKey,
  QueryId,
  ExtractorId,
  MetricId,
  CardTreeExpandKey,
  AnalysisPanelId,
  AnalysisTabId,
  CardId,
  GameSourceId,
} from './types/ids';

// ── Game domain (Go value objects, game-tree state, game-coupled brands) ──────
export type {
  NodeId,
  ColorMoveIndex,
  PlyIndex,
  StoneColor,
  Point,
  Move,
  SgfProperties,
  GameMetadata,
  NodeDelta,
  GameNode,
  BoardState,
  EnginePlayGameSession,
  EnginePlayGameConfig,
} from './types/game';

// ── Engine-connection state ───────────────────────────────────────────────────
export type {
  EngineStatus,
  AnalysisMode,
  EngineMetrics,
  EngineState,
  EngineModelEntry,
  EngineInfo,
} from './types/engine';

// ── Analysis-palette / analysis-environment vocabulary ────────────────────────
export type {
  AnalysisPalette,
  ParameterMeta,
  AnalysisEnvironment,
} from './types/analysis-env';

// ── Knob-registry substrate vocabulary ────────────────────────────────────────
export type {
  KnobId,
  StorePath,
  KnobDomain,
  KnobWidget,
  KnobInputDecl,
  KnobOutputDecl,
  KnobTransform,
  KnobDecl,
  KnobRegistry,
  ClaimPolicy,
  ConsumerClaim,
  ClaimResult,
  ReleaseResult,
  WriteContext,
  WriteResult,
  ClaimChangeEvent,
  ClaimChangeListener,
  UnsubscribeFn,
} from './types/knobs';

// ── qEUBO calibration domain ──────────────────────────────────────────────────
export type {
  QeuboPhase,
  QeuboExperiment,
  QeuboStatus,
  QeuboPair,
  QeuboBest,
  QeuboPreferenceResult,
  QeuboHistory,
  QeuboCreateInput,
  QeuboErrorKind,
  QeuboBookmark,
} from './types/qeubo';
export { QeuboError } from './types/qeubo';

// ── SR-card domain ────────────────────────────────────────────────────────────
export type {
  EbisuModel,
  ReviewCard,
  CardMetadataPatch,
  PipelineStage,
  Hole,
  Holed,
  PipelineStageWithHoles,
  HyperparamDecl,
  CardSet,
  ReviewStatus,
  ReviewSessionData,
  ReviewFeedback,
  CardCreatePayload,
  GameMetadataPayload,
} from './types/cards';

// ── Card-tree / forest-stats browse domain ────────────────────────────────────
export type {
  ForestStat,
  TagStat,
  CardLineageNode,
  RootGroup,
  ResolveRootsResult,
  CardLineageTree,
  CardTreeNodeRole,
} from './types/lineage';
export { CardTreeOverflowError } from './types/lineage';

// ── SGF library domain ────────────────────────────────────────────────────────
export type {
  LibrarySortColumn,
  LibrarySortDirection,
  PlayerCount,
  LibraryGameListItem,
  LibraryGame,
  LibraryFilter,
  LibraryImportInput,
  LibraryImportOutcome,
} from './types/library';

// ── Application-shell value objects ───────────────────────────────────────────
export type { AuthState, SystemMessage } from './types/app';

// ── Persisted store schema (colocated with store/defaults.ts) ─────────────────
export type {
  RegistryLeaf,
  Registry,
  ThumbnailSettings,
  AnalysisTab,
  MintingSettings,
  NavigationSettings,
  BundleCompressionScheme,
  AppSettings,
  UISession,
  NavNodeId,
  NavSelection,
  ForestNavState,
  CardTreeNavState,
  ProfileState,
  SessionState,
  GlobalStore,
} from './store/schema';
export { BUNDLE_COMPRESSION_SCHEMES } from './store/schema';
