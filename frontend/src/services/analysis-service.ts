/**
 * src/services/analysis-service.ts
 * Bridges KataGo (Turns) to the Ledger (Nodes).
 * License: Public Domain (The Unlicense)
 */

import { KataGoClient } from '../engine/katago/katago-client';
import {
  type KataGoAnalysisQuery,
  type Player,
  type KataCoord,
  type KataAnalysisResponse,
} from '../engine/katago/types';
import { type BoardId, type NodeId } from '../types';
import { moveToKataCoord, getActiveVariationPath, getBoardSize, getKomi, getInitialStones } from '../engine/util';
import { PONDER_MAX_VISITS } from '../engine/constants';
import { store, pushSystemMessage } from '../store';
import { ledger } from './analysis-ledger';
import { compileAnalysisConfig, activeConfigHash, hashConfig } from './analysis-config';
import { KATAGO_WS_URL } from '../config/env';

export class AnalysisService {
  private client: KataGoClient;
  private activeSubscriptions = new Map<BoardId, () => void>();
  private activeQueryIds = new Map<BoardId, string>();
  private activeQueries = new Map<string, { path: NodeId[], hash: string }>();
  // Per-board thunks that re-issue the most recent active query.
  // Keyed by BoardId; populated by analyzeRange/analyzeActiveNode and
  // cleared by stopBoardAnalysis. Used by restartActiveAnalyses to
  // re-fire active work when wire-flag-affecting state changes (e.g.,
  // toggling the ownership overlay).
  private restartCallbacks = new Map<BoardId, () => void>();
  private packetCount = 0;
  private metricsTimer: number | null = null;
  private watchdogTimer: number | null = null;

  constructor() {
    this.client = new KataGoClient('');
  }

  public connect() {
    const settings = store.profile.settings.engine as any;
    // URL resolution: user's profile setting wins; env-var default is the
    // out-of-the-box fallback for fresh installs where the profile hasn't
    // been configured yet. `||` (not `??`) is intentional so that an
    // empty-string setting (user cleared the field) also falls through.
    const url = settings?.katago?.url || KATAGO_WS_URL;
    
    this.client.connect(url, {
      onDisconnect: (code, reason) => {
        // Per-board maps (activeQueryIds, activeSubscriptions,
        // activeQueries, restartCallbacks) are intentionally NOT
        // cleared here. They hold closures over the now-dead WS,
        // but each new analyze* call's stopBoardAnalysis-first
        // pattern overwrites stale entries before issuing a fresh
        // subscribe — the closures are no-op-functional and don't
        // cause user-visible misbehavior. KataGoClient.subscribers
        // has the same as-designed shape: stale entries persist
        // through reconnect but get overwritten on next subscribe.
        // Resource-ownership audit O15 (and the related O6
        // verification on the subscribers side).
        store.engine.status = 'disconnected';
        store.engine.activeMode = {};
        // Clear engine identity on disconnect so a stale
        // version/model from a prior session can't surface in the
        // status bar after the WS drops. Reconnect fires
        // probeEngineInfo() via onConnect to repopulate.
        store.engine.info = { version: null, modelNames: [] };
        this.clearTimers();
        pushSystemMessage('warning', `WebSocket Disconnected (Code: ${code}). ${reason}`);
      },
      onError: (errorMsg) => {
        pushSystemMessage('error', errorMsg);
      },
      onConnect: () => {
        // Fresh WebSocket open (initial connection or reconnect).
        // Probe the engine identity so the status bar reflects the
        // live config — covers the case where the engine service
        // was restarted with a different version or model loadout
        // between sessions.
        void this.probeEngineInfo();
      },
    });

    store.engine.status = 'connected';
    this.startMetrics();
    this.startWatchdog();
  }

  /**
   * Send `query_version` and `query_models` and update
   * `store.engine.info` with the responses. Fires on each fresh
   * WebSocket open (initial connection + every reconnect) via the
   * onConnect callback above; the watchdog independently refreshes
   * `version` on each 5s tick so a mid-session engine restart with a
   * version bump surfaces without waiting for a full reconnect.
   *
   * Defensive parse on the models response: KataGo's wire shape for
   * `query_models` is an array of model entries whose per-entry shape
   * varies across versions (some return strings, some return objects
   * with a `name` field). The parse here handles both.
   *
   * Errors logged and swallowed — a probe failure is non-fatal; the
   * status bar just shows the cleared state until the next probe
   * succeeds. Per ADR-0002 the failure is logged loud enough to be
   * findable in the console.
   */
  private async probeEngineInfo(): Promise<void> {
    try {
      const versionResp = await this.client.sendCommand({
        id: `probe-version-${Date.now()}`,
        action: 'query_version',
      });
      const modelsResp = await this.client.sendCommand({
        id: `probe-models-${Date.now()}`,
        action: 'query_models',
      });

      const version = ('version' in versionResp && typeof versionResp.version === 'string')
        ? versionResp.version
        : null;

      const rawModels = ('models' in modelsResp && Array.isArray(modelsResp.models))
        ? modelsResp.models
        : [];
      const modelNames: string[] = [];
      for (const m of rawModels) {
        if (typeof m === 'string') {
          modelNames.push(m);
        } else if (m && typeof m === 'object') {
          const named = m as { name?: unknown; internalName?: unknown };
          if (typeof named.name === 'string') modelNames.push(named.name);
          else if (typeof named.internalName === 'string') modelNames.push(named.internalName);
        }
      }

      store.engine.info = { version, modelNames };
    } catch (err) {
      console.error('[AnalysisService] Failed to probe engine info:', err);
    }
  }

  private startMetrics() {
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    // magic-literal: 1000ms metrics-update interval — once-per-second
    // packet-rate refresh is the conventional cadence for engine-status
    // displays. Distinct role from --duration-* CSS scale.
    this.metricsTimer = window.setInterval(() => {
      store.engine.metrics = { ...store.engine.metrics, packetsPerSecond: this.packetCount };
      this.packetCount = 0;
    }, 1000);
  }

  private startWatchdog() {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = window.setInterval(async () => {
      if (store.engine.status !== 'connected') return;
      const start = performance.now();
      const resp = await this.client.sendCommand({ id: `wd-${Date.now()}`, action: 'query_version' });
      store.engine.metrics = {
        ...store.engine.metrics,
        lastWatchdogTimestamp: Date.now(),
        latencyMs: Math.round(performance.now() - start)
      };
      // Capture the version on each tick so a mid-session engine
      // restart with a version bump surfaces in the status bar
      // without waiting for a full WebSocket reconnect. Models are
      // refreshed only on connect (probeEngineInfo) since a model
      // change typically requires a service restart anyway.
      if ('version' in resp && typeof resp.version === 'string'
          && resp.version !== store.engine.info.version) {
        store.engine.info = { ...store.engine.info, version: resp.version };
      }
    }, 5000);
  }

  private clearTimers() {
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
  }

  public disconnect() {
    this.client.disconnect();
    store.engine.status = 'disconnected';
    store.engine.activeMode = {};
    store.engine.info = { version: null, modelNames: [] };
    this.clearTimers();
  }

  public analyzeFullGame(boardId: BoardId, visits: number) {
    const board = store.boards.find(b => b.id === boardId);
    if (!board || store.engine.status !== 'connected') return;
    const fullPath = getActiveVariationPath(board) as NodeId[];
    this.analyzeRange(boardId, fullPath, 0, fullPath.length - 1, visits);
  }

  public analyzeRange(
    boardId: BoardId,
    fullPath: NodeId[],
    startTurn: number,
    endTurn: number,
    visits: number,
    configOverride?: Record<string, unknown>
  ) {
    const board = store.boards.find(b => b.id === boardId);
    if (board) (board as any).maxVisitsTarget = visits;
    if (!board || store.engine.status !== 'connected') return;
    if (fullPath.length === 0 || endTurn < startTurn) return;

    this.stopBoardAnalysis(boardId);

    const size = getBoardSize(board);
    const komi = getKomi(board);
    const pathUpToEnd = fullPath.slice(0, endTurn + 1);

    const moves = pathUpToEnd
      .map(id => board.nodes[id]?.move ?? null)
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map(m => [m.color, moveToKataCoord(m)] as [Player, KataCoord]);

    const initialStones = getInitialStones(board);

    const analyzeTurns = Array.from({ length: endTurn - startTurn + 1 }, (_, i) => startTurn + i);
    const queryId = `range-${boardId}-${Date.now()}`;

    const analysis_config = configOverride || compileAnalysisConfig();
    const hash = configOverride ? hashConfig(configOverride) : activeConfigHash.value;

    this.activeQueries.set(queryId, { path: fullPath, hash });

    // The query is now type-honest end-to-end: KataGoAnalysisQuery declares
    // `cache`, `lookup_cache`, and `analysis_config` as accepted wire fields
    // (see engine/katago/types.ts), so no inline intersection type or cast
    // workaround is needed. This is what the type-honest version of this
    // call site looks like.
    const ownershipModes = store.session.ui.overlayLayers.ownership;
    const needsOwnership = ownershipModes.continuous || ownershipModes.dots || ownershipModes.liveness;
    // Replay-cache flags are user-controlled via the registry editor;
    // read fresh on each call so a registry-edit-then-restart picks up
    // the new value immediately. Schema-version 14 surfaced these.
    const cacheFlags = {
      cache: store.profile.settings.engine.katago.cache,
      lookup_cache: store.profile.settings.engine.katago.lookup_cache,
      replay_final_only: store.profile.settings.engine.katago.replay_final_only,
    };
    const query: KataGoAnalysisQuery = {
      id: queryId,
      moves,
      ...(initialStones.length ? { initialStones } : {}),
      rules: 'tromp-taylor',
      boardXSize: size,
      boardYSize: size,
      komi, // Added Komi mapping
      maxVisits: visits,
      ...cacheFlags,
      reportDuringSearchEvery: 0.5,
      analyzeTurns,
      ...(needsOwnership ? { includeOwnership: true } : {}),
      ...(analysis_config ? { analysis_config } : {})
    };

    store.engine.activeMode[boardId] = 'analyze';
    const unsubscribe = this.client.subscribe(query, (res) => {
      this.onAnalysisUpdate(res as KataAnalysisResponse, queryId);
    });

    this.activeSubscriptions.set(boardId, unsubscribe);
    this.activeQueryIds.set(boardId, queryId);
    this.restartCallbacks.set(
      boardId,
      () => this.analyzeRange(boardId, fullPath, startTurn, endTurn, visits, configOverride),
    );
  }

  public analyzeActiveNode(
    boardId: BoardId,
    mode: 'ponder' | 'analyze',
    visits?: number,
    configOverride?: Record<string, unknown>
  ) {
    const board = store.boards.find(b => b.id === boardId);
    if (!board || store.engine.status !== 'connected') return;

    const fullPath = getActiveVariationPath(board) as NodeId[];
    const currentIdx = fullPath.indexOf(board.currentNodeId as NodeId);
    if (currentIdx === -1) return;

    this.stopBoardAnalysis(boardId);

    const size = getBoardSize(board);
    const komi = getKomi(board);
    const pathUpToCurrent = fullPath.slice(0, currentIdx + 1);

    const moves = pathUpToCurrent
      .map(id => board.nodes[id as NodeId]?.move ?? null)
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map(m => [m.color, moveToKataCoord(m)] as [Player, KataCoord]);

    const initialStones = getInitialStones(board);

    const queryId = `${mode}-${boardId}-${Date.now()}`;
    const analysis_config = configOverride || compileAnalysisConfig();
    const hash = configOverride ? hashConfig(configOverride) : activeConfigHash.value;

    this.activeQueries.set(queryId, { path: fullPath, hash });

    const ownershipModes = store.session.ui.overlayLayers.ownership;
    const needsOwnership = ownershipModes.continuous || ownershipModes.dots || ownershipModes.liveness;
    const cacheFlags = {
      cache: store.profile.settings.engine.katago.cache,
      lookup_cache: store.profile.settings.engine.katago.lookup_cache,
      replay_final_only: store.profile.settings.engine.katago.replay_final_only,
    };
    const query: KataGoAnalysisQuery = {
      id: queryId,
      moves,
      ...(initialStones.length ? { initialStones } : {}),
      rules: 'tromp-taylor',
      boardXSize: size,
      boardYSize: size,
      komi, // Added Komi mapping
      ...(visits !== undefined ? { maxVisits: visits } : {}),
      ...cacheFlags,
      // magic-literal: reportDuringSearchEvery cadences — 0.15s for ponder
      // (frequent updates as ponder accumulates over long horizons), 0.5s
      // for analysis (less frequent — bounded query, less to update).
      // Mode-specific KataGo wire-protocol cadence; not a substrate scale.
      ...(mode === 'ponder' ? { reportDuringSearchEvery: 0.15, maxVisits: PONDER_MAX_VISITS } : { reportDuringSearchEvery: 0.5 }),
      analyzeTurns: [currentIdx],
      ...(needsOwnership ? { includeOwnership: true } : {}),
      ...(analysis_config ? { analysis_config } : {})
    };

    store.engine.activeMode[boardId] = mode;
    const unsubscribe = this.client.subscribe(query, (res) => {
      this.onAnalysisUpdate(res as KataAnalysisResponse, queryId);
    });

    this.activeSubscriptions.set(boardId, unsubscribe);
    this.activeQueryIds.set(boardId, queryId);
    this.restartCallbacks.set(
      boardId,
      () => this.analyzeActiveNode(boardId, mode, visits, configOverride),
    );
  }

  /**
   * Re-issue every currently-active analysis query. Used when a piece
   * of state external to the query parameters (e.g., the overlay-layer
   * toggle that gates `includeOwnership`) changes and must propagate
   * into the engine's wire request. Each restart goes through the
   * normal stop-then-issue path, so subscribers see the standard
   * lifecycle.
   */
  public restartActiveAnalyses(): void {
    for (const cb of Array.from(this.restartCallbacks.values())) {
      cb();
    }
  }

  private onAnalysisUpdate(response: KataAnalysisResponse, queryId: string) {
    this.packetCount++;
    const queryInfo = this.activeQueries.get(queryId);
    if (!queryInfo) return;

    const nodeId = queryInfo.path[response.turnNumber];
    if (nodeId) {
      ledger.record(queryInfo.hash, nodeId, response);
      const board = store.boards.find(b => this.activeQueryIds.get(b.id) === queryId);
      if (board) {
        board.lastActivity = Date.now();
        store.engine.metrics = { ...store.engine.metrics, lastResponseId: board.id };
      }
    }
  }

  public stopBoardAnalysis(boardId: BoardId) {
    const prevId = this.activeQueryIds.get(boardId);
    const unsub = this.activeSubscriptions.get(boardId);
    if (unsub) unsub();
    if (prevId) {
      this.client.sendCommand({ id: `term-${Date.now()}`, action: 'terminate', terminateId: prevId });
      this.activeQueries.delete(prevId);
    }
    this.activeSubscriptions.delete(boardId);
    this.activeQueryIds.delete(boardId);
    this.restartCallbacks.delete(boardId);
    store.engine.activeMode[boardId] = 'none';
  }

  /**
   * Stop every board's active analysis. Snapshots the active set
   * before iterating because stopBoardAnalysis mutates the underlying
   * map. Used by the HMR dispose hook below; safe to call from any
   * context that wants to release every per-board analysis resource
   * the singleton holds.
   */
  public stopAllBoardAnalyses(): void {
    const boardIds = Array.from(this.activeQueryIds.keys());
    for (const boardId of boardIds) {
      this.stopBoardAnalysis(boardId);
    }
  }
}

export const analysisService = new AnalysisService();

// HMR dispose — dev-only. Vite re-instantiates this module's singleton
// when the file (or one of its transitive dependencies) is hot-replaced;
// without this hook the outgoing singleton's WebSocket and per-board
// bookkeeping become orphaned (the new singleton starts fresh, but the
// old singleton's in-flight ponders never receive a client-side
// terminate). The proxy's keep-alive middleware is the production
// safety net; this is the cleaner dev-loop path.
//
// Order matters: emit per-board terminate packets first, while the
// outgoing WebSocket is still open, so the proxy sees explicit
// terminates rather than only the disconnect-side orphan cleanup
// from Phase 1 of the keep-alive dispatch. Then close the WebSocket.
//
// import.meta.hot is undefined in production builds, so this whole
// block is dead code outside dev. The conditional is statically
// removable by Vite's tree-shaker.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    analysisService.stopAllBoardAnalyses();
    analysisService.disconnect();
  });
}
