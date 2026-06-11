/**
 * src/services/engine-connection.ts
 *
 * Owner module for the `store.engine` connection-state subtree — the
 * analysis-provider connection lifecycle: connect / disconnect-reset /
 * info / selection / metrics. Named for the problem class, not the
 * provider: nothing here is KataGo-specific; the provider-specific
 * wire work (queries, packets, probes) stays in `analysis-service.ts`,
 * which calls these owner functions instead of writing `store.engine`
 * directly.
 *
 * Why an owner module (history-lessons audit §3.7, leg (iii);
 * work-status item `multi-writer-slots-get-owners`): the subtree
 * previously had ~19 direct `store.engine.*` assignments scattered
 * through `analysis-service.ts`, including a disconnect-reset block
 * duplicated verbatim between the WS `onDisconnect` callback and the
 * user-initiated `disconnect()` — the multi-writer shape whose
 * per-writer drift the audit's L2 lesson names. Collapsing the writes
 * behind named owner functions gives the slot one grep target, one
 * place to keep the reset complete, and makes `store.engine` plus this
 * owner a wholesale-replaceable unit for a fork with a different (or
 * no) analysis provider. `setSelectedModel` (the one pre-existing
 * named mutator for this subtree, in `store/index.ts`) stays where it
 * is — the selection leg routes through it; the system-message actions
 * (`pushSystemMessage` et al., also `store/index.ts`) likewise remain
 * the `engine.messages` owners. The writer set is enumerated by the
 * `local/store-write-needs-owner` lint in `eslint.config.js`.
 *
 * Deliberately preserved semantics (recorded, not decided here):
 *
 * - **`resetWorkspace` does NOT reset `store.engine`.** Under the
 *   current local-machine deployment the WebSocket URL is not
 *   user-keyed, so the live connection remains honestly applicable to
 *   any identity; half-resetting would be an ADR-0001 violation (see
 *   `resetWorkspace`'s docstring). When deployment shifts to user-keyed
 *   endpoints, full engine reset + actual disconnect at identity flip
 *   becomes the right move — tracked as work-status item
 *   `engine-connection-lifecycle-logout`, for which this module is the
 *   natural landing (the logout arc becomes "call
 *   `applyEngineDisconnectReset` + the service's transport teardown"
 *   rather than a new scatter of writes).
 *
 * - **`restartActiveAnalyses` semantics — "active" = in-flight
 *   (maintainer-decided 2026-06-10; the hydration-rebind residue
 *   audit, 2026-06-10, §3.3 wrinkle 2 / §6.1 question, now resolved).**
 *   The restart thunks live in `analysis-service.ts`. They now mean
 *   "every query still IN FLIGHT": `onAnalysisUpdate` reaps a query's
 *   restart thunk on natural completion (once every analyzed turn has
 *   settled with `isDuringSearch === false`), so a completed query is
 *   not re-issued. The other three bookkeeping maps (`activeQueries`,
 *   `activeSubscriptions`, `boardToQueries`) deliberately survive both
 *   natural completion and a disconnect→reconnect — the O15
 *   reconcile-on-next-interaction decision, documented at the
 *   `onDisconnect` callback — so the audit §3.3 wrinkle 1 bounds (per-
 *   board map growth cleared at board close; the `activeMode`
 *   projection drift) are unchanged. The reap is scoped to the restart
 *   thunk alone, which is exactly the slot whose membership the
 *   semantics question was about. The earlier "*not explicitly
 *   stopped*" reading (arguably intended for qEUBO A/B re-runs) was the
 *   open question this extraction recorded; the maintainer settled it
 *   to *in flight* — a qEUBO toolbar-view toggle, especially after a
 *   reconnect, must re-fire only the queries the user still has
 *   running, not resurrect completed or pre-disconnect work at
 *   engine-compute cost. Work-status item
 *   `restart-thunk-inflight-semantics`.
 *
 * License: Public Domain (The Unlicense)
 */

import { store, setSelectedModel } from '../store';
import type { AnalysisMode, BoardId, EngineInfo } from '../types';

/**
 * The empty engine-identity shape. Single construction site so the
 * disconnect-reset clear and any future "no identity yet" consumer
 * cannot drift apart field-by-field (the duplicated-block failure this
 * module collapses). `store/defaults.ts` initialises the store with
 * the same shape inline; the runtime clear goes through here.
 */
function emptyEngineInfo(): EngineInfo {
  return {
    version: null,
    internalName: null,
    versionPayload: null,
    modelsPayload: null,
    availableModels: [],
    capabilities: null,
  };
}

// ── Connect / disconnect-reset ────────────────────────────────────────────────

/** Connection established (WS open). Status only — identity arrives
 *  asynchronously via the probe (`setEngineInfo`). */
export function markEngineConnected(): void {
  store.engine.status = 'connected';
}

/**
 * The single disconnect-reset: every `store.engine` consequence of the
 * connection going away, applied identically whether the WS dropped
 * (`onDisconnect`) or the user disconnected (`disconnect()`) — the two
 * call sites whose hand-duplicated blocks previously drifted apart in
 * ordering and were one missed field away from drifting in content.
 *
 *   - `status` → 'disconnected'.
 *   - `activeMode` → {} (no board can be analyzing over a dead WS).
 *   - `info` → empty shape, so a stale identity from a prior session
 *     can't surface in the toolbar; reconnect re-probes.
 *   - `selectedModel` → null via the named mutator — a stale SELECTOR
 *     choice must not silently apply to a freshly-connected proxy
 *     whose upstream pool may differ.
 *   - `metrics.pingPendingSince` → null, so the optional watchdog-dot
 *     animation doesn't show a stale "pending" state across reconnect.
 *
 * Transport-side teardown (telemetry sweep over the service's private
 * query maps, timer clears, the WS close itself, the user-facing
 * system message) is the analysis-service's, not this owner's — this
 * function is exactly the `store.engine` projection of "disconnected".
 * The service's bookkeeping maps are deliberately NOT cleared on
 * disconnect (the O15 reconcile-on-next-interaction decision, see the
 * `onDisconnect` comment in `analysis-service.ts` and the
 * restart-semantics note in this file's header).
 */
export function applyEngineDisconnectReset(): void {
  store.engine.status = 'disconnected';
  store.engine.activeMode = {};
  store.engine.info = emptyEngineInfo();
  setSelectedModel(null);
  store.engine.metrics = { ...store.engine.metrics, pingPendingSince: null };
}

// ── Info (engine identity) ────────────────────────────────────────────────────

/** Replace the engine identity wholesale — the probe result on each
 *  fresh WS open (`probeEngineInfo`). `EngineInfo` is a readonly value
 *  object; the container slot is reassigned, never field-mutated. */
export function setEngineInfo(info: EngineInfo): void {
  store.engine.info = info;
}

/**
 * Watchdog-tick version refresh: a mid-session engine restart with a
 * version bump surfaces in the toolbar without waiting for a full
 * reconnect. Spread-merges so the probe-time model identity
 * (`internalName`, `modelsPayload`, `availableModels`, `capabilities`)
 * is preserved — models are re-probed only on connect.
 */
export function refreshEngineVersion(
  version: string,
  versionPayload: Record<string, unknown> | null,
): void {
  store.engine.info = { ...store.engine.info, version, versionPayload };
}

// ── Metrics ───────────────────────────────────────────────────────────────────

/** Once-per-second packet-rate tick (`startMetrics`). */
export function recordPacketRate(packetsPerSecond: number): void {
  store.engine.metrics = { ...store.engine.metrics, packetsPerSecond };
}

/** Watchdog ping fired — mark in flight so the optional ping-tandem
 *  watchdog-dot animation can run on the outbound edge. */
export function markWatchdogPingPending(): void {
  store.engine.metrics = { ...store.engine.metrics, pingPendingSince: Date.now() };
}

/** Watchdog pong received — record latency, stamp the tick, clear the
 *  pending marker so the animation resets. */
export function recordWatchdogPong(latencyMs: number): void {
  store.engine.metrics = {
    ...store.engine.metrics,
    lastWatchdogTimestamp: Date.now(),
    latencyMs,
    pingPendingSince: null,
  };
}

/** Per-packet "which board heard from the engine last" stamp
 *  (`onAnalysisUpdate`). */
export function recordLastResponseBoard(boardId: BoardId): void {
  store.engine.metrics = { ...store.engine.metrics, lastResponseId: boardId };
}

// ── Per-board active-mode projection ──────────────────────────────────────────

/**
 * Terminal write for the `activeMode` projection. The projection
 * *logic* (analyze > ponder > none over the board's live query set)
 * stays in `analysis-service.ts::recomputeActiveMode` — it reads the
 * service's private bookkeeping maps and is threaded through query
 * minting (`indexQueryOnBoard`) and release (`stopQuery` /
 * `stopBoardAnalysis`); only the store write goes through the owner.
 * The per-board key is *deleted* (not set to 'none') by `closeBoard`'s
 * `BOARD_SCOPED_STORE_CELLS` drain in `store/index.ts`, the store-side
 * owner of board-lifecycle teardown.
 */
export function setBoardActiveMode(boardId: BoardId, mode: AnalysisMode): void {
  store.engine.activeMode[boardId] = mode;
}
