/**
 * src/composables/useProxyUpstreamSetting.ts
 *
 * The desktop-only, in-app-settable proxy-upstream field (ledger rows
 * 860-862 — repairing an unratified deferral of commission row 820's
 * own words: "Before setup, the user will be instructed to provide a
 * websocket location for that"). Desktop users have no way to set an OS
 * environment variable, so this composable is the one home the wizard's
 * engine-URI step and Settings' Session sub-tab BOTH read/write through
 * (ADR-0012: one cell, one home — the Rust-side JSON file
 * `src-tauri/src/proxy_settings.rs` writes is that one cell; this
 * composable is a second EDITOR of it, never a second cell, the exact
 * relationship `useEngineUriEditor.ts` has to its own store cell).
 *
 * Precedence (env > stored > default), decided ENTIRELY on the Rust
 * side (`proxy_settings::resolve_effective_upstream`) — this composable
 * never re-derives it, only displays what `get_proxy_upstream_setting`
 * reports.
 *
 * Non-Tauri inertness (commission constraint 5): every exported action
 * checks `IS_TAURI` FIRST and no-ops (or resolves a safe placeholder)
 * when false, so calling this composable outside a Tauri build never
 * attempts an `invoke` — `@tauri-apps/api`'s `invoke` throws when no
 * Tauri runtime is present, and that throw must never be reachable from
 * a web/docker build regardless of what a caller does. Hiding the field
 * in the template (`v-if="isTauri"`) is the visible half; this guard is
 * the structural half that makes it inert, not just hidden.
 *
 * Takes effect on next launch, not live — `save()` persists to disk and
 * returns; it never attempts to reconnect the SPA's live WebSocket or
 * respawn the sidecar (see `proxy_settings.rs`'s
 * `set_proxy_upstream_setting` doc comment for the rejected live-respawn
 * alternative). Callers show the "restart to apply" copy themselves
 * (ADR-0019 C6/C7 — never silently imply the change is already live).
 *
 * mDNS upstream discovery (ledger row 944 — `discover_upstreams`): when
 * `load()` reports NEITHER the env override NOR a stored setting (a
 * fresh install), this composable auto-runs a one-shot discovery browse
 * for `_katago-ws._tcp.local.` — never a poll. `shouldAutoDiscover` and
 * `classifyDiscoveryResults` are the pure decision half (given the
 * loaded info / the raw discovery results, what should the UI show);
 * `discover()` is the shell that calls them around the `invoke`. A
 * manual "scan again" affordance (genre-convention refresh — ADR-0019)
 * re-runs `discover()` unconditionally, bypassing the auto-run gate.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';
import { IS_TAURI } from '../config/env';
import { validateEngineUri } from '../lib/ws-url';

/** Mirrors `ProxyUpstreamInfo` in `src-tauri/src/proxy_settings.rs`
 *  field-for-field (camelCase on both sides) — kept in sync by hand,
 *  the same posture any other Tauri-command wire shape in this codebase
 *  has (no shared-schema codegen for `invoke`, unlike `gen:api` for the
 *  backend). */
export interface ProxyUpstreamInfo {
  readonly effective: string;
  readonly stored: string | null;
  readonly envOverrideActive: boolean;
  readonly defaultUpstream: string;
}

/** Mirrors `DiscoveredUpstream` in `src-tauri/src/proxy_settings.rs`'s
 *  `discover_upstreams` command (ledger row 944) — same camelCase-on-
 *  both-sides mirroring convention as `ProxyUpstreamInfo` above. */
export interface DiscoveredUpstream {
  readonly url: string;
  readonly instanceName: string;
}

/**
 * Outcome of one discovery attempt. `'idle'` (nothing attempted yet)
 * and `'discovering'` (the invoke is in flight) are session states
 * `discover()` itself manages; the remaining three variants are exactly
 * `classifyDiscoveryResults`'s return values, so a caller who only
 * cares about the outcome can switch on those three without touching
 * the session states.
 */
export type ProxyUpstreamDiscoveryState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'discovering' }
  | { readonly kind: 'none' }
  | { readonly kind: 'single'; readonly upstream: DiscoveredUpstream }
  | { readonly kind: 'multiple'; readonly upstreams: readonly DiscoveredUpstream[] };

/**
 * Pure decision: should `load()` auto-run discovery? Per the ratified
 * contract (ledger row 944), only when NEITHER the env override NOR a
 * stored setting exists — either one already gives the field an
 * authoritative value, and a discovery browse would only add noise (or
 * silently race a value the user already chose). `info === null` means
 * `load()` itself failed (or hasn't run) — never auto-discover from an
 * unknown state.
 */
export function shouldAutoDiscover(info: ProxyUpstreamInfo | null): boolean {
  return info !== null && !info.envOverrideActive && info.stored === null;
}

/**
 * Pure decision: classify raw `discover_upstreams` results into the
 * three outcomes the ratified contract names — zero (`'none'`: today's
 * default prefill, no notice, no error), exactly one (`'single'`:
 * prefill its url, visibly marked as discovered), or more than one
 * (`'multiple'`: the picker).
 */
export function classifyDiscoveryResults(
  results: readonly DiscoveredUpstream[],
): ProxyUpstreamDiscoveryState {
  if (results.length === 0) return { kind: 'none' };
  if (results.length === 1) return { kind: 'single', upstream: results[0] };
  return { kind: 'multiple', upstreams: results };
}

export interface ProxyUpstreamSetting {
  /** True only under the Tauri desktop shell — callers gate rendering
   *  on this the same way they'd gate on any other Tauri-only affordance. */
  readonly isTauri: boolean;
  /** True while `load()`'s invoke is in flight. */
  readonly loading: Ref<boolean>;
  /** The last-loaded snapshot from the Rust side, or `null` before the
   *  first successful `load()` (or outside Tauri, where it never loads). */
  readonly info: Ref<ProxyUpstreamInfo | null>;
  /** The in-progress edit buffer; bound to the input. Seeded from
   *  `info.value.stored` (or empty, meaning "unset — falls through to
   *  the default") on `load()`, then possibly re-seeded by a `'single'`
   *  discovery outcome (see `discoveryState` below). */
  readonly draft: Ref<string>;
  /** The current mDNS-discovery outcome — see `ProxyUpstreamDiscoveryState`.
   *  A caller may write this ref directly (e.g. to dismiss a `'multiple'`
   *  picker back to `'idle'` once the user has chosen) — it is plain UI
   *  state, not a second copy of anything persisted. */
  readonly discoveryState: Ref<ProxyUpstreamDiscoveryState>;
  /** Fetch the current setting from the Rust side. No-op outside Tauri.
   *  Auto-runs `discover()` afterward when `shouldAutoDiscover` holds. */
  load: () => Promise<void>;
  /** Run (or re-run) a one-shot mDNS discovery browse and update
   *  `discoveryState` (and, on a `'single'` outcome, prefill `draft`).
   *  This is both the auto-run `load()` triggers and the "scan again"
   *  action a caller wires to a manual button — unconditional, no gate.
   *  No-op outside Tauri. */
  discover: () => Promise<void>;
  /** Validate the draft (same `ws://`/`wss://` shape rule
   *  `useEngineUriEditor.ts` enforces) and, if valid, persist it. Invalid
   *  input is rejected with a discriminated result and the store is
   *  never written (ADR-0002 fail-loudly — no silent sanitizing). No-op
   *  (returns an inert `ok: false`) outside Tauri. */
  save: () => Promise<{ readonly ok: true } | { readonly ok: false; readonly errorKey: string }>;
}

export function useProxyUpstreamSetting(): ProxyUpstreamSetting {
  const loading = ref(false);
  const info = ref<ProxyUpstreamInfo | null>(null);
  const draft = ref('');
  const discoveryState = ref<ProxyUpstreamDiscoveryState>({ kind: 'idle' });

  async function discover(): Promise<void> {
    if (!IS_TAURI) return; // Inert outside Tauri — see module doc comment.
    discoveryState.value = { kind: 'discovering' };
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      // No `timeout_ms` arg — Rust's `Option<u32>` deserializes a
      // missing key as `None`, which resolves to the command's own
      // documented default (2000ms). No UI surfaces a configurable
      // timeout (not asked for by the contract), so there is nothing to
      // pass through.
      const results = await invoke<DiscoveredUpstream[]>('discover_upstreams');
      const outcome = classifyDiscoveryResults(results);
      discoveryState.value = outcome;
      if (outcome.kind === 'single') {
        draft.value = outcome.upstream.url;
      }
    } catch (err) {
      // Absence is never an error per the contract ("resolves to []
      // when mDNS is unavailable or nothing answers") — but the
      // `invoke` call itself can still reject (e.g. the command isn't
      // registered). Degrade to the same "found nothing" outcome rather
      // than surfacing a discovery failure as a field error; the field
      // still works via manual entry either way.
      console.error('[proxyUpstream] discovery failed:', err);
      discoveryState.value = { kind: 'none' };
    }
  }

  async function load(): Promise<void> {
    if (!IS_TAURI) return; // Inert outside Tauri — see module doc comment.
    loading.value = true;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<ProxyUpstreamInfo>('get_proxy_upstream_setting');
      info.value = result;
      draft.value = result.stored ?? '';
    } catch (err) {
      // Rust-side `get_proxy_upstream_setting` rejects loudly on a
      // corrupted settings file (ADR-0002 — `proxy_settings.rs`'s
      // `read_stored_upstream` never treats unparseable JSON as
      // "unset"). Caught here (rather than left to become an unhandled
      // promise rejection at the `onMounted` call site) so a corrupted
      // file degrades to "field shows empty, console carries the real
      // error" instead of crashing the wizard/Settings mount. `info`
      // stays whatever it was (null on first load) — the UI's existing
      // null-check paths already handle that.
      console.error('[proxyUpstream] failed to load the stored setting:', err);
    } finally {
      loading.value = false;
    }
    if (shouldAutoDiscover(info.value)) {
      await discover();
    }
  }

  async function save(): Promise<{ ok: true } | { ok: false; errorKey: string }> {
    if (!IS_TAURI) return { ok: false, errorKey: 'proxyUpstream.error.saveFailed' }; // unreachable in practice: no Tauri UI calls save() outside Tauri.
    const validation = validateEngineUri(draft.value);
    if (!validation.ok) {
      // Same validator `useEngineUriEditor.ts` uses (`lib/ws-url.ts` —
      // one validation function, one home per ADR-0012), but its
      // `errorKey`s are namespaced `engineUri.error.*` for that field's
      // own copy. This field is a conceptually distinct setting (the
      // proxy's upstream, not the SPA's own engine URI); the suffix
      // (`empty` / `malformed` / `scheme`) is shape-identical across
      // both validators by construction, so remapping the namespace is
      // exactly a prefix swap, not a second validation rule.
      const suffix = validation.errorKey.split('.').pop();
      return { ok: false, errorKey: `proxyUpstream.error.${suffix}` };
    }
    const trimmed = draft.value.trim();
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('set_proxy_upstream_setting', { value: trimmed });
    } catch {
      // The Rust side revalidates independently (defense in depth — see
      // `proxy_settings.rs`'s `validate_upstream`) and can also fail on
      // disk I/O (permissions, a full filesystem). The client-side
      // validation above already covers every shape error the SPA can
      // itself construct, so a rejection reaching here is the I/O case;
      // surfaced with its own key rather than misattributed to a shape
      // error the draft doesn't actually have.
      return { ok: false, errorKey: 'proxyUpstream.error.saveFailed' };
    }
    // A persisted value is authoritative regardless of how the draft
    // got there (typed, or picked from a discovery result) — clear any
    // stale discovery notice/picker so it doesn't linger after a
    // successful save. `load()` below won't re-derive this: `stored` is
    // now non-null, so `shouldAutoDiscover` stays false.
    discoveryState.value = { kind: 'idle' };
    await load(); // Re-fetch so `info`/`draft` reflect the just-saved state.
    return { ok: true };
  }

  return { isTauri: IS_TAURI, loading, info, draft, discoveryState, load, discover, save };
}
