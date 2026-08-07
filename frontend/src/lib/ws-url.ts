/**
 * src/lib/ws-url.ts
 *
 * Validation for the engine WebSocket URI — applied by the TOOLBAR
 * editor (`useEngineUriEditor`) before committing a new value. The
 * Settings tab's Advanced Registry editor writes the same cell
 * UNVALIDATED on every keystroke (pre-existing; flagged to the
 * commissioner at the toolbar-engine-uri review — extending
 * validation to that path is a separate ruling, not silently done
 * here). (ADR-0002 fail-loudly: an unparseable URI
 * must be rejected with a message, never handed to `new WebSocket(...)`
 * where it throws synchronously and uncaught inside
 * `KataGoClient.connect` — see that constructor's call site in
 * `engine/katago/katago-client.ts`).
 *
 * Domain-free (no engine/Go coupling) — [B1], same band as the rest
 * of `lib/`.
 *
 * License: Public Domain (The Unlicense)
 */

/** Discriminated result: `ok: true` on acceptance, `ok: false` with an
 *  i18n message key (under the `engineUri.error.*` namespace) naming
 *  which rule failed — the caller translates via `t()` (component) or
 *  `i18n.global.t()` (composable/service context). */
export type WsUrlValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly errorKey: string };

/**
 * Accepts only well-formed `ws://` / `wss://` URIs — the two schemes
 * the browser's `WebSocket` constructor itself accepts. Delegates
 * parsing to the platform `URL` constructor (RFC 3986 host/port/path)
 * rather than a hand-rolled regex; `URL` throws synchronously on a
 * malformed string, which this function catches so no caller ever
 * needs to.
 */
export function validateEngineUri(raw: string): WsUrlValidation {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, errorKey: 'engineUri.error.empty' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, errorKey: 'engineUri.error.malformed' };
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    return { ok: false, errorKey: 'engineUri.error.scheme' };
  }
  return { ok: true };
}
