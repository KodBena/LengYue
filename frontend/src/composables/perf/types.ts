/**
 * src/composables/perf/types.ts
 *
 * Contracts for the pluggable performance-scenario harness. A
 * `PerfScenario` is a single `run(ctx)` body; the author composes
 * concurrency freely by choosing what to `await` and what to fire-and-
 * forget. The canonical case the perf arc cares about — UI navigation
 * interleaved with a streaming range analysis (regime-B) — is expressed
 * by firing `ctx.analyzeRange(...)` (NOT awaited; it streams) and
 * awaiting `ctx.autonav()` (the yielding measured pass), so the single-
 * threaded event loop interleaves packet processing with nav renders.
 *
 * The context is a façade over functions that already exist (store
 * `createBoard`, `analysisService.analyzeRange`, `useNavigation`) plus
 * the two extracted shared primitives (`waitForCondition`,
 * `loadSgfIntoBoard`) — NOT a new logic layer. Those primitives are the
 * SSOT shared with the autonomous-SRS driver; the orchestration differs
 * per consumer (review-session state machine there, render-stress here).
 *
 * Domain band (ADR-0003): game-tree-coupled (B2) — speaks `BoardId`,
 * `BoardState`, turns. Dev-only; makes no perf *claim* (ADR-0009).
 *
 * License: Public Domain (The Unlicense)
 */
import type { BoardId, BoardState, GameSourceId } from '../../types';
import type { useNavigation } from '../useNavigation';
import type { store } from '../../store';

/** Range-analysis parameters for `ScenarioContext.analyzeRange`. */
export interface RangeOpts {
  /** Per-turn visit budget. */
  readonly visits: number;
  /**
   * Analyze the full active line (turns 0 .. leaf). Default true. Set
   * false to bound the range with `startTurn` / `endTurn`.
   */
  readonly full?: boolean;
  /** Range start turn index when `full === false`. Default 0. */
  readonly startTurn?: number;
  /** Range end turn index (inclusive) when `full === false`. Default leaf. */
  readonly endTurn?: number;
}

/**
 * Handle for an in-flight analysis fired by the context. Fire-and-forget
 * for concurrency (keep it streaming through the drive, then `stop()`),
 * or `await handle.settled` when a scenario measures completion instead.
 */
export interface QueryHandle {
  readonly queryId: string;
  /** Resolves when the query finishes streaming (leaves the telemetry
   *  in-flight set). Never rejects. */
  readonly settled: Promise<void>;
  /** Cancel the query (`analysisService.stopQuery`). Idempotent. */
  stop(): void;
}

/**
 * A self-contained background activity with its own loop and cleanup —
 * run concurrently with the measured pass via `ctx.spawn`. The runner
 * guarantees `stop()` is called at scenario end, so each `start` that
 * registers a timer / listener / forced-state must release it in `stop`
 * (the ADR-0010 §4 resource-ownership discipline the existing harnesses
 * already follow via `onUnmounted`).
 */
export interface ScenarioStimulus {
  readonly id: string;
  start(ctx: ScenarioContext): void;
  stop(): void;
}

/**
 * The imperative app-action façade a scenario drives. Structural actions
 * + analysis + navigation + concurrency/lifecycle helpers.
 */
export interface ScenarioContext {
  // ── structural actions ──
  /** Create a fresh empty board; returns its id (now the active board). */
  createBoard(): BoardId;
  /** Create a board and load `rawContent` into it; returns its id. */
  loadSgf(rawContent: string, stamp?: (board: BoardState) => void): BoardId;
  /** Fetch a library game and load it into a fresh board; returns its id. */
  loadLibraryGameById(gameId: GameSourceId): Promise<BoardId>;

  // ── engine prep (session config the protocol pins) ──
  /**
   * Connect the engine to a proxy, optionally select a SELECTOR model
   * (matched as a substring against the advertised labels — fail-loud
   * unless exactly one matches), and set adaptive mode. Resolves once
   * connected and (if a model was requested) the labels are enumerated.
   */
  connectEngine(opts?: { url?: string; model?: string; adaptive?: boolean }): Promise<void>;
  /** Clear the upstream KataGo NN/search cache (cold-cache reproducibility). */
  clearCache(): Promise<void>;

  // ── analysis (returns a handle — fire-and-forget for concurrency) ──
  analyzeRange(boardId: BoardId, opts: RangeOpts): QueryHandle;
  analyzeFullGame(boardId: BoardId, visits: number): QueryHandle;

  // ── navigation ──
  /**
   * The yielding measured pass: drives navigation to the active line's
   * leaf at ~60 Hz, one step per frame, so streaming analysis packets
   * interleave between frames. Resolves at the leaf.
   */
  autonav(opts?: { markPrefix?: string }): Promise<void>;
  /**
   * Manual, synchronous navigation. Footgun for the measured pass: a
   * tight loop over `nav.next()` does NOT yield, so no packets process
   * mid-loop and regime-B never reproduces. Use `autonav()` to measure.
   */
  readonly nav: ReturnType<typeof useNavigation>;

  // ── concurrency + lifecycle ──
  /** Start a background activity now; auto-stopped at scenario end. */
  spawn(stimulus: ScenarioStimulus): void;
  /** Resolve once a reactive predicate holds (the shared settle-bridge). */
  waitFor(predicate: () => boolean): Promise<void>;
  /** Bracket `fn` with `scenario:<name>:<label>:start/end` marks + measure. */
  measure(label: string, fn: () => Promise<void>): Promise<void>;
  /** Emit `scenario:<name>:<markName>` with optional detail. */
  mark(markName: string, detail?: unknown): void;

  readonly store: typeof store;
}

/** A pluggable performance scenario: one composable `run` body. */
export interface PerfScenario {
  readonly name: string;
  run(ctx: ScenarioContext): Promise<void>;
}
