/**
 * src/engine/katago/fresh-eval.ts
 *
 * Shared one-shot-evaluation primitives: open a dedicated
 * `KataGoClient` against a URL, await the authoritative final packet
 * for a query, and tear down — the `connect → subscribe → await-final
 * → disconnect` shape used by every caller that runs a fresh KataGo
 * evaluation off the `analysisService` singleton.
 *
 * ── Why these live here (ADR-0003 extract-on-2nd-consumer) ────────────
 * `connectFresh` was byte-duplicated and `awaitFinalPacket` near-
 * duplicated between `composables/board/usePlayFromPosition.ts` (which
 * itself shares them across `playEngineMoves` / `playEngineMatch`) and
 * the mint-time komi-calibration path. With three consumers of the
 * connection shape, ADR-0003's "extract a Port on the second concrete
 * consumer" trigger had already fired; these are that extraction. The
 * module is [B3] (KataGo wire vocabulary), the natural home alongside
 * `katago-client.ts` and `types.ts`.
 *
 * ── Telemetry stays out of this layer ─────────────────────────────────
 * The engine-match loop wants each turn to appear in the SPA's Toolbar
 * queue tooltip; the calibration path does not. Rather than couple this
 * [B3] engine module to the `useQueryTelemetry` composable, the
 * telemetry side-effects are injected as an optional `onPacket` /
 * `onSettle` observer pair — the caller (a composable) supplies them.
 * The core's connect / discriminate / timeout / teardown logic is the
 * single owned copy; the per-caller side-effects ride on the hooks.
 *
 * License: Public Domain (The Unlicense)
 */

import { KataGoClient } from './katago-client';
import type { KataAnalysisResponse } from './types';
import type { RoutedAnalysisQuery } from './query-routing';

/**
 * Connect a fresh `KataGoClient` and resolve once `onConnect` fires.
 * Rejects on disconnect-before-open and on `onError`. Wraps the
 * client's callback-shaped lifecycle into a single Promise. The caller
 * owns the returned client and is responsible for `disconnect()`.
 */
export function connectFresh(url: string): Promise<KataGoClient> {
  return new Promise((resolve, reject) => {
    let opened = false;
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const client = new KataGoClient('');
    client.connect(url, {
      onConnect: () => {
        opened = true;
        settle(() => resolve(client));
      },
      onDisconnect: (code, reason) => {
        if (!opened) {
          settle(() => reject(
            new Error(`KataGo WS closed before open (code=${code}, reason=${reason || 'n/a'}, url=${url})`),
          ));
        }
      },
      onError: (errorMsg) => {
        if (!opened) {
          settle(() => reject(
            new Error(`KataGo WS error before open: ${errorMsg} (url=${url})`),
          ));
        }
      },
    });
  });
}

/**
 * Optional observer hooks for `awaitFinalPacket`. `onPacket` fires for
 * every analysis packet (during-search and final) for telemetry / ETA
 * accounting; `onSettle` fires exactly once when the promise settles
 * (final / timeout / error), for unregister-on-settle bookkeeping. Both
 * are side-effect-only — they do not influence resolution. The
 * engine-match loop supplies them to surface queries in the Toolbar
 * queue tooltip; one-shot callers (komi calibration) omit them.
 */
export interface AwaitFinalPacketHooks {
  readonly onPacket?: (res: KataAnalysisResponse) => void;
  readonly onSettle?: () => void;
  /**
   * Optional rejector the caller can arm for a cooperative cancel
   * (e.g. the queue-tooltip's per-query Cancel). When the caller's
   * external cancel fires, it should call the supplied `reject`; the
   * promise then settles through the same teardown path. Invoked once
   * with the rejector so the caller can store it.
   */
  readonly armCancel?: (reject: (err: Error) => void) => void;
}

/**
 * Subscribe a single analysis query and resolve with the first final
 * packet (`isDuringSearch === false`) for `expectedTurn`. Intermediate
 * during-search packets are passed to `hooks.onPacket` (if supplied)
 * and otherwise ignored. The subscription tears down via the returned
 * `unsub` regardless of which channel — final / timeout / error /
 * caller-cancel — wins.
 *
 * Discriminates the typed `subscribe<Q>` callback: `'error' in res`
 * narrows the wire error variant (rejecting); the `else` is
 * `KataAnalysisResponse`.
 */
export function awaitFinalPacket(
  client: KataGoClient,
  query: RoutedAnalysisQuery,
  expectedTurn: number,
  timeoutMs: number,
  hooks: AwaitFinalPacketHooks = {},
): Promise<KataAnalysisResponse> {
  return new Promise((resolve, reject) => {
    let unsub: (() => void) | null = null;
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub?.();
      hooks.onSettle?.();
      fn();
    };
    hooks.armCancel?.((err) => settle(() => reject(err)));
    const timer = setTimeout(() => {
      settle(() => reject(
        new Error(`No final packet for turn ${expectedTurn} within ${timeoutMs}ms (queryId=${query.id})`),
      ));
    }, timeoutMs);
    unsub = client.subscribe(query, (res) => {
      // `query` is a KataGoAnalysisQuery, so the generic `subscribe<Q>`
      // types `res` as `KataAnalysisResponse | KataErrorResponse`. The
      // `'error' in res` discriminant narrows the `else` to
      // `KataAnalysisResponse` with no cast.
      if ('error' in res) {
        settle(() => reject(
          new Error(`KataGo error for queryId=${query.id}: ${res.error}`),
        ));
        return;
      }
      hooks.onPacket?.(res);
      if (res.turnNumber === expectedTurn && res.isDuringSearch === false) {
        settle(() => resolve(res));
      }
    });
  });
}
