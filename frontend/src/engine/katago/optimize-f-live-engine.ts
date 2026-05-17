/**
 * src/engine/katago/optimize-f-live-engine.ts
 *
 * `OptimizerEngine` implementation backed by a real WebSocket connection
 * to a KataProxy / KataGo analysis engine. Owns its own `KataGoClient`
 * instance for the lifetime of an optimization run so the engine's cache
 * is exclusive to the optimizer (every trial begins with a `clear_cache`)
 * and so cross-talk with the main analysis pipeline is structurally
 * impossible during the run.
 *
 * Per-trial choreography:
 *   1. send `clear_cache` action and settle briefly (proxy fan-out).
 *   2. `t0 = performance.now()`; send the canonical analyze query with
 *      the requested cadence and (if not control) F.
 *   3. wait for the first response packet with the matching `id`;
 *      `dt = performance.now() - t0`.
 *   4. unsubscribe; send `terminate` for this query's id.
 *   5. settle briefly to let the engine drain.
 *
 * The canonical analyze query uses a fixed mid-game position (the same
 * 39-move position as the Python reference reproducer at
 * `~/katago_bugreport/reproducer.py`). Cliff position is essentially
 * position-independent — the original report tested empty-board too —
 * so a fixed canonical position keeps results comparable across users
 * and sessions without burdening the caller.
 *
 * License: Public Domain (The Unlicense)
 */

import type { OptimizerEngine } from './optimize-f';
import { KataGoClient } from './katago-client';
import type {
  KataGoAnalysisQuery,
  KataGoActionQuery,
  KataGoResponse,
  Player,
  KataCoord,
} from './types';

export interface LiveEngineOptions {
  readonly maxVisits?: number;
  readonly cacheClearSettleMs?: number;
  readonly postTrialDrainMs?: number;
  /** Per-trial timeout in milliseconds. Defaults to `max(cadence*2000 + 500, 2000)`. */
  readonly trialTimeoutMs?: (cadenceS: number) => number;
}

const DEFAULTS = {
  maxVisits: 2_000_000,
  cacheClearSettleMs: 150,
  postTrialDrainMs: 100,
} as const;

/** 39-move mid-game position; canonical across the Python reference and this port. */
const CANONICAL_MOVES: readonly [Player, KataCoord][] = [
  ['B', 'D4'],  ['W', 'Q16'], ['B', 'D17'], ['W', 'Q4'],  ['B', 'F4'],  ['W', 'D15'],
  ['B', 'C15'], ['W', 'C14'], ['B', 'C16'], ['W', 'D14'], ['B', 'F17'], ['W', 'C10'],
  ['B', 'R10'], ['W', 'B4'],  ['B', 'D11'], ['W', 'C11'], ['B', 'C4'],  ['W', 'B5'],
  ['B', 'B3'],  ['W', 'C7'],  ['B', 'O3'],  ['W', 'R6'],  ['B', 'R13'], ['W', 'R15'],
  ['B', 'D7'],  ['W', 'C6'],  ['B', 'C8'],  ['W', 'D8'],  ['B', 'D9'],  ['W', 'E8'],
  ['B', 'C9'],  ['W', 'E7'],  ['B', 'D10'], ['W', 'B2'],  ['B', 'C3'],  ['W', 'E5'],
  ['B', 'F3'],  ['W', 'F15'], ['B', 'C12'],
];
const CANONICAL_ANALYZE_TURNS: readonly number[] = [39];

const OVERRIDE_SETTINGS = {
  reportAnalysisWinratesAs: 'WHITE',
  rootNumSymmetriesToSample: 8,
  wideRootNoise: 0.02,
};

function defaultTimeoutMs(cadenceS: number): number {
  return Math.max(cadenceS * 2000 + 500, 2000);
}

/**
 * Connect a fresh `LiveOptimizerEngine` to `wsUrl`. The returned engine
 * holds the connection for its lifetime; call `dispose()` when the
 * optimization run is over. Throws if the connection cannot be
 * established within the given timeout.
 */
export class LiveOptimizerEngine implements OptimizerEngine {
  private readonly wsUrl: string;
  private client: KataGoClient;
  private ready: Promise<void>;
  private disposed = false;
  private readonly opts: Required<Omit<LiveEngineOptions, 'trialTimeoutMs'>> & {
    trialTimeoutMs: (cadenceS: number) => number;
  };

  constructor(wsUrl: string, options: LiveEngineOptions = {}) {
    this.wsUrl = wsUrl;
    this.opts = {
      maxVisits: options.maxVisits ?? DEFAULTS.maxVisits,
      cacheClearSettleMs:
        options.cacheClearSettleMs ?? DEFAULTS.cacheClearSettleMs,
      postTrialDrainMs:
        options.postTrialDrainMs ?? DEFAULTS.postTrialDrainMs,
      trialTimeoutMs: options.trialTimeoutMs ?? defaultTimeoutMs,
    };
    this.client = new KataGoClient(wsUrl);
    this.ready = this.connect();
  }

  private connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const handle = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          new Error(
            `LiveOptimizerEngine: connection to ${this.wsUrl} timed out after 5s`,
          ),
        );
      }, 5000);
      this.client.connect(this.wsUrl, {
        onConnect: () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(handle);
          resolve();
        },
        onDisconnect: (code, reason) => {
          // If we disconnect mid-run, in-flight measure() calls will
          // resolve via their timeouts.
          if (!settled) {
            settled = true;
            window.clearTimeout(handle);
            reject(
              new Error(
                `LiveOptimizerEngine: disconnected before ready ` +
                  `(code=${code} reason=${reason})`,
              ),
            );
          }
        },
        onError: (msg) => {
          if (!settled) {
            settled = true;
            window.clearTimeout(handle);
            reject(new Error(`LiveOptimizerEngine: connection error: ${msg}`));
          }
        },
      });
    });
  }

  async measure(
    model: string,
    cadenceS: number,
    firstReportS: number | null,
  ): Promise<number> {
    if (this.disposed) {
      throw new Error('LiveOptimizerEngine.measure called after dispose()');
    }
    await this.ready;

    // 1. clear_cache + settle.
    const ccId = `optf-cc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ccAction: KataGoActionQuery = { id: ccId, action: 'clear_cache' };
    // Fire-and-forget; sendCommand returns a promise that resolves on
    // any response matching the id, which the proxy may or may not
    // send. We don't care to read it — the settle delay covers
    // fan-out propagation either way.
    this.client.sendCommand(ccAction).catch(() => {});
    await sleep(this.opts.cacheClearSettleMs);

    // 2. build analyze query.
    const qid =
      `optf-${model}-${cadenceS}-${firstReportS ?? 'none'}-` +
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const query: KataGoAnalysisQuery = {
      id: qid,
      moves: CANONICAL_MOVES,
      analyzeTurns: CANONICAL_ANALYZE_TURNS,
      rules: 'tromp-taylor',
      boardXSize: 19,
      boardYSize: 19,
      komi: 7.5,
      reportDuringSearchEvery: cadenceS,
      maxVisits: this.opts.maxVisits,
      includeOwnership: true,
      overrideSettings: OVERRIDE_SETTINGS,
      model,
      ...(firstReportS !== null && firstReportS > 0
        ? { firstReportDuringSearchAfter: firstReportS }
        : {}),
    };

    // 3. subscribe + send + wait for first matching response.
    const timeoutMs = this.opts.trialTimeoutMs(cadenceS);
    const dt = await this.sendAndAwaitFirst(query, timeoutMs);

    // 4. terminate (fire-and-forget) + drain settle.
    const termId = `optf-term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const termAction: KataGoActionQuery = {
      id: termId,
      action: 'terminate',
      terminateId: qid,
    };
    this.client.sendCommand(termAction).catch(() => {});
    await sleep(this.opts.postTrialDrainMs);

    return dt;
  }

  /**
   * Send a query and resolve with the wall-clock ms to the first
   * response packet with matching id. On timeout, resolves to the
   * timeout value itself (so the algorithm classifies it as tardy
   * rather than throwing — strip-flips are recoverable; per-trial
   * timeouts are too).
   */
  private sendAndAwaitFirst(
    query: KataGoAnalysisQuery,
    timeoutMs: number,
  ): Promise<number> {
    return new Promise<number>((resolve) => {
      let resolved = false;
      const t0 = performance.now();
      let unsubscribe: (() => void) | null = null;
      const handle = window.setTimeout(() => {
        if (resolved) return;
        resolved = true;
        unsubscribe?.();
        resolve(timeoutMs);
      }, timeoutMs);

      unsubscribe = this.client.subscribe(query, (response: KataGoResponse) => {
        if (resolved) return;
        if (response.id !== query.id) return; // defensive; KataGoClient already filters
        resolved = true;
        window.clearTimeout(handle);
        const dt = performance.now() - t0;
        unsubscribe?.();
        resolve(dt);
      });
      // KataGoClient.subscribe sends the query as a side effect, so t0
      // is recorded immediately before the subscribe call. The small
      // gap between `t0` and the actual socket send is on the order of
      // microseconds (JSON.stringify + WebSocket.send) and is the same
      // as the Python reference's measurement convention.
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.client.disconnect();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
