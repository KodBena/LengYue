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
  type WinrateFraming,
} from '../engine/katago/types';
import {
  resolveWinrateFraming,
  normalizePacketToWhiteFraming,
} from '../engine/katago/winrate-framing';
import {
  parseVersionResponse,
  parseModelsResponse,
  requiresDeltaAnalysisRefusal,
} from '../engine/katago/version-probe';
import {
  buildPerQueryCapabilities,
  shouldWarnTranspositionUnmet,
} from '../engine/katago/capability-injection';
import { type BoardId, type NodeId } from '../types';
import { moveToKataCoord, getActiveVariationPath, getBoardSize, getKomi, getInitialStones } from '../engine/util';
import { store, pushSystemMessage } from '../store';
import { ledger } from './analysis-ledger';
import {
  compileAnalysisConfig,
  compileEngineOverrides,
  compileAnalysisDescriptorFromParts,
  activeConfigHash,
  hashConfig,
} from './analysis-config';
import { KATAGO_WS_URL } from '../config/env';
import { i18n } from '../i18n';
import { useQueryTelemetry } from '../composables/useQueryTelemetry';

const telemetry = useQueryTelemetry();

export class AnalysisService {
  private client: KataGoClient;
  private activeSubscriptions = new Map<BoardId, () => void>();
  private activeQueryIds = new Map<BoardId, string>();
  // Per-query bookkeeping. `framing` is the
  // `reportAnalysisWinratesAs` value the wire query was sent with;
  // every packet that arrives under this query is normalised through
  // `normalizePacketToWhiteFraming(_, framing)` before reaching the
  // ledger so consumers downstream see canonical 'WHITE' regardless
  // of what the user picked in the registry. See
  // `engine/katago/winrate-framing.ts` for the normalisation contract
  // and the deliberate scope (raw signed scalars yes; proxy-applied
  // `extra.*` enrichment no).
  private activeQueries = new Map<string, {
    path: NodeId[],
    hash: string,
    framing: WinrateFraming,
    // Present only for ponder-mode queries; absent for analyzeRange
    // and analyzeActiveNode(mode='analyze'). When the final packet
    // arrives for a ponder query (isDuringSearch=false), the
    // analysis service surfaces a "ponder ceiling reached" system
    // warning naming the ceiling — the user's hardware finished
    // ponder before they stopped it and might want to raise
    // engine.katago.ponderMaxVisits. ponderCeiling is the
    // configured value at query-start time (snapshot, so mid-query
    // registry edits don't change what we report).
    ponderCeiling?: number,
  }>();
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
        //
        // Telemetry IS cleared here, separately from the closure
        // maps above: the user-visible queue tooltip needs to
        // reflect that the proxy has dropped every in-flight
        // query on this side of the WS. The closure maps don't
        // need clearing because they don't surface to the user;
        // the queue tooltip reads from `useQueryTelemetry` and
        // would otherwise show stale "in-flight" rows until the
        // user fires a new query that overwrites them. Match
        // queries (registered through `usePlayFromPosition`'s
        // separate `KataGoClient`) carry boardId=null and are
        // unaffected — they live on their own WS.
        for (const queryId of this.activeQueryIds.values()) {
          telemetry.unregisterQuery(queryId);
        }
        store.engine.status = 'disconnected';
        store.engine.activeMode = {};
        // Reset the in-flight ping marker so the optional
        // watchdog-dot animation doesn't display a stale "pending"
        // state across a reconnect. The next `startWatchdog`
        // iteration sets it freshly when the new WS is up.
        store.engine.metrics = { ...store.engine.metrics, pingPendingSince: null };
        // Clear engine identity on disconnect so a stale
        // version/model from a prior session can't surface in the
        // toolbar after the WS drops. Reconnect fires
        // probeEngineInfo() via onConnect to repopulate.
        // SELECTOR's `selectedModel` is cleared symmetrically — a
        // stale selection from a prior proxy must not silently apply
        // to a freshly-connected proxy whose upstream pool may
        // differ.
        store.engine.info = {
          version: null,
          internalName: null,
          versionPayload: null,
          modelsPayload: null,
          availableModels: [],
          capabilities: null,
        };
        store.engine.selectedModel = null;
        this.clearTimers();
        pushSystemMessage('warning', i18n.global.t('analysis.websocketDisconnected', { code, reason }));
      },
      onError: (errorMsg) => {
        pushSystemMessage('error', errorMsg);
      },
      onConnect: () => {
        // Fresh WebSocket open (initial connection or reconnect).
        // Probe the engine identity so the toolbar reflects the
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
   * The visible label is `models[0].internalName` — KataGo's short
   * model self-identifier. The `name` field is intentionally NOT
   * surfaced in the visible label because on most installs it's the
   * model file's full pathname (privacy concern in screenshare /
   * streaming contexts). The full response payloads are retained
   * verbatim so a tooltip can show them on demand. See KataGo's
   * Analysis_Engine.md for the protocol; the user surfaced this
   * privacy distinction during PR #145 review.
   *
   * Errors logged and swallowed — a probe failure is non-fatal; the
   * toolbar just shows the cleared state until the next probe
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

      // The discriminated `KataGoResponse` union widens to `unknown`
      // for the parser's input — the parsers do their own structural
      // type-guards rather than relying on the union's tag, because
      // the version-response shape is the proxy's wire contract
      // rather than a strict subset of the union (the new
      // `capabilities` field doesn't appear on `KataActionResponse`'s
      // declaration in this build's pre-codegen world; the parser
      // honours what's actually on the wire).
      const versionResult = parseVersionResponse(versionResp);
      const modelsResult = parseModelsResponse(modelsResp);

      // Connection-refusal path per the dispatch's *Frontend will
      // not* exception. When the proxy advertises capabilities at
      // all but `delta_analysis` is missing, no per-query opt-in can
      // rescue the situation — the SPA universally needs the
      // analysis-enricher Transformer's `extra.<color>.deltas` for
      // review-session grading. Surface, disconnect, return.
      if (requiresDeltaAnalysisRefusal(versionResult.capabilities)) {
        pushSystemMessage(
          'error',
          i18n.global.t('analysis.proxyMissingDeltaAnalysis'),
        );
        this.disconnect();
        return;
      }

      store.engine.info = {
        version: versionResult.version,
        internalName: modelsResult.internalName,
        versionPayload: versionResult.raw,
        modelsPayload: modelsResult.raw,
        availableModels: modelsResult.availableModels,
        capabilities: versionResult.capabilities,
      };

      // Auto-select the first available model when SELECTOR is in
      // play and the user hasn't explicitly chosen one. This keeps
      // the wire contract honest — without a selection the proxy's
      // SELECTOR rejects the query — while still letting the
      // Toolbar dropdown be the user-visible affordance for
      // changing the choice. The check on `availableModels` having
      // more than one entry distinguishes SELECTOR-mode (multiple
      // labelled models) from LEAF-mode (single model, no
      // dropdown, no `model` field needed on outgoing queries).
      const isSelectorMode =
        versionResult.capabilities !== null &&
        'selector' in versionResult.capabilities;
      if (isSelectorMode
          && store.engine.selectedModel === null
          && modelsResult.availableModels.length > 0) {
        store.engine.selectedModel = modelsResult.availableModels[0].label;
      }

      // Once-per-WS-open transposition-unmet warning. Fires when
      // the registry toggle is on but the proxy doesn't advertise
      // the capability — the asymmetric case the dispatch's
      // *Behavioural contract* §4 names. The per-query injection
      // helper silently omits the opt-in in this state; this
      // probe-time message is the surfacing path that tells the
      // user their toggle isn't being honoured. Per ADR-0002,
      // surfacing happens once per probe rather than per-query so
      // the system log isn't flooded.
      const useTransposition = !!(store.profile.settings.engine as { katago?: { useTransposition?: boolean } })
        .katago?.useTransposition;
      if (shouldWarnTranspositionUnmet(versionResult.capabilities, useTransposition)) {
        pushSystemMessage(
          'warning',
          i18n.global.t('analysis.proxyMissingTransposition'),
        );
      }
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
      // Mark a ping in flight before issuing the command so the
      // optional ping-tandem watchdog-dot animation (gated by
      // `session.ui.watchdogColorTransition`) can fire on the
      // outbound edge and reset on the pong.
      store.engine.metrics = {
        ...store.engine.metrics,
        pingPendingSince: Date.now(),
      };
      const start = performance.now();
      const resp = await this.client.sendCommand({ id: `wd-${Date.now()}`, action: 'query_version' });
      store.engine.metrics = {
        ...store.engine.metrics,
        lastWatchdogTimestamp: Date.now(),
        latencyMs: Math.round(performance.now() - start),
        // Pong received — clear the pending state so the animation
        // resets to green.
        pingPendingSince: null,
      };
      // Capture the version on each tick so a mid-session engine
      // restart with a version bump surfaces in the toolbar
      // without waiting for a full WebSocket reconnect. Also
      // refresh `versionPayload` so the hover tooltip stays
      // current. Models are refreshed only on connect
      // (probeEngineInfo) since a model change typically requires
      // a service restart anyway.
      if ('version' in resp && typeof resp.version === 'string'
          && resp.version !== store.engine.info.version) {
        // Same two-step cast through `unknown` as probeEngineInfo's
        // payload widening — see the comment block there for the
        // ADR-0002 Rule 2 justification.
        const versionPayload = (resp && typeof resp === 'object')
          ? (resp as unknown as Record<string, unknown>)
          : null;
        store.engine.info = {
          ...store.engine.info,
          version: resp.version,
          versionPayload,
        };
      }
    }, 5000);
  }

  private clearTimers() {
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
  }

  public disconnect() {
    // Telemetry sweep before `client.disconnect()` so the queue
    // tooltip clears immediately on user-initiated disconnect
    // (rather than waiting for the WS-level onDisconnect to fire,
    // which usually happens but isn't strictly guaranteed if the
    // client tears down synchronously). Match queries are
    // preserved by construction (boardId=null, not in this map).
    for (const queryId of this.activeQueryIds.values()) {
      telemetry.unregisterQuery(queryId);
    }
    this.client.disconnect();
    store.engine.status = 'disconnected';
    store.engine.activeMode = {};
    store.engine.info = {
      version: null,
      internalName: null,
      versionPayload: null,
      modelsPayload: null,
      availableModels: [],
      capabilities: null,
    };
    store.engine.selectedModel = null;
    // Symmetric ping-flag reset — see the onDisconnect handler's
    // comment above for the rationale.
    store.engine.metrics = { ...store.engine.metrics, pingPendingSince: null };
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
    configOverride?: Record<string, unknown>,
    overrideSettingsOverride?: Record<string, unknown>,
    forReview: boolean = false,
    isRealtime: boolean = true,
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

    // When the caller supplied a `configOverride` it provided BOTH
    // analysis_config and overrideSettings; both legs come from the
    // caller, including a missing `overrideSettingsOverride` which
    // means "no overrides on the wire" (a card minted before the
    // overrideSettings field existed). Falling back to
    // `compileEngineOverrides()` in that case would silently bind
    // the card's analysis posture to the user's CURRENT registry
    // values, breaking the caller's intent that the recorded
    // descriptor is the source of truth.
    //
    // This is purely a parameter-presence check. It is independent
    // of the `isRealtime` parameter, which controls
    // `reportDuringSearchEvery` and is the caller's separate intent
    // about whether they want during-search packets streamed back.
    const hasConfigOverride = configOverride !== undefined;
    const analysis_config = configOverride ?? compileAnalysisConfig();
    const overrideSettings = hasConfigOverride
      ? overrideSettingsOverride
      : compileEngineOverrides();
    // The current SELECTOR target is read live in both branches — a
    // query that targets a different network produces different
    // packets and must bucket separately in the ledger from one
    // targeting another network. `activeConfigHash` already accounts
    // for this in the live branch (it reads the same source).
    const hash = hasConfigOverride
      ? hashConfig(compileAnalysisDescriptorFromParts(
          analysis_config, overrideSettings, store.engine.selectedModel ?? undefined,
        ))
      : activeConfigHash.value;
    // Resolve the framing the wire is about to ask KataGo for and
    // cache it on the active-query entry; `onAnalysisUpdate`
    // normalises every response packet through this value before
    // recording into the ledger. Read once at query construction so
    // a mid-query registry edit (the user toggles
    // `reportAnalysisWinratesAs` while ponder is still streaming)
    // doesn't desync the in-flight packets — they're still in the
    // framing of the ORIGINAL ask. The watcher in `useAppBootstrap`
    // / `restartActiveAnalyses` is the path that picks up registry
    // edits cleanly, by stop-then-issue with the new framing.
    const framing = resolveWinrateFraming(overrideSettings);

    this.activeQueries.set(queryId, { path: fullPath, hash, framing });

    // Queue telemetry — register at construction so the Toolbar's
    // queue tooltip can render this range query and its ETA.
    // `cancel` defers to the standard stop-board path so the
    // proxy gets a `terminate` and the local maps clean up
    // identically to any other interruption.
    telemetry.registerQuery({
      queryId,
      kind:         'range',
      boardId,
      model:        store.engine.selectedModel,
      startTimeMs:  Date.now(),
      turnsTotal:   analyzeTurns.length,
      visitsPerTurn: visits,
      label:        forReview ? 'grading' : undefined,
      cancel:       () => this.stopBoardAnalysis(boardId),
    });

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
    // `overrideSettings` resolved above already accounts for the
    // snapshot-vs-live distinction. Conditionally include so an
    // empty / undefined value falls back to KataGo's config-file
    // values rather than wire-overriding them with a no-op.
    const hasOverrides =
      overrideSettings !== undefined && Object.keys(overrideSettings).length > 0;
    // Per-query capability opt-in (proxy v1.0.14+). Range-based
    // queries engage `adaptive_reevaluate` in live mode; snapshot
    // replays omit it (the middleware's mid-stream follow-ups
    // would diverge from the card's recorded analysis). The helper
    // returns `undefined` against pre-v1.0.14 proxies (advertised
    // is null) so the wire field stays absent and the proxy's
    // legacy auto-engage path runs. SELECTOR routing key is read
    // from `store.engine.selectedModel`; null on LEAF / RELAY /
    // ECHO proxies and on SELECTOR proxies before the user picks
    // a model — in either case the wire field is omitted.
    const capabilities = buildPerQueryCapabilities({
      advertised: store.engine.info.capabilities,
      isRangeBased: true,
      forReview,
      useTransposition: store.profile.settings.engine.katago.useTransposition,
      adaptiveReevaluate: store.profile.settings.engine.katago.adaptiveReevaluate,
    });
    const selectedModel = store.engine.selectedModel;
    // `reportDuringSearchEvery` is the wire signal for "stream me
    // during-search packets every N seconds." Caller-controlled via
    // `isRealtime`: callers that only read the final packet (review
    // session via `Promise.all([waitForAnalysis(s_0), waitForAnalysis(s_1)])`,
    // both settling on `isDuringSearch === false`) pass `false` so
    // the proxy doesn't churn intermediate packets through the
    // ledger. Realtime callers (analysis-tab range selection,
    // full-game analyze) keep the default and get the 0.5s cadence
    // so reactive views update during ponder.
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
      // Report cadences are user-tunable registry leaves
      // (knob-registry Phase 6, 2026-05-15 promotion). The
      // wire-side `Math.min` clamp enforces the semantic invariant
      // `firstReportDuringSearchAfter ≤ reportDuringSearchEvery`
      // even if the stored leaves drift (the KnobInputDecl's
      // `maxFromKnob` constrains the slider's effective max but
      // doesn't auto-clamp the persisted value when the cadence
      // is reduced; the wire clamp is the defence-in-depth so
      // KataGo always sees a coherent pair). Snapshot / review
      // paths pass `isRealtime=false` and omit both fields
      // entirely so during-search packets don't pollute the
      // recorded analysis.
      ...(isRealtime ? {
        reportDuringSearchEvery: store.profile.settings.engine.katago.reportDuringSearchEvery,
        firstReportDuringSearchAfter: Math.min(
          store.profile.settings.engine.katago.firstReportDuringSearchAfter,
          store.profile.settings.engine.katago.reportDuringSearchEvery,
        ),
      } : {}),
      analyzeTurns,
      ...(needsOwnership ? { includeOwnership: true } : {}),
      ...(hasOverrides ? { overrideSettings } : {}),
      ...(analysis_config ? { analysis_config } : {}),
      ...(capabilities ? { capabilities } : {}),
      ...(selectedModel !== null ? { model: selectedModel } : {}),
    };

    store.engine.activeMode[boardId] = 'analyze';
    const unsubscribe = this.client.subscribe(query, (res) => {
      this.onAnalysisUpdate(res as KataAnalysisResponse, queryId);
    });

    this.activeSubscriptions.set(boardId, unsubscribe);
    this.activeQueryIds.set(boardId, queryId);
    this.restartCallbacks.set(
      boardId,
      () => this.analyzeRange(boardId, fullPath, startTurn, endTurn, visits, configOverride, overrideSettingsOverride, forReview, isRealtime),
    );
  }

  public analyzeActiveNode(
    boardId: BoardId,
    mode: 'ponder' | 'analyze',
    visits?: number,
    configOverride?: Record<string, unknown>,
    overrideSettingsOverride?: Record<string, unknown>,
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
    // See analyzeRange above for the configOverride-vs-live rationale.
    const hasConfigOverride = configOverride !== undefined;
    const analysis_config = configOverride ?? compileAnalysisConfig();
    const overrideSettings = hasConfigOverride
      ? overrideSettingsOverride
      : compileEngineOverrides();
    // See analyzeRange above for the SELECTOR-model hash rationale.
    const hash = hasConfigOverride
      ? hashConfig(compileAnalysisDescriptorFromParts(
          analysis_config, overrideSettings, store.engine.selectedModel ?? undefined,
        ))
      : activeConfigHash.value;
    // See analyzeRange above for the framing-resolution rationale.
    const framing = resolveWinrateFraming(overrideSettings);

    // Snapshot the ponder ceiling at query-start so a mid-query
    // registry edit doesn't change what we report when the warning
    // fires. Only attached for mode='ponder' — analyze mode never
    // surfaces the warning regardless of how many packets land.
    const ponderCeiling =
      mode === 'ponder'
        ? store.profile.settings.engine.katago.ponderMaxVisits
        : undefined;
    this.activeQueries.set(queryId, { path: fullPath, hash, framing, ponderCeiling });

    // Queue telemetry — single-turn entry. For ponder, the per-turn
    // visit budget is the ponderMaxVisits ceiling; for analyze, the
    // user-supplied / default visits target. Either way the tooltip
    // computes ETA from the per-model rolling visits/sec. `cancel`
    // defers to `stopBoardAnalysis` for the same reason analyzeRange
    // does — the proxy gets a `terminate` and the local maps clean
    // up identically to any other interruption.
    telemetry.registerQuery({
      queryId,
      kind:         mode,
      boardId,
      model:        store.engine.selectedModel,
      startTimeMs:  Date.now(),
      turnsTotal:   1,
      visitsPerTurn:
        mode === 'ponder'
          ? store.profile.settings.engine.katago.ponderMaxVisits
          : (visits ?? null),
      cancel:       () => this.stopBoardAnalysis(boardId),
    });

    const ownershipModes = store.session.ui.overlayLayers.ownership;
    const needsOwnership = ownershipModes.continuous || ownershipModes.dots || ownershipModes.liveness;
    const cacheFlags = {
      cache: store.profile.settings.engine.katago.cache,
      lookup_cache: store.profile.settings.engine.katago.lookup_cache,
      replay_final_only: store.profile.settings.engine.katago.replay_final_only,
    };
    // `overrideSettings` resolved above — see analyzeRange for the
    // wire conditional-spread rationale.
    const hasOverrides =
      overrideSettings !== undefined && Object.keys(overrideSettings).length > 0;
    // Per-query capability opt-in. analyzeActiveNode is turn-locked
    // by construction (single-turn `analyzeTurns: [currentIdx]`),
    // so `adaptive_reevaluate` is structurally inappropriate
    // regardless of forReview — the helper's `isRangeBased: false`
    // enforces this. forReview defaults to false here because no
    // current caller of analyzeActiveNode is a review-session
    // grading consumer (review session uses analyzeRange via
    // processUserMove); the parameter would be a no-op even if
    // added because adaptive can't engage on a turn-locked query
    // anyway. See analyzeRange above for the broader rationale and
    // the SELECTOR `model` injection contract.
    const capabilities = buildPerQueryCapabilities({
      advertised: store.engine.info.capabilities,
      isRangeBased: false,
      forReview: false,
      useTransposition: store.profile.settings.engine.katago.useTransposition,
      adaptiveReevaluate: store.profile.settings.engine.katago.adaptiveReevaluate,
    });
    const selectedModel = store.engine.selectedModel;
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
      // Report cadences are user-tunable registry leaves
      // (knob-registry Phase 6, 2026-05-15 promotion). Single
      // value applies to both ponder and analyze per the user's
      // simplification choice; the prior 0.15 (ponder) / 0.5
      // (analyze) tuning is replaced by `reportDuringSearchEvery`
      // alone with a registry default of 0.15. The wire-side
      // `Math.min` clamp enforces the invariant
      // `firstReportDuringSearchAfter ≤ reportDuringSearchEvery`
      // even if the stored leaves drift apart (see the
      // analyzeRange site for the matching pattern).
      reportDuringSearchEvery: store.profile.settings.engine.katago.reportDuringSearchEvery,
      firstReportDuringSearchAfter: Math.min(
        store.profile.settings.engine.katago.firstReportDuringSearchAfter,
        store.profile.settings.engine.katago.reportDuringSearchEvery,
      ),
      ...(mode === 'ponder' ? { maxVisits: store.profile.settings.engine.katago.ponderMaxVisits } : {}),
      analyzeTurns: [currentIdx],
      ...(needsOwnership ? { includeOwnership: true } : {}),
      ...(hasOverrides ? { overrideSettings } : {}),
      ...(analysis_config ? { analysis_config } : {}),
      ...(capabilities ? { capabilities } : {}),
      ...(selectedModel !== null ? { model: selectedModel } : {}),
    };

    store.engine.activeMode[boardId] = mode;
    const unsubscribe = this.client.subscribe(query, (res) => {
      this.onAnalysisUpdate(res as KataAnalysisResponse, queryId);
    });

    this.activeSubscriptions.set(boardId, unsubscribe);
    this.activeQueryIds.set(boardId, queryId);
    this.restartCallbacks.set(
      boardId,
      () => this.analyzeActiveNode(boardId, mode, visits, configOverride, overrideSettingsOverride),
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
    // Telemetry observation — records visit progress for ETA
    // computation, regardless of whether the queryId is still in
    // `activeQueries` (the telemetry singleton's own lookup is
    // independent, so a packet arriving after `stopBoardAnalysis`
    // has cleared the local entry still updates ETA cleanly until
    // the telemetry unregister fires).
    const rootVisits = response.rootInfo?.visits ?? 0;
    telemetry.recordPacket(queryId, response.turnNumber, rootVisits, response.isDuringSearch);

    const queryInfo = this.activeQueries.get(queryId);
    if (!queryInfo) return;

    const nodeId = queryInfo.path[response.turnNumber];
    if (nodeId) {
      // Normalise to canonical 'WHITE' framing before recording so
      // every consumer downstream — `waitForAnalysis`, the chart
      // composables, the ownership renderer, the bundle export —
      // sees consistent sign conventions regardless of what the user
      // asked KataGo for. Pure function over the typed signed
      // scalars; identity-returns the input when no flip is needed
      // (WHITE framing, or SIDETOMOVE with currentPlayer === 'W').
      const normalized = normalizePacketToWhiteFraming(response, queryInfo.framing);
      ledger.record(queryInfo.hash, nodeId, normalized);
      const board = store.boards.find(b => this.activeQueryIds.get(b.id) === queryId);
      if (board) {
        board.lastActivity = Date.now();
        store.engine.metrics = { ...store.engine.metrics, lastResponseId: board.id };
      }
    }

    // Ponder-ceiling-reached warning. A ponder-mode query is
    // structurally indefinite (single-turn analyzeTurns, no time
    // limit on the proxy side); the only realistic completion is
    // KataGo exhausting maxVisits. If a final packet
    // (isDuringSearch=false) arrives here for a ponder query, the
    // user's hardware is fast enough that ponder finished before
    // they stopped it — surface the ceiling and the registry path
    // so they can raise it. ponderCeiling is cleared on first
    // fire so the warning doesn't repeat (defensive: KataGo emits
    // one final per turn, but if a cache replay or proxy enrichment
    // ever produced two, the user only sees the message once per
    // query).
    if (
      queryInfo.ponderCeiling !== undefined
      && !response.isDuringSearch
    ) {
      pushSystemMessage(
        'warning',
        i18n.global.t('analysis.ponderExhausted', {
          visits: queryInfo.ponderCeiling.toLocaleString(),
        }),
      );
      this.activeQueries.set(queryId, { ...queryInfo, ponderCeiling: undefined });
    }
  }

  public stopBoardAnalysis(boardId: BoardId) {
    const prevId = this.activeQueryIds.get(boardId);
    const unsub = this.activeSubscriptions.get(boardId);
    if (unsub) unsub();
    if (prevId) {
      this.client.sendCommand({ id: `term-${Date.now()}`, action: 'terminate', terminateId: prevId });
      this.activeQueries.delete(prevId);
      // Release the telemetry entry too — the query is genuinely
      // terminated. (Natural completion has its own auto-cleanup
      // path inside the telemetry singleton; this branch handles
      // explicit interruption.)
      telemetry.unregisterQuery(prevId);
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
