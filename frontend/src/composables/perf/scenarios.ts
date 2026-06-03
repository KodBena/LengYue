/**
 * src/composables/perf/scenarios.ts
 *
 * The scenario registry and the built-in scenarios, plus the dev-only
 * `window.__perfScenario` install the Playwright capture driver (and a
 * dev-toolbar picker) call into.
 *
 * Scenarios are registered as factories `(cfg) => PerfScenario` so a
 * caller can tune the fixture / visit budget / popover target per run.
 * The three built-ins span the regimes the perf arc distinguishes:
 *
 *   - `nav-only`        — autonav to leaf, no analysis (regime-A baseline).
 *   - `nav-range`       — autonav while a full-game range analysis streams
 *                         (regime-B: the interleaving case).
 *   - `full-stress`     — `nav-range` plus concurrent popover churn.
 *
 * Domain band (ADR-0003): game-tree-coupled (B2). Dev-only; makes no
 * perf *claim* (ADR-0009).
 *
 * License: Public Domain (The Unlicense)
 */
import { analysisService } from '../../services/analysis-service';
import { runScenario } from './scenarioContext';
import { popoverStress, DEFAULT_POPOVER_TARGET } from './stimuli';
import { DEFAULT_FIXTURE_SGF } from './fixtures';
import type { BoardId } from '../../types';
import type { PerfScenario, ScenarioContext } from './types';

/** Per-run configuration shared by the built-in scenario factories. */
export interface ScenarioConfig {
  /** SGF main line to load. Default: the generated 100-move fixture. */
  readonly sgf?: string;
  /** Per-turn visit budget for the range analysis. Default 1000 (protocol). */
  readonly visits?: number;
  /** Popover devId for the stress stimulus. Default `'queue'`. */
  readonly popoverTarget?: string;
  /** Proxy WS URL to connect for analysis scenarios. Default the SELECTOR. */
  readonly proxyUrl?: string;
  /** SELECTOR model substring to select (matched against advertised labels). */
  readonly model?: string;
  /** Engage adaptive_reevaluate. Default false (the green-arc protocol). */
  readonly adaptive?: boolean;
}

// magic-literal: default per-turn visit budget. 1000 visits/move is the
// protocol used (implicitly) during the green-arc captures.
const DEFAULT_VISITS = 1000;

// magic-literal: default proxy WS URL — the SELECTOR role on :1235 (the
// dev-resources convention; see reference_dev_resources / umbrella CLAUDE.md).
// The env default (config/env.ts KATAGO_WS_URL → :41948) is the wrong target
// for a fresh capture context, so analysis scenarios pin the SELECTOR here.
// 127.0.0.1 is correct on-VM (the harness runs here); connectEngine applies it
// TRANSIENTLY via analysisService.connect() and never persists it, so a
// capture does not clobber the maintainer's profile proxy host (which is
// ws://192.168.122.68:1235 — the LAN IP their browser reaches).
const DEFAULT_PROXY_URL = 'ws://127.0.0.1:1235';

type ScenarioFactory = (cfg: ScenarioConfig) => PerfScenario;

/** Load the fixture and walk the cursor home — shared scenario preamble. */
function loadAndHome(ctx: ScenarioContext, cfg: ScenarioConfig): BoardId {
  const boardId = ctx.loadSgf(cfg.sgf ?? DEFAULT_FIXTURE_SGF);
  ctx.nav.home();
  return boardId;
}

/**
 * Analysis-scenario preamble: load the fixture, connect the engine (select
 * model, set adaptive per protocol), and clear the cache for a cold-cache
 * run (cache warmth confounds packet volume across runs — see the
 * perf-capture normalization protocol). Returns the board id.
 */
async function prepareAnalysis(ctx: ScenarioContext, cfg: ScenarioConfig): Promise<BoardId> {
  // Engine setup (the awaits) FIRST, board creation LAST — so no event-loop
  // yield sits between creating the board and the scenario's analyzeRange.
  // An async workspace mutation (sync-hydrate's resetWorkspace) could
  // otherwise clobber store.boards during an intervening await, leaving
  // analyzeRange unable to find the freshly-created board. The capture
  // driver additionally waits for bootstrap to settle before invoking the
  // scenario, so this is defence-in-depth.
  await ctx.connectEngine({
    url: cfg.proxyUrl ?? DEFAULT_PROXY_URL,
    model: cfg.model,
    adaptive: cfg.adaptive ?? false,
  });
  await ctx.clearCache();
  return loadAndHome(ctx, cfg);
}

const REGISTRY: ReadonlyMap<string, ScenarioFactory> = new Map<string, ScenarioFactory>([
  [
    'nav-only',
    (_cfg) => ({
      name: 'nav-only',
      async run(ctx) {
        loadAndHome(ctx, _cfg);
        await ctx.measure('drive', () => ctx.autonav());
      },
    }),
  ],
  [
    'nav-range',
    (cfg) => ({
      name: 'nav-range',
      async run(ctx) {
        const boardId = await prepareAnalysis(ctx, cfg);
        const q = ctx.analyzeRange(boardId, { full: true, visits: cfg.visits ?? DEFAULT_VISITS });
        await ctx.measure('drive', () => ctx.autonav());
        q.stop();
      },
    }),
  ],
  [
    // Workspace-reset churn — the leak-churn target for `resetWorkspace`
    // (the other named resource-ownership cleanup alongside closeBoard).
    // Each cycle builds workspace state then resets it; perf-heap repeats
    // and checks retained heap doesn't grow per reset. If `model` is given,
    // an in-flight analysis is left running into the reset so the bulk
    // stopAllBoardAnalyses / forgetAll path is exercised under load. Run
    // under perf-heap (default no-persist) — resetWorkspace clears boards.
    'workspace-reset',
    (cfg) => ({
      name: 'workspace-reset',
      async run(ctx) {
        const board = ctx.loadSgf(cfg.sgf ?? DEFAULT_FIXTURE_SGF);
        ctx.nav.home();
        if (cfg.model) {
          await ctx.connectEngine({
            url: cfg.proxyUrl ?? DEFAULT_PROXY_URL,
            model: cfg.model,
            adaptive: cfg.adaptive ?? false,
          });
          // Fire-and-forget — left in flight so the reset tears it down.
          ctx.analyzeRange(board, { full: true, visits: cfg.visits ?? DEFAULT_VISITS });
        }
        ctx.resetWorkspace();
      },
    }),
  ],
  [
    'full-stress',
    (cfg) => ({
      name: 'full-stress',
      async run(ctx) {
        const boardId = await prepareAnalysis(ctx, cfg);
        const q = ctx.analyzeRange(boardId, { full: true, visits: cfg.visits ?? DEFAULT_VISITS });
        ctx.spawn(popoverStress(cfg.popoverTarget ?? DEFAULT_POPOVER_TARGET));
        await ctx.measure('drive', () => ctx.autonav());
        q.stop();
      },
    }),
  ],
]);

/** Names of the registered scenarios, for pickers and diagnostics. */
export function listScenarios(): string[] {
  return [...REGISTRY.keys()];
}

/**
 * Build and run a registered scenario by name. Throws (fail-loud) on an
 * unknown name, listing the known set.
 */
export async function runScenarioByName(name: string, cfg: ScenarioConfig = {}): Promise<void> {
  const factory = REGISTRY.get(name);
  if (!factory) {
    throw new Error(`Unknown perf scenario "${name}". Known: ${listScenarios().join(', ')}`);
  }
  await runScenario(factory(cfg));
}

/** Shape exposed on `window.__perfScenario` for the capture driver. */
export interface PerfScenarioGlobal {
  run(name: string, cfg?: ScenarioConfig): Promise<void>;
  list(): string[];
  /**
   * Disconnect the engine — implicitly terminates every in-flight query on
   * the WS. The capture driver calls this after recording so a heavy range
   * analysis (e.g. 1000 visits × 100 turns) is not left churning on the
   * proxy when the throwaway capture context tears down.
   */
  disconnect(): void;
}

declare global {
  interface Window {
    __perfScenario?: PerfScenarioGlobal;
  }
}

/**
 * Install `window.__perfScenario` in dev builds so the Playwright capture
 * driver (and a dev-toolbar picker) can launch scenarios by name. No-op in
 * production — the harness must never ship to users.
 */
export function installPerfScenarios(): void {
  if (!import.meta.env.DEV) return;
  window.__perfScenario = {
    run: (name, cfg) => runScenarioByName(name, cfg),
    list: () => listScenarios(),
    disconnect: () => analysisService.disconnect(),
  };
}
