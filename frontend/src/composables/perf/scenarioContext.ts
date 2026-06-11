/**
 * src/composables/perf/scenarioContext.ts
 *
 * `createScenarioContext` — the concrete `ScenarioContext` a scenario's
 * `run` body drives, plus `runScenario`, the runner that brackets the
 * run with `scenario:<name>:start/end` marks and guarantees every
 * spawned stimulus is torn down (even on throw).
 *
 * The context is a thin façade: each action delegates to an existing
 * single function (store `createBoard`, `analysisService.analyzeRange`,
 * `useNavigation`, the shared `loadSgfIntoBoard` / `waitForCondition`
 * primitives). It holds no domain logic of its own — only the
 * mark-namespacing, the `QueryHandle` wrapping, and the spawned-stimulus
 * registry for cleanup.
 *
 * Domain band (ADR-0003): game-tree-coupled (B2). Dev-only; makes no
 * perf *claim* (ADR-0009).
 *
 * License: Public Domain (The Unlicense)
 */
import { store, activeBoard, createBoard as storeCreateBoard, closeBoard, resetWorkspace as storeResetWorkspace, setSelectedModel } from '../../store';
import { mutateProfile } from '../../store/profile-owner';
import { useNavigation } from '../useNavigation';
import { useQueryTelemetry } from '../useQueryTelemetry';
import { waitForCondition } from '../reactive-settle';
import { loadSgfIntoBoard } from '../sgf/loadIntoBoard';
import { getActiveVariationPath } from '../../engine/util';
import { analysisService } from '../../services/analysis-service';
import { libraryService } from '../../services/library-service';
import { runAutonav } from './autonav';
import type { BoardId, GameSourceId, QueryId } from '../../types';
import type { PerfScenario, QueryHandle, RangeOpts, ScenarioContext, ScenarioStimulus } from './types';

/**
 * Build a scenario context bound to a scenario name (used for the
 * `scenario:<name>:*` mark namespace). Returns the public context plus a
 * private `teardown` the runner calls to stop spawned stimuli.
 */
function createScenarioContext(name: string): {
  ctx: ScenarioContext;
  teardown: () => void;
} {
  const nav = useNavigation();
  const telemetry = useQueryTelemetry();
  const spawned: ScenarioStimulus[] = [];
  // Boards the scenario created — closed in teardown so a capture is
  // additive-neutral on the persisted workspace (the SPA authenticates as
  // the shared `local_user` and auto-saves the board list; leaving the
  // scenario's board behind would accumulate one throwaway board per run).
  const createdBoards: BoardId[] = [];
  // Same capture-neutrality intent for the engine settings a scenario changes:
  // the proxy URL is passed transiently to analysisService.connect() and never
  // written to the profile; the adaptive toggle IS read per-query from the
  // store, so it must live there during the run — snapshot it here (once) and
  // restore it in teardown so a capture doesn't clobber the user's setting.
  let savedAdaptiveEnabled: boolean | undefined;

  function mark(markName: string, detail?: unknown): void {
    performance.mark(
      `scenario:${name}:${markName}`,
      detail !== undefined ? { detail } : undefined,
    );
  }

  function requireActiveBoardId(where: string): BoardId {
    const b = activeBoard.value;
    if (!b) throw new Error(`scenarioContext.${where}: no active board after create`);
    return b.id;
  }

  function makeHandle(queryId: QueryId): QueryHandle {
    // Sound because `analysisService.analyzeRange` registers the query in
    // telemetry synchronously before returning the id, so the predicate is
    // false at handle-creation and the settle-bridge waits for the query to
    // leave the in-flight set (auto-cleared on the final terminal packet).
    const settled = waitForCondition(
      () => !telemetry.inFlight.value.some((q) => q.queryId === queryId),
    );
    return {
      queryId,
      settled,
      stop: () => analysisService.stopQuery(queryId),
    };
  }

  const ctx: ScenarioContext = {
    createBoard(): BoardId {
      storeCreateBoard();
      const id = requireActiveBoardId('createBoard');
      createdBoards.push(id);
      return id;
    },

    loadSgf(rawContent, stamp): BoardId {
      storeCreateBoard();
      const id = requireActiveBoardId('loadSgf');
      createdBoards.push(id);
      loadSgfIntoBoard(id, rawContent, stamp);
      return id;
    },

    resetWorkspace(): void {
      storeResetWorkspace();
      // The created-board tracking is moot now — resetWorkspace cleared every
      // board; drop the ids so teardown doesn't no-op-close stale ones.
      createdBoards.length = 0;
    },

    async loadLibraryGameById(gameId: GameSourceId): Promise<BoardId> {
      const game = await libraryService.getGame(gameId);
      if (!game) {
        throw new Error(`scenarioContext.loadLibraryGameById: library game ${gameId} not found`);
      }
      return ctx.loadSgf(game.rawContent, (board) => {
        if (game.clientGameId !== null) board.clientGameId = game.clientGameId;
      });
    },

    async connectEngine(opts = {}): Promise<void> {
      const adaptive = opts.adaptive;
      if (adaptive !== undefined) {
        // adaptiveReevaluate is a config object { enabled, worstQuantile, … };
        // `.enabled` is the gate buildPerQueryCapabilities reads per-query, so
        // it must live in the store during the run. Snapshot the original once
        // and restore in teardown (capture-neutrality, like createdBoards).
        // Owner-routed write (settings-profile-mutator-owner); was a
        // DEV-harness annotated exemption.
        savedAdaptiveEnabled ??= store.profile.settings.engine.katago.adaptiveReevaluate.enabled;
        mutateProfile((p) => { p.settings.engine.katago.adaptiveReevaluate.enabled = adaptive; });
      }
      if (store.engine.status !== 'connected') {
        // Transient URL: passed to connect() directly, NOT written to the
        // persisted profile setting — so a capture never clobbers the user's
        // proxy host (e.g. 192.168.122.68:1235) with the harness default
        // (127.0.0.1:1235). connect() with no arg keeps the user's setting;
        // if the engine is already connected we use that connection as-is.
        analysisService.connect(opts.url);
        await waitForCondition(() => store.engine.status === 'connected');
      }
      if (opts.model) {
        const needle = opts.model.toLowerCase();
        // probeEngineInfo (on connect) populates availableModels asynchronously.
        await waitForCondition(() => store.engine.info.availableModels.length > 0);
        const labels = store.engine.info.availableModels.map((m) => m.label);
        const matches = labels.filter((l) => l.toLowerCase().includes(needle));
        if (matches.length !== 1) {
          throw new Error(
            `scenarioContext.connectEngine: model "${opts.model}" matched ${matches.length} of [${labels.join(', ')}]; need exactly one`,
          );
        }
        setSelectedModel(matches[0]);
      }
    },

    clearCache(): Promise<void> {
      return analysisService.clearCache();
    },

    analyzeRange(boardId: BoardId, opts: RangeOpts): QueryHandle {
      const board = store.boards.find((b) => b.id === boardId);
      if (!board) throw new Error(`scenarioContext.analyzeRange: board ${boardId} not found`);
      // Root→leaf is the genuine shape: perf scenarios span the whole
      // line by default (`full: true`), with explicit turn bounds
      // otherwise. Branded by the producer; the former redundant
      // `as NodeId[]` widening is retired.
      const fullPath = getActiveVariationPath(board);
      const full = opts.full ?? true;
      const startTurn = full ? 0 : (opts.startTurn ?? 0);
      const endTurn = full ? fullPath.length - 1 : (opts.endTurn ?? fullPath.length - 1);
      const queryId = analysisService.analyzeRange(boardId, fullPath, startTurn, endTurn, opts.visits);
      if (queryId === null) {
        throw new Error(`scenarioContext.analyzeRange: engine not connected or board missing (${boardId})`);
      }
      return makeHandle(queryId);
    },

    analyzeFullGame(boardId: BoardId, visits: number): QueryHandle {
      const queryId = analysisService.analyzeFullGame(boardId, visits);
      if (queryId === null) {
        throw new Error(`scenarioContext.analyzeFullGame: engine not connected or board missing (${boardId})`);
      }
      return makeHandle(queryId);
    },

    autonav(opts): Promise<void> {
      return runAutonav({ markPrefix: opts?.markPrefix, subTab: opts?.subTab }).done;
    },

    nav,

    spawn(stimulus: ScenarioStimulus): void {
      spawned.push(stimulus);
      stimulus.start(ctx);
    },

    waitFor: waitForCondition,

    async measure(label, fn): Promise<void> {
      const startMark = `scenario:${name}:${label}:start`;
      const endMark = `scenario:${name}:${label}:end`;
      performance.mark(startMark);
      try {
        await fn();
      } finally {
        performance.mark(endMark);
        performance.measure(`scenario:${name}:${label}`, startMark, endMark);
      }
    },

    mark,

    store,
  };

  // Teardown stops stimuli in reverse spawn order (mirror of acquisition),
  // so a stimulus that depends on an earlier one is released first, then
  // closes the boards the scenario created (additive-neutral cleanup —
  // closeBoard also releases the board's own resources, per the
  // resource-ownership-at-mutation-sites discipline). Tolerant of a board
  // already gone (e.g. a mid-run workspace reset).
  function teardown(): void {
    for (let i = spawned.length - 1; i >= 0; i--) {
      try {
        spawned[i].stop();
      } catch (err) {
        console.error(`[perf] stimulus "${spawned[i].id}" stop() threw:`, err);
      }
    }
    spawned.length = 0;
    for (let i = createdBoards.length - 1; i >= 0; i--) {
      try {
        closeBoard(createdBoards[i]);
      } catch (err) {
        console.error(`[perf] closeBoard(${createdBoards[i]}) threw:`, err);
      }
    }
    createdBoards.length = 0;
    // Restore the adaptive toggle the scenario changed (URL was never written
    // to the profile — it goes transiently through connect()). Keeps the
    // capture neutral on the user's persisted engine settings.
    if (savedAdaptiveEnabled !== undefined) {
      // Owner-routed restore half of the snapshot pair above
      // (settings-profile-mutator-owner).
      const restored = savedAdaptiveEnabled;
      mutateProfile((p) => { p.settings.engine.katago.adaptiveReevaluate.enabled = restored; });
      savedAdaptiveEnabled = undefined;
    }
  }

  return { ctx, teardown };
}

/**
 * Run a scenario end to end. Brackets the run with `scenario:<name>:start`
 * / `scenario:<name>:end` marks and guarantees spawned-stimulus teardown
 * even if `run` throws.
 */
export async function runScenario(scenario: PerfScenario): Promise<void> {
  const { ctx, teardown } = createScenarioContext(scenario.name);
  performance.mark(`scenario:${scenario.name}:start`);
  try {
    await scenario.run(ctx);
  } finally {
    teardown();
    performance.mark(`scenario:${scenario.name}:end`);
  }
}
