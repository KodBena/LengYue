/**
 * src/composables/analysis/wait-for-analysis.ts
 *
 * Primitive: wait for a specific KataGo analysis packet to materialize
 * in the ledger, with timeout and abort support.
 *
 * Resolution channels (exactly one wins per call):
 *   1. Watcher: a final (isDuringSearch === false) packet matching
 *      (nodeId, turnNumber) arrives in the ledger → resolves with it.
 *   2. Timeout: timeoutMs elapses → rejects AnalysisWaitError('timeout').
 *   3. Abort: external AbortSignal fires → rejects AnalysisWaitError('aborted').
 *
 * All three paths funnel through a single settle() helper that clears
 * the timer, the watcher, and the abort listener symmetrically — no
 * leaks regardless of which channel wins the race.
 *
 * Callers can narrow the thrown error:
 *
 *     try {
 *       const packet = await waitForAnalysis(rawKey, nodeId, turn, opts);
 *     } catch (err) {
 *       if (err instanceof AnalysisWaitError) {
 *         if (err.reason === 'timeout') { ... }
 *         if (err.reason === 'aborted') { ... }
 *       } else {
 *         throw err; // unexpected — propagate
 *       }
 *     }
 */

import { watch } from 'vue';
import type { RawAnalysis } from '../../engine/katago/types';
import type { NodeId, RawKey } from '../../types';
import { ledger } from '../../state/analysis-ledger';

export type AnalysisWaitReason = 'timeout' | 'aborted';

/**
 * Typed error for the two expected failure modes of `waitForAnalysis`.
 *
 * Note: `reason` is declared as an explicit instance field (not a
 * parameter-property shorthand) because the project's tsconfig has
 * `erasableSyntaxOnly` enabled, which forbids parameter properties —
 * they emit runtime code and therefore aren't pure type-level syntax.
 * Same end result; more verbose source.
 */
export class AnalysisWaitError extends Error {
  readonly reason: AnalysisWaitReason;

  constructor(reason: AnalysisWaitReason) {
    super(`Analysis wait ${reason}`);
    this.name = 'AnalysisWaitError';
    this.reason = reason;
  }
}

export interface WaitForAnalysisOptions {
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

/**
 * Match predicate with refinement: returns the packet if it is a final
 * (non-during-search) packet for the target turnNumber; null otherwise.
 * Used by both the initial synchronous check and the reactive watcher,
 * so the matching criterion lives in one place.
 */
function matchesTarget(
  packet: RawAnalysis | null | undefined,
  turnNumber: number
): RawAnalysis | null {
  return (packet && packet.isDuringSearch === false && packet.turnNumber === turnNumber)
    ? packet
    : null;
}

export function waitForAnalysis(
  rawKey: RawKey,
  nodeId: NodeId,
  turnNumber: number,
  options: WaitForAnalysisOptions
): Promise<RawAnalysis> {
  return new Promise((resolve, reject) => {
    // Defensive early-exit: if already aborted, fail fast without
    // setting up any machinery.
    if (options.signal?.aborted) {
      reject(new AnalysisWaitError('aborted'));
      return;
    }

    // Synchronous initial check. Two reasons:
    //   1. If the packet is already in the ledger, we resolve without
    //      setting up a watcher or a timer at all.
    //   2. Using watch(..., { immediate: true }) would trigger the
    //      callback synchronously before `unwatch` and `timerId` are
    //      initialized — a temporal-dead-zone hazard. Manual initial
    //      check lets us use watch() with the default (lazy) behavior.
    const initial = matchesTarget(ledger.getRaw(rawKey, nodeId), turnNumber);
    if (initial) {
      resolve(initial);
      return;
    }

    let settled = false;

    // Single teardown point. All three exit paths call settle() which
    // then invokes the appropriate resolve/reject. Idempotent by
    // construction: the `settled` flag makes re-entry a no-op.
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timerId);
      unwatch();
      options.signal?.removeEventListener('abort', onAbort);
      fn();
    };

    const onAbort = (): void => settle(() => reject(new AnalysisWaitError('aborted')));

    const unwatch = watch(
      () => ledger.getRaw(rawKey, nodeId),
      (packet) => {
        const matched = matchesTarget(packet, turnNumber);
        if (matched) settle(() => resolve(matched));
      }
    );

    const timerId = window.setTimeout(() => {
      settle(() => reject(new AnalysisWaitError('timeout')));
    }, options.timeoutMs);

    options.signal?.addEventListener('abort', onAbort);
  });
}
