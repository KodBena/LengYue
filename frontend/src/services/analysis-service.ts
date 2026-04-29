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
import { moveToKataCoord, getActiveVariationPath, getBoardSize, getKomi } from '../engine/util';
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
        store.engine.status = 'disconnected';
        store.engine.activeMode = {};
        this.clearTimers();
        pushSystemMessage('warning', `WebSocket Disconnected (Code: ${code}). ${reason}`);
      },
      onError: (errorMsg) => {
        pushSystemMessage('error', errorMsg);
      }
    });

    store.engine.status = 'connected';
    this.startMetrics();
    this.startWatchdog();
  }

  private startMetrics() {
    if (this.metricsTimer) clearInterval(this.metricsTimer);
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
      await this.client.sendCommand({ id: `wd-${Date.now()}`, action: 'query_version' });
      store.engine.metrics = {
        ...store.engine.metrics,
        lastWatchdogTimestamp: Date.now(),
        latencyMs: Math.round(performance.now() - start)
      };
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
    const query: KataGoAnalysisQuery = {
      id: queryId,
      moves,
      rules: 'tromp-taylor',
      boardXSize: size,
      boardYSize: size,
      komi, // Added Komi mapping
      maxVisits: visits,
      cache: false,
      lookup_cache: false,
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

    const queryId = `${mode}-${boardId}-${Date.now()}`;
    const analysis_config = configOverride || compileAnalysisConfig();
    const hash = configOverride ? hashConfig(configOverride) : activeConfigHash.value;

    this.activeQueries.set(queryId, { path: fullPath, hash });

    const ownershipModes = store.session.ui.overlayLayers.ownership;
    const needsOwnership = ownershipModes.continuous || ownershipModes.dots || ownershipModes.liveness;
    const query: KataGoAnalysisQuery = {
      id: queryId,
      moves,
      rules: 'tromp-taylor',
      boardXSize: size,
      boardYSize: size,
      komi, // Added Komi mapping
      ...(visits !== undefined ? { maxVisits: visits } : {}),
      ...(mode === 'ponder' ? { reportDuringSearchEvery: 0.15, maxVisits: 100000 } : { reportDuringSearchEvery: 0.5 }),
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
}

export const analysisService = new AnalysisService();
