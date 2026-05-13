/**
 * src/composables/useQueryTelemetry.ts
 *
 * Singleton telemetry surface for in-flight KataGo proxy queries.
 * Tracks every query the SPA fires (range analyses, single-node
 * analyses, ponders, engine-match turns, probes) with its kind,
 * boardId, SELECTOR model label, total turn count and per-turn
 * visit ceiling. As packets stream back, the singleton observes
 * `(visits, isDuringSearch)` per `(queryId, turnNumber)`, derives
 * a per-model visits-per-second rolling average, and exposes a
 * reactive `inFlight` view with per-query ETA.
 *
 * Domain band (ADR-0003): truly agnostic. The composable speaks
 * about "queries", "models", "turns", and "visits" — KataGo's
 * wire vocabulary that any KataGo-bound caller already speaks. It
 * has no Go-specific rules logic.
 *
 * Why a singleton: there is one queue feeding one engine; consumers
 * (the Toolbar badge / hover panel) need the same view across the
 * SPA. The module-scoped maps and ref are constructed once on
 * first import and shared by every `useQueryTelemetry()` call.
 *
 * Resource ownership: the per-query entries are released when the
 * caller invokes `unregisterQuery(queryId)` — typically on the
 * final packet's terminal-state observation, or on
 * `stopBoardAnalysis`. The per-model perf observer keeps a bounded
 * running sum (halved when sample count exceeds the cap) so it
 * never drifts unboundedly even if `unregisterQuery` is forgotten.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, ref, type ComputedRef } from 'vue';
import type { BoardId } from '../types';

// ── Public types ──────────────────────────────────────────────────────────────

export type QueryKind =
  | 'analyze'    // single-node, finite visit budget
  | 'ponder'    // single-node, ponder ceiling (may be very large)
  | 'range'     // multi-turn range over `analyzeTurns`
  | 'match'     // engine-vs-engine self-play turn (single-turn, off-store)
  | 'probe';    // version / models metadata probe

export interface QueryMeta {
  readonly queryId: string;
  readonly kind: QueryKind;
  /** null for non-board-scoped queries (probes, match-loop turns). */
  readonly boardId: BoardId | null;
  /** SELECTOR routing label; null when the proxy is LEAF / RELAY / ECHO. */
  readonly model: string | null;
  /** Wall-clock ms at registration. */
  readonly startTimeMs: number;
  /**
   * Number of turns this query will report on. 1 for single-node
   * analyzeActiveNode; (endTurn − startTurn + 1) for range queries;
   * 1 for engine-match turns; 0 for probes (no turn-counted work).
   */
  readonly turnsTotal: number;
  /**
   * Visits ceiling per turn — `maxVisits` on the wire. Null when
   * the query has no meaningful ceiling (probes; ponders with no
   * configured cap).
   */
  readonly visitsPerTurn: number | null;
  /**
   * Optional human-readable hint, surfaced verbatim in the tooltip.
   * Used for review-session distinctions ("grading"), match-loop
   * side identification ("B" / "W"), and similar caller context.
   */
  readonly label?: string;
}

export interface QueryProgress {
  /**
   * Count of turns where a terminal packet (isDuringSearch=false)
   * has been observed. Always ≤ `turnsTotal`.
   */
  turnsCompleted: number;
  /**
   * Cumulative `rootInfo.visits` of the most recently observed
   * packet, scoped to whichever turn that packet was for. Reset
   * implicitly when a new turn's packet arrives with a smaller
   * visit count.
   */
  currentTurnVisits: number;
  /** Most-recent observed turnNumber. -1 before any packet. */
  lastTurnNumber: number;
  /** Wall-clock ms of the most recent packet. 0 before any packet. */
  lastPacketMs: number;
  /** Strictly informational; how many packets the singleton has seen. */
  packetsObserved: number;
}

export interface InFlightQuery extends QueryMeta {
  readonly progress: Readonly<QueryProgress>;
  /**
   * Estimated milliseconds remaining until the final packet for the
   * last turn. Null when the singleton cannot derive an estimate yet:
   *   - `visitsPerTurn` is null (probe / open-ended ponder);
   *   - the per-model perf observer has fewer than `MIN_SAMPLES`
   *     samples to ground a rate.
   */
  readonly etaMs: number | null;
}

// ── Module-scoped singleton state ────────────────────────────────────────────

// Sentinel for "no SELECTOR model" — collapses LEAF / RELAY / ECHO
// observations into a single default bucket. Distinct from any
// real model label by construction (real labels never start with
// a double-underscore in practice).
const DEFAULT_MODEL_KEY = '__default__';

// Per-model rolling visits/sec observer. `cumVisits` and `cumMs`
// are summed over all observed deltas; the rate is the ratio. We
// halve both (and the sample count) once the sample count exceeds
// `PERF_HALVE_AT` so older samples decay out and the observer
// tracks recent perf rather than session-lifetime average.
interface ModelPerf {
  cumVisits: number;
  cumMs: number;
  samples: number;
}
const MIN_SAMPLES = 3;
const PERF_HALVE_AT = 200;
const perfByModel = new Map<string, ModelPerf>();

function recordPerfSample(modelKey: string, deltaVisits: number, deltaMs: number): void {
  if (deltaVisits <= 0 || deltaMs <= 0) return;
  const perf: ModelPerf = perfByModel.get(modelKey) ?? {
    cumVisits: 0, cumMs: 0, samples: 0,
  };
  perf.cumVisits += deltaVisits;
  perf.cumMs     += deltaMs;
  perf.samples   += 1;
  if (perf.samples > PERF_HALVE_AT) {
    perf.cumVisits *= 0.5;
    perf.cumMs     *= 0.5;
    perf.samples   *= 0.5;
  }
  perfByModel.set(modelKey, perf);
}

function visitsPerSec(modelKey: string): number | null {
  const perf = perfByModel.get(modelKey);
  if (!perf || perf.samples < MIN_SAMPLES || perf.cumMs <= 0) return null;
  return perf.cumVisits / (perf.cumMs / 1000);
}

// Tick counter forces `inFlight` recomputation each second. Packet-
// driven updates to `queries` already trigger reactive
// recomputation; this tick is what keeps the ETA decreasing when
// no packets are arriving (e.g. during the queue-wait period the
// proxy holds on before issuing a new analyze to KataGo). Without
// it, the displayed ETA would freeze between packets.
const tick = ref(0);
let tickTimer: number | null = null;
function ensureTickTimer(): void {
  if (tickTimer !== null) return;
  tickTimer = window.setInterval(() => { tick.value++; }, 1000);
}

// In-flight queries keyed by queryId. The value carries both the
// caller-supplied meta and the singleton-maintained progress.
interface Entry {
  meta: QueryMeta;
  progress: QueryProgress;
}
const queries = ref<Map<string, Entry>>(new Map());

// ── Internal helpers ──────────────────────────────────────────────────────────

function modelKey(model: string | null): string {
  return model ?? DEFAULT_MODEL_KEY;
}

function etaForEntry(entry: Entry): number | null {
  const { meta, progress } = entry;
  if (meta.visitsPerTurn === null) return null;
  const total = meta.visitsPerTurn * Math.max(1, meta.turnsTotal);
  const done  = progress.turnsCompleted * meta.visitsPerTurn
              + progress.currentTurnVisits;
  const remaining = Math.max(0, total - done);
  if (remaining === 0) return 0;
  const vps = visitsPerSec(modelKey(meta.model));
  if (vps === null || vps <= 0) return null;
  return (remaining / vps) * 1000;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register a query at submit-time. Idempotent: registering the same
 * queryId twice replaces the prior entry rather than throwing —
 * `stopBoardAnalysis` already overwrites stale entries in the
 * analysis service's tracking maps, so this matches that posture.
 */
function registerQuery(meta: QueryMeta): void {
  ensureTickTimer();
  const fresh = new Map(queries.value);
  fresh.set(meta.queryId, {
    meta,
    progress: {
      turnsCompleted:    0,
      currentTurnVisits: 0,
      lastTurnNumber:    -1,
      lastPacketMs:      0,
      packetsObserved:   0,
    },
  });
  queries.value = fresh;
}

/**
 * Unregister a query — release its entry from `queries`. Safe to
 * call when the queryId is absent (no-op). Callers should invoke
 * on terminal packet observation OR on explicit cancellation
 * (`stopBoardAnalysis`); whichever fires first.
 */
function unregisterQuery(queryId: string): void {
  if (!queries.value.has(queryId)) return;
  const fresh = new Map(queries.value);
  fresh.delete(queryId);
  queries.value = fresh;
}

/**
 * Record a packet observation. Updates the query's progress and
 * feeds the per-model perf observer when the delta is within-turn
 * (same `turnNumber` as the previous observation, and `visits` has
 * strictly increased — both conditions hold inside a turn and are
 * both false across a turn boundary, so the gate naturally skips
 * sampling at boundaries).
 *
 * If the queryId is unknown (registration missed, or a stray
 * packet arriving post-unregister), the call is a silent no-op.
 */
function recordPacket(
  queryId: string,
  turnNumber: number,
  visits: number,
  isDuringSearch: boolean,
): void {
  const entry = queries.value.get(queryId);
  if (!entry) return;
  const now  = Date.now();
  const prog = entry.progress;

  const sameTurn = prog.lastTurnNumber === turnNumber;
  if (sameTurn && prog.lastPacketMs > 0 && visits > prog.currentTurnVisits) {
    recordPerfSample(
      modelKey(entry.meta.model),
      visits - prog.currentTurnVisits,
      now - prog.lastPacketMs,
    );
  }

  // Progress mutations on the existing record — `queries.value`
  // is replaced wholesale below so Vue picks up the change. We
  // mutate the inner `progress` object first because it's not
  // reactive on its own; the outer Map replacement triggers the
  // reactive read on consumers.
  prog.currentTurnVisits = visits;
  prog.lastTurnNumber    = turnNumber;
  prog.lastPacketMs      = now;
  prog.packetsObserved  += 1;
  if (!isDuringSearch) {
    prog.turnsCompleted += 1;
  }

  // Auto-cleanup once every turn has been finalised. Range queries
  // emit one terminal packet per turn; the LAST terminal packet
  // brings `turnsCompleted` up to `turnsTotal` and the work is
  // genuinely done — no more packets will arrive for this queryId,
  // so we can drop the entry without waiting for an explicit
  // `unregisterQuery` call from the analysis-service layer. This
  // keeps the queue accurate when work completes naturally without
  // an intervening `stopBoardAnalysis`.
  if (prog.turnsCompleted >= entry.meta.turnsTotal && entry.meta.turnsTotal > 0) {
    const fresh = new Map(queries.value);
    fresh.delete(queryId);
    queries.value = fresh;
    return;
  }

  queries.value = new Map(queries.value);
}

/**
 * Convenience: when stopping all work for a board (e.g.
 * `analysis-service.stopBoardAnalysis`), drop every query
 * associated with that boardId from telemetry. Match queries
 * (boardId=null) are unaffected.
 */
function unregisterByBoard(boardId: BoardId): void {
  const fresh = new Map(queries.value);
  let changed = false;
  for (const [id, entry] of fresh) {
    if (entry.meta.boardId === boardId) {
      fresh.delete(id);
      changed = true;
    }
  }
  if (changed) queries.value = fresh;
}

// Public computed view. The tick ref participates in the
// dependency graph so the ETA refreshes once per second even
// without packets.
const inFlight: ComputedRef<InFlightQuery[]> = computed(() => {
  void tick.value; // touch for reactivity
  const out: InFlightQuery[] = [];
  for (const entry of queries.value.values()) {
    out.push({
      ...entry.meta,
      progress: { ...entry.progress },
      etaMs: etaForEntry(entry),
    });
  }
  // Stable order: by registration time, then queryId for ties. The
  // tooltip table reads top-to-bottom in submission order, which
  // matches how the user mentally indexes "what did I just fire."
  out.sort((a, b) => {
    if (a.startTimeMs !== b.startTimeMs) return a.startTimeMs - b.startTimeMs;
    return a.queryId.localeCompare(b.queryId);
  });
  return out;
});

// ── Composable export ─────────────────────────────────────────────────────────

/**
 * Returns the singleton's reactive view + mutator API. Every call
 * site receives the same `inFlight` ref (and the same mutator
 * functions), so a registration from `analysis-service` and a
 * read from the Toolbar see the same queue.
 */
export function useQueryTelemetry() {
  return {
    inFlight,
    registerQuery,
    unregisterQuery,
    recordPacket,
    unregisterByBoard,
  } as const;
}

// ── Test surface ──────────────────────────────────────────────────────────────

/**
 * Resets every module-scoped singleton container — used by tests to
 * isolate state between cases. Production code should never call
 * this; it bypasses the explicit register/unregister discipline.
 */
export function __resetQueryTelemetryForTests(): void {
  perfByModel.clear();
  queries.value = new Map();
  tick.value = 0;
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}
