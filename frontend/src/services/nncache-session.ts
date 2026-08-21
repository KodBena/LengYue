/**
 * src/services/nncache-session.ts
 *
 * Lifecycle driver for KataGo's persisted NN-cache-context feature
 * (`nnCacheDir` / `cache_attach` / `cache_detach` / `cache_dump` /
 * `cache_stats` — see `Analysis_Engine.md`, "Persisting a model's
 * cache across sessions"). Owns the session shape:
 *
 *   enable(ctx)  -> quiesce -> cache_attach (bare: whole level 0, no level1Fill)
 *   transition() -> quiesce -> cache_dump {what:'both'} -> cache_detach (discardUndumped:true
 *                    IFF the dump succeeded — see `dumpAndDetach`'s doc comment) -> cache_attach(new)
 *   disable()    -> cache_detach {discardUndumped: true}
 *
 * State is session-ephemeral module-scope reactive state (the
 * `state/per-query-overrides.ts` idiom — read its header): no
 * `GlobalStore` field, never persisted, resets on reload. The single
 * piece of state OTHER modules read (the currently attached wire
 * context, for auto-stamping every outgoing analysis query) lives in
 * `state/nncache-context.ts`, not here — see that module's header for
 * why the split avoids an import cycle back through
 * `engine/katago/query-routing.ts` / `services/analysis-service.ts`.
 *
 * ── Quiescence (ADR-0002: no wall-clock sleeps) ────────────────────
 * `cache_attach` / `cache_detach` are refused by the engine while ANY
 * analysis request is open, across the WHOLE engine (Analysis_Engine.md:
 * "The engine keeps one set of open requests across every hosted
 * model"). This driver can only quiesce the SPA's OWN
 * `analysisService`-tracked queries (`stopAllBoardAnalyses()`, which
 * stops pondering and terminates every range/analyze query on every
 * board) — it has no visibility into any other holder of an open
 * request. That includes genuine external clients of a shared
 * proxy/leaf, but ALSO — honestly, this is not just an "other
 * clients" gap — this SPA's OWN `connectFresh`-based connections
 * (`usePlayFromPosition.ts`'s match-player queries,
 * `useKomiCalibration.ts`'s mint-time calibration), which open an
 * independent `KataGoClient` entirely outside `analysisService`'s
 * `activeQueries`/`boardToQueries` bookkeeping. A request open on
 * either path correctly causes the engine to refuse a concurrent
 * attach/detach — loud and structured, handled by the ordinary
 * no-retry refusal path below, never silent — this driver simply
 * cannot pre-empt it by quiescing first, and does not attempt to
 * (no new quiesce machinery is owed here; the refusal path already
 * covers it). That release is synchronous (`AnalysisService.stopQuery`'s
 * bookkeeping clear is not itself a wire round-trip; see
 * `hasActiveQueries`'s doc comment), so there is nothing to poll or
 * sleep for: quiesce-then-send is one synchronous step followed by
 * one wire round-trip. Any residual race (the engine still finishing
 * a just-terminated query when the attach lands) surfaces as an
 * ordinary structured refusal, handled the same fail-loud way as
 * every other refusal below — never retried automatically.
 *
 * ── No retry loops (ADR-0002) ──────────────────────────────────────
 * Every wire refusal here ends the attempted transition, reverts the
 * UI-facing `enabled`/`status` state, and surfaces the engine's own
 * teaching text via `pushSystemMessage`. The user re-triggers by
 * re-ticking the checkbox (or the next card advance, for the review
 * session's re-enable) — there is no automatic re-attempt anywhere in
 * this module.
 *
 * License: Public Domain (The Unlicense)
 */

import { reactive, readonly, computed, watch, type ComputedRef } from 'vue';
import { store } from '../store';
import { pushSystemMessage } from './system-message-sink';
import { i18n } from '../i18n';
import { analysisService } from './analysis-service';
import { translateEngineCacheContext, type EngineCacheContext } from '../engine/katago/cache-context';
import { activeAttachedContext, setAttachedContext, clearAttachedContext } from '../state/nncache-context';
import type { KataActionResponse } from '../engine/katago/types';
import { useAuth } from '../composables/auth-app/useAuth';

export type NncacheSessionStatus = 'idle' | 'attaching' | 'attached' | 'detaching';

interface NncacheSessionState {
  /** UI checkbox reflection. True only once an attach has actually SUCCEEDED. */
  enabled: boolean;
  /** UN-prefixed context text, exactly as shown in the toolbar text field. */
  rawContext: string;
  status: NncacheSessionStatus;
}

const _state = reactive<NncacheSessionState>({
  enabled: false,
  rawContext: '',
  status: 'idle',
});

export const nncacheEnabled: ComputedRef<boolean> = computed(() => _state.enabled);
export const nncacheRawContext: ComputedRef<string> = computed(() => _state.rawContext);
export const nncacheStatus: ComputedRef<NncacheSessionStatus> = computed(() => _state.status);

/** UI-only text-field edit, independent of whether a context is currently attached. Committed by `enable`. */
export function setNncacheRawContextText(text: string): void {
  _state.rawContext = text;
}

// ── Wire helpers ─────────────────────────────────────────────────────────────

function actionId(action: string): string {
  return `nncache-${action}-${Date.now()}`;
}

/**
 * Send one cache_* action and discriminate the result. `sendCommand`'s
 * promise (via `analysisService.sendActionCommand`) never rejects —
 * a wire refusal comes back as a `KataErrorResponse`, discriminated
 * here the same `'error' in res` way every other consumer of this
 * union does (`engine/katago/types.ts`'s `ResponseFor` doc comment).
 */
async function sendCacheAction(
  query: Parameters<typeof analysisService.sendActionCommand>[0],
): Promise<{ ok: true; response: KataActionResponse } | { ok: false; message: string }> {
  const res = await analysisService.sendActionCommand(query);
  if ('error' in res) {
    const detail = res.field ? `${res.error} (field: ${res.field})` : res.error;
    return { ok: false, message: detail };
  }
  // Narrowed away KataErrorResponse above; the remaining members are
  // KataAnalysisResponse | KataActionResponse. This driver only ever
  // sends action queries through `sendActionCommand`, so a non-error
  // response here is, by construction, always the action-echo shape —
  // justified cast (ADR-0002: type assertion needs a justification).
  return { ok: true, response: res as KataActionResponse };
}

/**
 * Best-effort SPA-side quiescence — see the module header's
 * "Quiescence" section for why this is exactly one synchronous step
 * with nothing to poll or sleep for.
 */
function quiesce(): void {
  analysisService.stopAllBoardAnalyses();
}

function currentModel(): string | undefined {
  return store.engine.selectedModel ?? undefined;
}

/**
 * `useAuth()` is a plain function returning computed views over
 * `useAuth.ts`'s own module-scope `_authState` ref (see that file's
 * header — auth state is deliberately module-scope, not
 * component-instance state, precisely so it can be read from a
 * non-setup singleton like this one). No lifecycle is registered by
 * calling it, so reading it here — at call time, not at import time —
 * is as safe as any other read site.
 */
function currentUsername(): string | null {
  return useAuth().username.value;
}

// ── Core transitions ─────────────────────────────────────────────────────────

/**
 * Attach `rawContext` (UN-prefixed) as the active NN-cache context.
 * On success: `state/nncache-context.ts` is updated (every subsequent
 * outgoing analysis query is stamped), `enabled` flips true, and
 * `rawContext` is committed. On ANY failure (bad grammar, no
 * username, or a wire refusal), the checkbox stays/reverts to
 * unticked and a system message names the reason — no retry.
 */
export async function enable(rawContext: string): Promise<void> {
  const translated = translateEngineCacheContext(rawContext, currentUsername());
  if (translated.kind === 'error') {
    pushSystemMessage('warning', i18n.global.t('nncache.contextInvalid', { detail: translated.message }));
    _state.enabled = false;
    return;
  }

  _state.status = 'attaching';
  quiesce();

  const result = await sendCacheAction({
    id: actionId('attach'),
    action: 'cache_attach',
    context: translated.value,
    model: currentModel(),
    // Bare attach, per the ratified feature scope: whole level 0, no level1Fill.
  });

  if (!result.ok) {
    _state.status = 'idle';
    _state.enabled = false;
    pushSystemMessage('warning', i18n.global.t('nncache.attachRefused', { detail: result.message }));
    return;
  }

  setAttachedContext(translated.value);
  _state.rawContext = rawContext;
  _state.enabled = true;
  _state.status = 'attached';
  console.info('[nncache-session] attached', translated.value, result.response);
}

/**
 * Detach the active context, discarding any undumped work
 * (`discardUndumped: true`) — the ratified semantics for an explicit
 * user opt-out: a card the user unticked persists NOTHING from this
 * session. Visible in the console log per that same ratification.
 * No-op if nothing is attached.
 *
 * On a REFUSED `cache_detach`, the engine is STILL attached to `ctx`
 * (Analysis_Engine.md, "Attributing what a query earns in the
 * cache": with exactly one context attached, an untagged query is
 * silently attributed to it). Clearing local state on that refusal —
 * the bug this function used to have — would leave the SPA believing
 * it had detached while the engine kept attributing every subsequent
 * untagged query to the card the user just tried to disable. So a
 * refusal here reverts to the settled `attached` state instead:
 * `enabled` stays true (the checkbox re-ticks), `status` returns to
 * `'attached'` rather than `'idle'`, and `activeAttachedContext` is
 * left untouched so `query-routing.ts` keeps stamping `cacheContext`
 * on outgoing queries. No automatic retry (ADR-0002) — the user
 * re-ticks the checkbox to try again.
 */
export async function disable(): Promise<void> {
  if (!_state.enabled) return;
  const ctx = readAttachedOrBail();
  if (ctx === null) {
    _state.enabled = false;
    _state.status = 'idle';
    return;
  }

  _state.status = 'detaching';
  quiesce();

  const result = await sendCacheAction({
    id: actionId('detach'),
    action: 'cache_detach',
    context: ctx,
    model: currentModel(),
    discardUndumped: true,
  });

  if (!result.ok) {
    _state.status = 'attached';
    pushSystemMessage('warning', i18n.global.t('nncache.detachRefused', { detail: result.message }));
    return;
  }

  clearAttachedContext();
  _state.enabled = false;
  _state.status = 'idle';
  console.info(
    '[nncache-session] detached (discarded undumped work)',
    ctx,
    'discardedUndumpedEntries=', result.response.discardedUndumpedEntries ?? 0,
  );
}

/**
 * Dump {what:'both'} the currently attached context, then detach it —
 * the dump-first semantics shared by `transition`, `endSession`, and
 * the best-effort disconnect hook.
 *
 * ── Why the detach leg sends `discardUndumped:true`, but ONLY after a
 * SUCCESSFUL dump (ledger row 2543) ──────────────────────────────────
 * `cache_dump {what:'both'}`'s admission policy (Analysis_Engine.md,
 * "Persisting a model's cache across sessions": a raw evaluation is
 * written to the `.nnevals` dump only once it has accumulated at
 * least `minObservations` observations — 2 by default — while the
 * observation COUNT for every entry, including single-observation
 * ones, is always written to the sibling `.nncounts` file regardless
 * of that threshold. So a dump that legitimately, successfully wrote
 * everything it's willing to write can still leave the context
 * holding "earned but not on disk" entries — single-observation
 * evaluations the admission policy declined to persist THIS session.
 * A plain `cache_detach` right after such a dump is refused every
 * time such an entry exists ("N earned entries not on disk"), because
 * from the engine's perspective that's still un-persisted work the
 * caller hasn't said it's fine to lose. But it isn't really lost: the
 * observation count for those entries IS already on disk (the
 * `.nncounts` dump captured it), so a future session that re-observes
 * the same position starts from that count and promotes the entry
 * past `minObservations` on its own — this is the engine's own
 * documented cross-session admission design, not a workaround. So
 * once the dump has actually succeeded, discarding exactly what the
 * admission policy itself refused to write is safe and intentional:
 * `discardUndumped:true` on THIS detach throws away nothing the dump
 * didn't already choose to leave behind. Visible in the console log,
 * same as `disable()`'s discard.
 *
 * A FAILED dump gets none of this — the detach leg is sent WITHOUT
 * `discardUndumped`, exactly the pre-existing behavior. A refused
 * dump means nothing was persisted this round, so there is nothing
 * the admission policy "already handled"; discarding on that path
 * would throw away real, never-written work, which is precisely what
 * `disable()`'s explicit-opt-out discard is for and this dump-first
 * path is not.
 *
 * Clears `state/nncache-context.ts` and `enabled`/`status` ONLY when
 * the detach leg actually SUCCEEDS. A refused `cache_dump` never
 * touches attach state at all (it's a distinct wire action from
 * `cache_attach`/`cache_detach`), so the engine remains attached to
 * `ctx` regardless of whether the dump lands — clearing local state
 * on a dump refusal would be exactly the same misattribution hazard
 * as clearing it on a detach refusal, just one step earlier. A
 * refused `cache_detach` leaves the engine attached too (per
 * Analysis_Engine.md's sole-context implicit-attribution rule). In
 * both refusal cases this function reverts to the settled `attached`
 * state — `enabled` stays true, `status` returns to `'attached'`,
 * and `activeAttachedContext` is left untouched so `query-routing.ts`
 * keeps stamping `cacheContext` — never left half-tracked (ADR-0002),
 * and never silently believed detached when the engine still isn't.
 * Returns `true` only when both legs actually succeeded.
 */
async function dumpAndDetach(ctx: EngineCacheContext): Promise<boolean> {
  quiesce();

  const dumpResult = await sendCacheAction({
    id: actionId('dump'),
    action: 'cache_dump',
    context: ctx,
    model: currentModel(),
    what: 'both',
  });
  if (!dumpResult.ok) {
    _state.status = 'attached';
    pushSystemMessage('warning', i18n.global.t('nncache.dumpRefused', { detail: dumpResult.message }));
    return false;
  }

  // Dump succeeded: any "earned but not on disk" entries left behind
  // are exactly what the admission policy itself declined to persist
  // (see the doc comment above) — safe to discard here.
  const detachResult = await sendCacheAction({
    id: actionId('detach'),
    action: 'cache_detach',
    context: ctx,
    model: currentModel(),
    discardUndumped: true,
  });
  if (!detachResult.ok) {
    _state.status = 'attached';
    pushSystemMessage('warning', i18n.global.t('nncache.detachRefused', { detail: detachResult.message }));
    return false;
  }

  clearAttachedContext();
  _state.enabled = false;
  _state.status = 'idle';
  console.info(
    '[nncache-session] dumped + detached (discarded post-dump admission-refused entries)',
    ctx,
    'discardedUndumpedEntries=', detachResult.response.discardedUndumpedEntries ?? 0,
  );
  return true;
}

/**
 * Dump {what:'both'} the currently attached context, detach it (per
 * `dumpAndDetach`'s doc comment: `discardUndumped:true` IFF the dump
 * succeeded, discarding only what the admission policy itself refused
 * to persist — never a blanket discard), then attach `newRawContext`.
 * Used for a card advance / context edit while enabled, and for a
 * model/label switch while enabled (same context string, different
 * `model` leg).
 *
 * On any leg's refusal: surfaces the refusal and leaves local state
 * exactly as `dumpAndDetach` reverted it — `enabled` stays true,
 * `status` back to `'attached'`, `activeAttachedContext` still `ctx`
 * — so the SPA's belief matches the engine's (still attached to the
 * OLD context) rather than drifting into a silent untagged-but-
 * attached gap. The new context is never attached in that case. The
 * caller (review session / model-switch watcher) does not retry
 * automatically; the next card advance or model pick tries again.
 */
export async function transition(newRawContext: string): Promise<void> {
  if (!_state.enabled) {
    await enable(newRawContext);
    return;
  }
  const ctx = readAttachedOrBail();
  if (ctx === null) {
    await enable(newRawContext);
    return;
  }

  const ok = await dumpAndDetach(ctx);
  if (!ok) return;
  await enable(newRawContext);
}

/**
 * Dump {what:'both'} the currently attached context and detach it —
 * via `dumpAndDetach`, so `discardUndumped:true` is sent IFF the dump
 * succeeded, discarding only the admission-refused residue (see that
 * function's doc comment), never a blanket discard. The ratified
 * "session end" disposition (review session ending, not the WS):
 * distinct from `disable()`'s explicit user-opt-out discard, which
 * discards unconditionally without ever attempting a dump. No-op if
 * nothing is attached.
 */
export async function endSession(): Promise<void> {
  if (!_state.enabled) return;
  const ctx = readAttachedOrBail();
  if (ctx === null) {
    clearAttachedContext();
    _state.enabled = false;
    _state.status = 'idle';
    return;
  }
  _state.status = 'detaching';
  await dumpAndDetach(ctx);
}

/**
 * The context this driver believes is actually attached right now —
 * read from `state/nncache-context.ts` (the same value every outgoing
 * analysis query is stamped with), NOT re-derived from
 * `_state.rawContext` + the current username. Re-deriving would drift
 * from what was actually sent to `cache_attach` if the username
 * changed between attach and now (a mid-review identity switch) —
 * this reads the authoritative record of what IS attached instead.
 */
function readAttachedOrBail(): EngineCacheContext | null {
  return activeAttachedContext.value;
}

// ── Model/label switch (ratified: dump + detach old, attach new) ─────────────
//
// Watches the SELECTOR Toolbar dropdown. Only reacts while a context
// is attached; a switch while disabled has nothing to transition.
watch(
  () => store.engine.selectedModel,
  () => {
    if (!_state.enabled) return;
    void transition(_state.rawContext);
  },
);

// ── Session end / disconnect (best effort) ────────────────────────────────────
//
// Registered with `analysisService`'s disconnect-hook port (see that
// service's own doc comment on `disconnectHooks` for why this is a
// registered port rather than a direct import back into
// analysis-service.ts). Fire-and-forget: the socket is about to close,
// so there is no response to await meaningfully — this is exactly the
// "best effort, surfaced if it fails" disposition the ratified spec
// calls for. A response that DOES arrive before the socket closes is
// still logged; one that doesn't is silently lost, same as any other
// best-effort teardown message in this codebase.
//
// HMR guard: `disconnectHooks` is an array owned by the
// `analysisService` singleton, which is NOT torn down by Vite HMR —
// only this module is re-executed when it's edited in dev. Without a
// guard, every hot reload of this file would push a second (stale-
// closure) hook into that array, so a later disconnect would run
// N accumulated hooks instead of one. `import.meta.hot.data` is the
// one piece of state Vite preserves across a module's own hot
// reloads, so it's the natural place to remember "already registered
// this session." No-op in production — `import.meta.hot` is
// undefined there, so this degrades to the original unconditional
// registration.
if (!import.meta.hot?.data?.nncacheDisconnectHookRegistered) {
  analysisService.registerDisconnectHook(() => {
    if (!_state.enabled) return;
    const ctx = readAttachedOrBail();
    if (ctx === null) {
      clearAttachedContext();
      _state.enabled = false;
      _state.status = 'idle';
      return;
    }
    void dumpAndDetach(ctx).catch((err) => {
      console.error('[nncache-session] best-effort disconnect dump+detach failed:', err);
    });
  });
  // Vite's own HotContext always carries a (mutable, but
  // non-reassignable) `.data` object; a test runner's partial
  // `import.meta.hot` stand-in may omit it, so guard the write the
  // same way the read above does rather than assuming the shape.
  if (import.meta.hot?.data) {
    import.meta.hot.data.nncacheDisconnectHookRegistered = true;
  }
}

// ── Test-only reset ────────────────────────────────────────────────────────
export function _resetNncacheSessionForTesting(): void {
  _state.enabled = false;
  _state.rawContext = '';
  _state.status = 'idle';
  clearAttachedContext();
}

export const _nncacheStateForTesting = readonly(_state);
