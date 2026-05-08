/**
 * src/engine/katago/types.ts
 * Exhaustive Type Definitions for the KataGo Parallel Analysis Engine.
 *
 * This is the single source of truth for all KataGo wire-protocol types,
 * including the enrichment envelope (`KataExtra`) produced by the analysis
 * proxy middleware. No other module should define or re-declare these types.
 *
 * License: Public Domain (The Unlicense)
 */

export type Player = 'B' | 'W';
export type KataCoord = string;

/**
 * Accepted values for the KataGo Analysis Engine's
 * `overrideSettings.reportAnalysisWinratesAs` setting. Controls the
 * sign convention of `winrate`, `scoreLead`, and `ownership` in the
 * response packets:
 *
 *   'BLACK'      — high winrate / +score / +ownership = Black favoured
 *   'WHITE'      — high winrate / +score / +ownership = White favoured
 *   'SIDETOMOVE' — perspective flips per move (KataGo's own default)
 *
 * This enum is exported and re-used by:
 *
 *   - the registry editor's dropdown table (`PATH_ENUMS` in
 *     `components/RegistryEditor.vue`), so the user can't typo the
 *     value;
 *   - the receipt-time normalisation layer in
 *     `engine/katago/winrate-framing.ts`, which flips the typed
 *     signed scalars (winrate, scoreLead, ownership) plus the
 *     defensively-handled untyped siblings (scoreMean, utility,
 *     etc.) to canonical 'WHITE' framing before packets reach the
 *     ledger. After normalisation, every consumer downstream sees
 *     'WHITE'-framed packets regardless of what the user asked
 *     KataGo for, fixing the inversion bug for raw-packet consumers.
 *
 * ── Residual limitation (proxy-side palette enrichment) ───────────
 * The receipt-time normaliser flips raw-packet signed scalars only.
 * Palette enrichment in `extra.*` is computed on the proxy side
 * BEFORE packets reach the frontend, using the wire's framing —
 * so a user with `reportAnalysisWinratesAs: 'BLACK'` receives
 * `extra.state[turn]['Win Probability']` in BLACK framing even
 * after the raw packet's `rootInfo.winrate` is normalised to
 * WHITE. Custom palette state_fns reading signed scalars must
 * compensate, or the user keeps the registry at 'WHITE' (the
 * seeded default) for fully-consistent display. Tracking detail
 * in `docs/handoff-current.md`'s "Known gaps (frontend)" and the
 * scope discussion in `engine/katago/winrate-framing.ts`'s file
 * header.
 */
export const WINRATE_FRAMINGS = ['BLACK', 'WHITE', 'SIDETOMOVE'] as const;
export type WinrateFraming = typeof WINRATE_FRAMINGS[number];

/**
 * Common fields for all queries sent to KataGo.
 */
interface BaseQuery {
  readonly id: string; // Arbitrary identifier
}

/**
 * A standard Analysis Query.
 * Can request analysis for multiple turns of a single game state.
 *
 * ─── Note on the wire-shape vs. the upstream KataGo protocol ─────────────────
 * This interface describes the wire shape accepted by the *proxy*
 * (pubsub_hub.py + the Layer 1/3 stack), not the bare KataGo Analysis
 * Engine binary. The proxy is a superset: every field the upstream
 * KataGo binary accepts is forwarded transparently, and the proxy
 * additionally accepts a small set of control flags (cache,
 * lookup_cache, replay_final_only) and an opaque `analysis_config`
 * payload used by the per-move enrichment pipeline.
 *
 * The proxy is the single entry point for all KataGo traffic in this
 * project — there is no code path that talks to the bare binary —
 * so the union of fields is the honest type. Splitting into "core
 * KataGo" and "proxy extension" sub-interfaces would be more pure
 * but offer no practical benefit; the merged form matches what call
 * sites actually construct.
 */
export interface KataGoAnalysisQuery extends BaseQuery {
  readonly moves: readonly [Player, KataCoord][];
  readonly initialStones?: readonly [Player, KataCoord][];
  readonly initialPlayer?: Player;
  readonly rules: string;
  readonly boardXSize: number;
  readonly boardYSize: number;
  readonly komi?: number;

  // Turn Management
  readonly analyzeTurns?: readonly number[]; // e.g., [0, 1, 2]

  // Pondering / Search Control
  readonly maxVisits?: number;
  readonly reportDuringSearchEvery?: number; // Seconds between updates
  readonly priority?: number;

  // Feature Toggles
  readonly includeOwnership?: boolean;
  readonly includePolicy?: boolean;
  readonly includePVVisits?: boolean;

  // ─── Proxy control flags ───────────────────────────────────────────────────
  // The proxy maintains a query-level replay cache keyed by the FULL query
  // payload (excluding the client-specific `id` and these control flags
  // themselves). The three flags below give the caller fine-grained
  // control over whether this query reads from the cache, writes to it,
  // and how cached streams are replayed. See pubsub_hub.py's "Cache
  // semantics" docstring for the authoritative protocol description.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * If true, record the live backend stream under the full query key
   * so that subsequent identical queries (with `lookup_cache: true`)
   * can replay the result without hitting KataGo again.
   *
   * Use cases that justify caching:
   *   1. Spaced-repetition reviews where the same position may be
   *      analyzed on each visit.
   *   2. qEUBO-driven palette parameter calibration: the same engine
   *      query with the same maxVisits is replayed many times under
   *      different `analysis_config` payloads to measure how the
   *      palette shapes the surfaced metrics. The cache is what
   *      makes this loop cheap after the first evaluation.
   *
   * Defaults to false because most live analyses (during navigation
   * or active study) shouldn't pollute the cache with positions the
   * user is unlikely to revisit.
   */
  readonly cache?: boolean;

  /**
   * If true and an exact-match entry exists in the cache, short-circuit
   * the live KataGo backend entirely and replay the cached stream.
   * The match key is the full query payload excluding `id`, `cache`,
   * `lookup_cache`, and `replay_final_only`.
   *
   * Cache miss with `lookup_cache: true` is not an error — the query
   * proceeds to the live backend as if the flag were false.
   */
  readonly lookup_cache?: boolean;

  /**
   * If true, during cache replay, drop any messages with
   * `isDuringSearch: true` and emit only the final settled packet.
   * Useful when a caller only wants the canonical answer and doesn't
   * need to observe the anytime-optimization stream.
   *
   * No effect when not replaying (i.e., when `lookup_cache: false`
   * or there's a cache miss).
   */
  readonly replay_final_only?: boolean;

  // ─── Engine-side runtime overrides ─────────────────────────────────────────

  /**
   * Per-query overrides for engine-side settings normally configured
   * via KataGo's analysis config file. Forwarded verbatim by the
   * proxy (it does not introspect the keys); the upstream KataGo
   * Analysis Engine documents the accepted set in
   * `Analysis_Engine.md` under "overrideSettings" — common entries
   * include `reportAnalysisWinratesAs` (a `WinrateFraming` —
   * `'BLACK'` / `'WHITE'` / `'SIDETOMOVE'`),
   * `rootNumSymmetriesToSample` (1..8), `wideRootNoise` (0..0.5+),
   * `rootPolicyTemperature`, etc.
   *
   * Shape is deliberately opaque (`Record<string, unknown>`) at the
   * wire level: the accepted set is engine-version-dependent and
   * the user surfaces it through the registry editor as a dynamic
   * node. Snake-case is NOT applied; KataGo's wire vocabulary here
   * is camelCase (`reportAnalysisWinratesAs`, not
   * `report_analysis_winrates_as`). Specific keys with frontend-side
   * meaning (currently just `reportAnalysisWinratesAs`) are typed by
   * dedicated unions exported above and constrained at the registry
   * UI via `PATH_ENUMS`; the rest stay free-form.
   *
   * Currently optional: when absent, KataGo uses the values from its
   * config file. The frontend defaults this to a non-empty seed (see
   * `store/defaults.ts`) so a fresh install gets a sensible analysis
   * posture out of the box; the call site conditionally spreads it
   * so an empty dict (user cleared every key) does not pollute the
   * wire with a no-op.
   */
  readonly overrideSettings?: Record<string, unknown>;

  // ─── Per-move enrichment payload ───────────────────────────────────────────

  /**
   * Opaque payload carrying the analysis-palette definition (delta_fn,
   * state_fns, summary_fn, parameters, symbols) that the proxy uses
   * to compute the per-move enrichment fields surfaced in
   * `KataAnalysisResponse.extra`.
   *
   * The shape is defined at the palette layer (see
   * `services/analysis-config.ts::compileAnalysisConfig`) and
   * deliberately opaque at this boundary: the proxy applies the
   * palette without introspecting it from the wire-type's perspective,
   * and the type system on the frontend doesn't need to mirror the
   * palette grammar to send it. `Record<string, unknown>` is the
   * honest description.
   *
   * Currently optional: when absent, the proxy falls back to a
   * per-turn default `scoreLead`-based enrichment. This is a
   * transitional concession — the per-turn fallback is a vestigial
   * code path scheduled for removal, after which this field will
   * become required. Until then the optionality matches the wire
   * contract; future `analysis_config: Record<string, unknown>`
   * (no `?`) is a one-character change at that point.
   */
  readonly analysis_config?: Record<string, unknown>;
}

/**
 * Special Action Queries (Non-analysis tasks).
 */
export type KataGoActionQuery =
  | { readonly id: string; readonly action: 'query_version' }
  | { readonly id: string; readonly action: 'clear_cache' }
  | { readonly id: string; readonly action: 'query_models' }
  | {
      readonly id: string;
      readonly action: 'terminate';
      readonly terminateId: string;
      readonly turnNumbers?: readonly number[];
    };

export type KataGoQuery = KataGoAnalysisQuery | KataGoActionQuery;

// ── Core Analysis Data Structures ─────────────────────────────────────────────

export interface KataMoveInfo {
  readonly move: KataCoord;
  readonly visits: number;
  readonly winrate: number;
  readonly scoreLead: number;
  readonly pv: readonly KataCoord[];
  readonly order: number;
  readonly clusterId?: string | number;
}

export interface KataRootInfo {
  readonly winrate: number;
  readonly scoreLead: number;
  readonly visits: number;
  readonly currentPlayer: Player;
}

// ── Extension Data (Analysis Proxy Middleware) ─────────────────────────────────

/**
 * Per-player enrichment data attached by the analysis proxy.
 * Each field is independently optional — the proxy may send partial updates
 * that are merged into the ledger over successive pondering packets.
 */
export interface KataPlayerExtra {
  /**
   * Triangular heatmap: a list of [(startTurn, endTurn), value] triples,
   * representing a correlation or tension metric over move intervals.
   */
  readonly triangular?: readonly [[number, number], number][];

  /**
   * Per-move-index delta values, keyed by move-index string (e.g. "42").
   * Represents the quality delta for that player's move at that index.
   */
  readonly deltas?: Record<string, number>;

  /**
   * Continuous Wavelet Transform data. Reserved for future use.
   * See CWT.md for the planned data contract.
   */
  readonly cwt?: Record<string, unknown>;
}

/**
 * Top-level enrichment envelope attached to each analysis packet by the proxy.
 *
 * The `state` field is a nested record indexed first by turn-string
 * (e.g. "42") and then by metric name (e.g. "Complexity", "Win Probability").
 * This two-level structure allows a single packet to carry state metrics
 * for multiple turns simultaneously.
 */
export interface KataExtra {
  readonly state?: Record<string, Record<string, number>>;
  readonly black?: KataPlayerExtra;
  readonly white?: KataPlayerExtra;
}

// ── Response Types ─────────────────────────────────────────────────────────────

/**
 * The primary Analysis Response Packet.
 *
 * `isDuringSearch: false` means this is the final update for this turn.
 * `extra` is an optional enrichment payload from the analysis proxy.
 */
export interface KataAnalysisResponse {
  readonly id: string;
  readonly turnNumber: number;
  readonly isDuringSearch: boolean;
  readonly moveInfos: readonly KataMoveInfo[];
  readonly rootInfo: KataRootInfo;
  readonly ownership?: readonly number[];
  readonly policy?: readonly number[];
  readonly extra?: KataExtra;
}

/**
 * Action Responses echo the original query plus extra data.
 */
export interface KataActionResponse {
  readonly id: string;
  readonly action: string;
  readonly version?: string;    // from query_version
  readonly models?: readonly unknown[]; // from query_models
}

export interface KataErrorResponse {
  readonly id: string;
  readonly error: string;
  readonly field?: string;
}

/**
 * A Unified Response Type (Sum Type / Discriminated Union).
 * Distinguish between variants using field presence or the `action` key.
 */
export type KataGoResponse =
  | KataAnalysisResponse
  | KataActionResponse
  | KataErrorResponse;
