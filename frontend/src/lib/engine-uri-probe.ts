/**
 * src/lib/engine-uri-probe.ts
 *
 * Bounded reachability probe for an engine WebSocket URI — backs the
 * setup wizard's "Test connection" affordance (commissioner ledger rows
 * 1365/1366: "should have a way to probe the connection right there, so
 * as to give the user some level of psychological comfort"). Checked
 * first for an existing connection-test/ping utility in the engine/proxy
 * service layer before writing this: `engine/katago/katago-client.ts`
 * only exposes a STATEFUL `connect()` that opens the app's real
 * connection and writes `store.engine.*`; `useEngineControls` wraps that
 * same stateful pair; `lib/ws-url.ts` validates URI SYNTAX, never
 * reachability. None of those is a bounded, side-effect-free probe, so
 * this is a fresh minimal one — not a reuse.
 *
 * PROBE-ONLY: opens a plain `WebSocket` purely to observe whether it
 * opens, then closes it immediately on either branch. Never touches
 * `store.engine` or `store.profile.settings.engine.katago.url`, never
 * left open, never retried automatically — the caller decides whether
 * and when to probe again.
 *
 * Domain-free (no engine/Go coupling) — [B1], same coupling band as
 * `ws-url.ts` in this directory.
 *
 * License: Public Domain (The Unlicense)
 */

/** Discriminated probe outcome. `reason` is a stable machine key (not
 *  user-facing text) — callers translate it via the
 *  `wizard.engineUri.test.reason.*` i18n namespace. */
export type EngineUriProbeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'timeout' | 'error' };

const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Opens a WebSocket to `uri` and resolves `{ ok: true }` if it opens
 * within `timeoutMs`, else `{ ok: false, reason }`. Never throws — a
 * synchronously-throwing malformed URI (same failure mode
 * `useEngineUriEditor` guards against via `validateEngineUri` before
 * ever calling this) resolves as `{ ok: false, reason: 'error' }`
 * instead of propagating.
 */
export function probeEngineUri(uri: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<EngineUriProbeResult> {
  return new Promise((resolve) => {
    let settled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(uri);
    } catch {
      resolve({ ok: false, reason: 'error' });
      return;
    }

    const finish = (result: EngineUriProbeResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.onopen = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        // Already closed/closing — nothing to do.
      }
      resolve(result);
    };

    const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), timeoutMs);

    ws.onopen = () => finish({ ok: true });
    ws.onerror = () => finish({ ok: false, reason: 'error' });
  });
}
