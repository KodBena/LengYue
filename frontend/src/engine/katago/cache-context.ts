/**
 * src/engine/katago/cache-context.ts
 *
 * Translate-and-validate seam for the NN-cache-context feature's wire
 * value. `EngineCacheContext` is the branded, ALREADY-NAMESPACED
 * string that is legal to send as `cacheContext` on an analysis query
 * or as `context` on a cache_attach/cache_detach/cache_dump action —
 * the type makes an un-namespaced or grammar-illegal context
 * unrepresentable at the call sites that read it (`query-routing.ts`,
 * `nncache-session.ts`).
 *
 * ── Namespacing ─────────────────────────────────────────────────────
 * The wire context is `<username>.<context>` (dot delimiter) — per
 * the ratified NN-cache-context feature, every user's contexts live
 * in a disjoint namespace on a shared KataGo leaf's `nnCacheDir` even
 * though the leaf itself has no concept of accounts. `translateEngineCacheContext`
 * is the SOLE composition site; nothing else concatenates a username
 * onto a raw context string.
 *
 * ── Grammar (KataGo's own, Analysis_Engine.md "Contexts and files") ──
 * ASCII letters, digits, `.`, `_`, `-`; 1–128 characters; not `.` or
 * `..`. The engine REFUSES anything outside this — never rewrites —
 * so this function refuses too, rather than sanitising a bad value
 * into a different one the user didn't ask for (ADR-0002).
 *
 * License: Public Domain (The Unlicense)
 */

import type { Brand } from '../../types/ids';

/**
 * A wire-legal, already-namespaced NN-cache context string. Minted
 * only by `translateEngineCacheContext` below.
 */
export type EngineCacheContext = Brand<string, 'EngineCacheContext'>;

/** KataGo's own context-name grammar (Analysis_Engine.md, "Contexts and files"). */
const CONTEXT_GRAMMAR = /^[A-Za-z0-9._-]+$/;
const MAX_CONTEXT_LENGTH = 128;

export type CacheContextResult =
  | { readonly kind: 'ok'; readonly value: EngineCacheContext }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Compose `<username>.<rawContext>` and validate the result against
 * KataGo's context-name grammar. Refuses (never rewrites/truncates)
 * on:
 *   - no username available (fail loud per ADR-0002 — there is no
 *     fallback identity to namespace under);
 *   - an empty raw context;
 *   - the composed string being outside the legal alphabet, over
 *     128 characters, or equal to `.` / `..` (both structurally
 *     unreachable once a non-empty username is prepended with a dot,
 *     but checked explicitly since the grammar is the engine's
 *     contract, not a derived property this function should assume).
 */
export function translateEngineCacheContext(
  rawContext: string,
  username: string | null,
): CacheContextResult {
  if (username === null || username.length === 0) {
    return { kind: 'error', message: 'No signed-in username — the NN cache context cannot be namespaced.' };
  }
  const trimmed = rawContext.trim();
  if (trimmed.length === 0) {
    return { kind: 'error', message: 'Cache context must not be empty.' };
  }
  const composed = `${username}.${trimmed}`;
  if (composed === '.' || composed === '..') {
    return { kind: 'error', message: `Cache context "${composed}" is reserved and not usable.` };
  }
  if (composed.length > MAX_CONTEXT_LENGTH) {
    return {
      kind: 'error',
      message: `Cache context "${composed}" is ${composed.length} characters; KataGo allows at most ${MAX_CONTEXT_LENGTH}.`,
    };
  }
  if (!CONTEXT_GRAMMAR.test(composed)) {
    return {
      kind: 'error',
      message: `Cache context "${composed}" contains characters KataGo does not allow (only ASCII letters, digits, '.', '_', '-').`,
    };
  }
  // Sole EngineCacheContext mint: composed string just verified
  // against the full grammar above.
  return { kind: 'ok', value: composed as EngineCacheContext };
}
