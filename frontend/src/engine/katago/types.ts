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
  /**
   * Seconds before KataGo emits the FIRST in-search report for
   * this query, independent of the subsequent
   * `reportDuringSearchEvery` cadence. A small value closes the
   * perceived first-paint delay on fresh ponder / analyze queries.
   * Bounded above by `reportDuringSearchEvery` at the registry
   * widget level (`KnobInputDecl.maxFromKnob`) and at the wire
   * layer (clamped in `analysis-service.ts`'s query-construction
   * sites) — sending `firstReportDuringSearchAfter` larger than
   * `reportDuringSearchEvery` would delay first-paint past what
   * would have been the second regular report, which is
   * semantically incoherent. Surface added 2026-05-15.
   */
  readonly firstReportDuringSearchAfter?: number;
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

  // ─── Per-query capability opt-in (proxy v1.0.14+) ─────────────────────────
  //
  // Symmetric to the response-side `capabilities` advertisement on
  // `query_version` (see `KataActionResponse.capabilities` below). Each
  // entry the client lists is a request to engage that capability for
  // this specific query; the wire shape is a dict-of-dicts
  // (capability-name → metadata), where empty `{}` means "opt in with
  // proxy defaults" and a populated metadata object parameterises the
  // capability per-query.
  //
  // Initial behavioural capabilities (per the dispatch at
  // `docs/dispatch/frontend-to-proxy-selector-and-capabilities.md` and
  // its proxy-side status sibling):
  //   - `delta_analysis` — engages the proxy's `analysis_enricher`
  //     Transformer producing `extra.state` / `extra.<color>.deltas` /
  //     `extra.<color>.triangular`. The SPA injects this on every
  //     analysis query (universally required for review-session
  //     grading and analysis-tab rendering).
  //   - `transposition` — engages `transposition_enricher` so move
  //     responses carry `clusterId` for the cluster-rings overlay.
  //     Gated by `engine.katago.useTransposition` registry toggle AND
  //     proxy advertisement.
  //   - `adaptive_reevaluate` — engages the middleware that fires
  //     deeper follow-up queries on worst-quantile turns. Engaged on
  //     live range-based analysis only; omitted on snapshot-replay
  //     and turn-locked review-session queries (whose timing
  //     assumptions break under follow-ups).
  //
  // Default semantics when absent (legacy auto-engage per the
  // dispatch's Q1 sign-off): the proxy auto-engages every wired
  // Transformer and middleware, preserving v1.0.13-and-earlier
  // behaviour for clients that haven't migrated. Clients that want
  // explicit "engage nothing" send `capabilities: {}`.
  //
  // The dict-not-list shape is deliberate: capabilities can carry
  // metadata schemas (e.g., `adaptive_reevaluate` accepts
  // `worst_quantile` and `extra_visits`); a flat string list would
  // foreclose on per-capability parameterisation. See the proxy-side
  // sign-off (Q4) for the schema-formalisation discipline.
  //
  // Proxy-control field (never reaches the engine): the proxy reads
  // and strips this before forwarding to KataGo. Semantics match the
  // existing `cache` / `lookup_cache` / `analysis_config` family.
  // Distinct from the four older controls in coalescing-key handling
  // (Q6 sign-off): `capabilities` is *retain-in-hash* (different
  // opt-in sets produce different transformer chains and therefore
  // different response artefacts), where the older four are
  // *strip-before-hash*.
  readonly capabilities?: Record<string, Record<string, unknown>>;

  // ─── SELECTOR routing key (proxy v1.0.15+) ────────────────────────────────
  //
  // Names which upstream the SELECTOR role should route this query to.
  // Matches a label declared in the proxy's `SELECTOR_MODELS` env var
  // (`label1=ws://host1:port1,label2=ws://host2:port2`). Proxy reads
  // the field, dispatches via the labelled WebSocket pool, and strips
  // the field from the payload before forwarding to the upstream
  // LEAF — vanilla KataGo doesn't know about it.
  //
  // The frontend sets this only when a model has been selected via the
  // SELECTOR Toolbar dropdown (which itself only renders when the
  // proxy advertises `selector` on `query_version`'s response). On a
  // LEAF / RELAY / ECHO proxy the field has no meaning; clients should
  // omit it.
  //
  // Proxy-control field with the same lifecycle as `capabilities`
  // above: never reaches the engine; *retain-in-hash* in coalescing.
  // Two queries identical except for `model` route to different
  // upstreams and produce genuinely different responses, so they
  // must not coalesce.
  //
  // Failure modes per ADR-0002 (the proxy enforces these; the
  // frontend surfaces what it sees back):
  //   - Unknown label → SELECTOR returns a `KataErrorResponse` with
  //     `field: "model"` naming the unknown label.
  //   - Upstream LEAF down mid-session → same disposition (loud
  //     abort, no failover to a different model).
  readonly model?: string;
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
  /**
   * Network's prior probability for this move (the policy head's
   * output for the move, restricted to moveInfos entries — distinct
   * from `KataAnalysisResponse.policy` which is the full 362-element
   * distribution). Emitted by KataGo's analysis-engine per move per
   * packet; consumed by stability extractors that compare search-
   * derived rankings against the prior (e.g.,
   * `search_agrees_with_policy`).
   */
  readonly prior?: number;
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
 * Provenance-stratified raw half of an analysis packet: everything KataGo
 * produces that depends only on the network + engine `overrideSettings`,
 * never the palette. This is the value the analysis-ledger's raw store holds
 * (keyed by `RawKey`). The field list is spelled out (rather than
 * `Omit<KataAnalysisResponse, 'extra'>`) so it stays the exhaustive SSOT for
 * the raw half — a new raw field is a deliberate edit here, mirroring the
 * "exhaustive definitions" posture of this file.
 *
 * See `services/analysis-ledger.ts` for the two-store keying and
 * `docs/notes/consult/opus-consult-2026-06-08-ledger-keying-typeful-defense.md`
 * for the rationale.
 */
export interface RawAnalysis {
  readonly id: string;
  readonly turnNumber: number;
  readonly isDuringSearch: boolean;
  readonly moveInfos: readonly KataMoveInfo[];
  readonly rootInfo: KataRootInfo;
  readonly ownership?: readonly number[];
  readonly policy?: readonly number[];
}

/**
 * The palette-derived enrichment half — the proxy-applied
 * state/delta/triangular envelope the ledger's enrichment store holds
 * (keyed by `EnrichedKey`). Alias of `KataExtra` (which already *is* that
 * envelope); the domain noun names the enrichment store's value type.
 */
export type Enrichment = KataExtra;

/**
 * The primary Analysis Response Packet — the raw half (`RawAnalysis`) plus
 * the optional palette enrichment.
 *
 * `isDuringSearch: false` means this is the final update for this turn.
 * `extra` is an optional enrichment payload from the analysis proxy.
 */
export interface KataAnalysisResponse extends RawAnalysis {
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

  // ─── Capability advertisement (proxy v1.0.14+) ────────────────────────────
  //
  // Server-side capability advertisement attached to `query_version`
  // responses by any proxy role whose Transformer chain includes
  // `capabilities_advertiser`. Each key is a capability name; each
  // value is the metadata dict the proxy publishes for that
  // capability (empty `{}` for capabilities without per-query knobs).
  //
  // Symmetric to the per-query opt-in field on
  // `KataGoAnalysisQuery.capabilities` above — what the proxy
  // advertises here is the universe of capabilities the client may
  // opt into per query. See that field's docstring for the engagement
  // semantics, the legacy auto-engage default, and the four initial
  // capabilities (`delta_analysis`, `transposition`,
  // `adaptive_reevaluate`, `selector`).
  //
  // Three behavioural capabilities (`delta_analysis`, `transposition`,
  // `adaptive_reevaluate`) and one routing capability (`selector`) are
  // expected at v1.0.15+. The routing capability is advertisement-only
  // — `selector` never appears on the query side; it gates whether
  // the SPA renders the model dropdown UI at all.
  //
  // Field is *optional* on the wire because:
  //   - Pre-v1.0.14 proxies don't emit it. The frontend reads its
  //     absence as "legacy auto-engage path" and stays on the path
  //     that was correct before this protocol existed.
  //   - v1.0.14+ proxies emit it only when
  //     `PROXY_ADVERTISE_CAPABILITIES=true` is set in the environment
  //     (default false — operators with unknown clients can update
  //     without fear of breaking parsers that don't tolerate unknown
  //     JSON fields). The default-off shape means the SPA will see
  //     this field only on intentionally-opted-in deployments.
  //
  // Read once per WebSocket open by `analysis-service.ts::probeEngineInfo`
  // and stored on `store.engine.info.capabilities`. The connection
  // refusal path fires when the field IS present but the SPA's
  // universally-required `delta_analysis` is missing — per the
  // dispatch's *Frontend will not* exception clause.
  readonly capabilities?: Record<string, Record<string, unknown>>;
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
