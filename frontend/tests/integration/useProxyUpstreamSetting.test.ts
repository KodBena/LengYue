/**
 * tests/integration/useProxyUpstreamSetting.test.ts
 *
 * Integration coverage for `useProxyUpstreamSetting` (ledger rows
 * 860-862) — the desktop-only, in-app-settable proxy-upstream field.
 * `IS_TAURI` is mocked `true` here (jsdom never sets
 * `window.__LENGYUE_PROXY_PORT__`) to exercise the Tauri-path branches;
 * the sibling non-Tauri-inertness test lives in
 * `useProxyUpstreamSetting-inert.test.ts`, which deliberately does NOT
 * mock `config/env` so `IS_TAURI` resolves the real (false) way.
 *
 * The `@tauri-apps/api/core` `invoke` mock is STATEFUL — a tiny
 * in-memory stand-in for the Rust-side JSON file
 * (`src-tauri/src/proxy_settings.rs`) — so `load()`/`save()` round-trip
 * exactly the way the real commands do, including the `stored`/
 * `envOverrideActive` provenance fields the UI reads.
 *
 * Also covers mDNS upstream discovery (ledger row 944,
 * `discover_upstreams`) — the `fakeDiscovered` array below stands in
 * for the Rust-side mDNS browse results. Coverage for the PURE decision
 * functions (`shouldAutoDiscover`, `classifyDiscoveryResults`) with no
 * invoke mock at all lives in
 * `tests/unit/composables/useProxyUpstreamSetting-discovery.test.ts`.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// `vi.hoisted` because the `vi.mock` factory below is hoisted above
// this file's own top-level bindings — a plain `const` here would be a
// temporal-dead-zone reference from inside the (also hoisted) factory.
const { DEFAULT_UPSTREAM } = vi.hoisted(() => ({ DEFAULT_UPSTREAM: 'ws://127.0.0.1:1242' }));

let fakeStored: string | null = null;
let fakeEnvOverride: string | null = null;
// mDNS discovery results (ledger row 944) `discover_upstreams` would
// return — empty by default so the pre-existing `load()`/`save()`
// coverage above is unaffected by the auto-discovery this composable
// now runs whenever neither `fakeStored` nor `fakeEnvOverride` is set;
// discovery-specific behavior is covered by its own `describe` blocks
// below, which set this per-test.
let fakeDiscovered: Array<{ url: string; instanceName: string }> = [];

const invokeMock = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
  if (cmd === 'get_proxy_upstream_setting') {
    const envOverrideActive = fakeEnvOverride !== null;
    return {
      effective: envOverrideActive ? fakeEnvOverride : (fakeStored ?? DEFAULT_UPSTREAM),
      stored: fakeStored,
      envOverrideActive,
      defaultUpstream: DEFAULT_UPSTREAM,
    };
  }
  if (cmd === 'set_proxy_upstream_setting') {
    const value = String(args?.value ?? '');
    if (!(value.startsWith('ws://') || value.startsWith('wss://'))) {
      throw new Error('proxy upstream URI must start with ws:// or wss://');
    }
    fakeStored = value;
    return null;
  }
  if (cmd === 'discover_upstreams') {
    return fakeDiscovered;
  }
  throw new Error(`unexpected invoke command: ${cmd}`);
});

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('../../src/config/env', () => ({
  IS_TAURI: true,
  API_BASE_URL: 'http://localhost:8764',
  KATAGO_WS_URL: DEFAULT_UPSTREAM,
}));

import { useProxyUpstreamSetting } from '../../src/composables/useProxyUpstreamSetting';

beforeEach(() => {
  fakeStored = null;
  fakeEnvOverride = null;
  fakeDiscovered = [];
  invokeMock.mockClear();
});

describe('useProxyUpstreamSetting — isTauri', () => {
  it('reports isTauri true under the mocked Tauri env', () => {
    const setting = useProxyUpstreamSetting();
    expect(setting.isTauri).toBe(true);
  });
});

describe('useProxyUpstreamSetting — load()', () => {
  it('fetches the current setting and seeds the draft from `stored`', async () => {
    fakeStored = 'ws://example.test:1242';
    const setting = useProxyUpstreamSetting();
    await setting.load();

    expect(invokeMock).toHaveBeenCalledWith('get_proxy_upstream_setting');
    expect(setting.info.value?.effective).toBe('ws://example.test:1242');
    expect(setting.info.value?.stored).toBe('ws://example.test:1242');
    expect(setting.draft.value).toBe('ws://example.test:1242');
  });

  it('seeds an empty draft when nothing is stored yet (fresh install)', async () => {
    const setting = useProxyUpstreamSetting();
    await setting.load();

    expect(setting.info.value?.stored).toBeNull();
    expect(setting.info.value?.effective).toBe(DEFAULT_UPSTREAM);
    expect(setting.draft.value).toBe('');
  });

  it('surfaces envOverrideActive when the env var is set', async () => {
    fakeEnvOverride = 'ws://env-override.test:9999';
    const setting = useProxyUpstreamSetting();
    await setting.load();

    expect(setting.info.value?.envOverrideActive).toBe(true);
    expect(setting.info.value?.effective).toBe('ws://env-override.test:9999');
  });

  it('toggles loading true then false around the invoke call', async () => {
    const setting = useProxyUpstreamSetting();
    expect(setting.loading.value).toBe(false);
    const promise = setting.load();
    expect(setting.loading.value).toBe(true);
    await promise;
    expect(setting.loading.value).toBe(false);
  });
});

describe('useProxyUpstreamSetting — save() validation', () => {
  it('rejects an empty draft without invoking set_proxy_upstream_setting', async () => {
    const setting = useProxyUpstreamSetting();
    setting.draft.value = '';
    const result = await setting.save();

    expect(result).toEqual({ ok: false, errorKey: 'proxyUpstream.error.empty' });
    expect(invokeMock).not.toHaveBeenCalledWith('set_proxy_upstream_setting', expect.anything());
  });

  it('rejects a non-ws(s) scheme without invoking set_proxy_upstream_setting', async () => {
    const setting = useProxyUpstreamSetting();
    setting.draft.value = 'http://example.test:1242';
    const result = await setting.save();

    expect(result).toEqual({ ok: false, errorKey: 'proxyUpstream.error.scheme' });
    expect(invokeMock).not.toHaveBeenCalledWith('set_proxy_upstream_setting', expect.anything());
  });

  it('rejects a malformed URL without invoking set_proxy_upstream_setting', async () => {
    const setting = useProxyUpstreamSetting();
    setting.draft.value = 'not a uri at all';
    const result = await setting.save();

    expect(result).toEqual({ ok: false, errorKey: 'proxyUpstream.error.malformed' });
    expect(invokeMock).not.toHaveBeenCalledWith('set_proxy_upstream_setting', expect.anything());
  });
});

describe('useProxyUpstreamSetting — save() persistence', () => {
  it('persists a valid draft and re-loads to reflect it', async () => {
    const setting = useProxyUpstreamSetting();
    setting.draft.value = 'ws://saved.example:1242';
    const result = await setting.save();

    expect(result).toEqual({ ok: true });
    expect(invokeMock).toHaveBeenCalledWith('set_proxy_upstream_setting', { value: 'ws://saved.example:1242' });
    expect(fakeStored).toBe('ws://saved.example:1242');
    expect(setting.info.value?.stored).toBe('ws://saved.example:1242');
  });

  it('trims whitespace before persisting', async () => {
    const setting = useProxyUpstreamSetting();
    setting.draft.value = '  ws://trimmed.example:1242  ';
    await setting.save();

    expect(fakeStored).toBe('ws://trimmed.example:1242');
  });

  it('surfaces a save-failed error when the invoke call rejects', async () => {
    fakeStored = null;
    invokeMock.mockImplementationOnce(async (cmd: string) => {
      if (cmd === 'set_proxy_upstream_setting') throw new Error('disk full');
      throw new Error(`unexpected command: ${cmd}`);
    });
    const setting = useProxyUpstreamSetting();
    setting.draft.value = 'ws://will-fail.example:1242';
    const result = await setting.save();

    expect(result).toEqual({ ok: false, errorKey: 'proxyUpstream.error.saveFailed' });
  });
});

describe('useProxyUpstreamSetting — mDNS discovery auto-run on load()', () => {
  it('does not discover when a value is already stored', async () => {
    fakeStored = 'ws://already-set.example:1242';
    fakeDiscovered = [{ url: 'ws://should-not-be-seen.example:1242', instanceName: 'ignored-box' }];
    const setting = useProxyUpstreamSetting();
    await setting.load();

    expect(invokeMock).not.toHaveBeenCalledWith('discover_upstreams');
    expect(setting.discoveryState.value).toEqual({ kind: 'idle' });
    expect(setting.draft.value).toBe('ws://already-set.example:1242');
  });

  it('does not discover when the env override is active', async () => {
    fakeEnvOverride = 'ws://env.example:1242';
    fakeDiscovered = [{ url: 'ws://should-not-be-seen.example:1242', instanceName: 'ignored-box' }];
    const setting = useProxyUpstreamSetting();
    await setting.load();

    expect(invokeMock).not.toHaveBeenCalledWith('discover_upstreams');
    expect(setting.discoveryState.value).toEqual({ kind: 'idle' });
  });

  it('zero results: discoveryState becomes none, draft stays empty, no error', async () => {
    fakeDiscovered = [];
    const setting = useProxyUpstreamSetting();
    await setting.load();

    expect(invokeMock).toHaveBeenCalledWith('discover_upstreams');
    expect(setting.discoveryState.value).toEqual({ kind: 'none' });
    expect(setting.draft.value).toBe('');
  });

  it('exactly one result: discoveryState becomes single and the draft is prefilled with its url', async () => {
    fakeDiscovered = [{ url: 'ws://found.example:1242', instanceName: 'living-room-box' }];
    const setting = useProxyUpstreamSetting();
    await setting.load();

    expect(setting.discoveryState.value).toEqual({
      kind: 'single',
      upstream: { url: 'ws://found.example:1242', instanceName: 'living-room-box' },
    });
    expect(setting.draft.value).toBe('ws://found.example:1242');
  });

  it('multiple results: discoveryState becomes multiple and the draft is left untouched', async () => {
    fakeDiscovered = [
      { url: 'ws://box-one.example:1242', instanceName: 'box-one' },
      { url: 'ws://box-two.example:1242', instanceName: 'box-two' },
    ];
    const setting = useProxyUpstreamSetting();
    await setting.load();

    expect(setting.discoveryState.value).toEqual({ kind: 'multiple', upstreams: fakeDiscovered });
    expect(setting.draft.value).toBe('');
  });
});

describe('useProxyUpstreamSetting — discover() manual "scan again"', () => {
  it('can be re-run unconditionally even when a value is already stored', async () => {
    fakeStored = 'ws://already-set.example:1242';
    const setting = useProxyUpstreamSetting();
    await setting.load();
    expect(invokeMock).not.toHaveBeenCalledWith('discover_upstreams');

    fakeDiscovered = [{ url: 'ws://rescanned.example:1242', instanceName: 'rescanned-box' }];
    await setting.discover();

    expect(invokeMock).toHaveBeenCalledWith('discover_upstreams');
    expect(setting.discoveryState.value).toEqual({
      kind: 'single',
      upstream: { url: 'ws://rescanned.example:1242', instanceName: 'rescanned-box' },
    });
  });

  it('reflects discovering:true while the invoke is in flight', async () => {
    // The deferred promise is constructed (and `resolveInvoke` bound)
    // BEFORE `discover()` runs, so resolving it is never racing the
    // dynamic `await import('@tauri-apps/api/core')` inside `discover()`
    // — that import (and the `invoke()` call it gates) only reaches
    // `pending` on a later microtask, but `pending`'s own resolution
    // state doesn't depend on being awaited first.
    let resolveInvoke!: (v: unknown) => void;
    const pending = new Promise<unknown>((resolve) => { resolveInvoke = resolve; });
    invokeMock.mockImplementationOnce(() => pending);
    const setting = useProxyUpstreamSetting();

    const promise = setting.discover();
    expect(setting.discoveryState.value).toEqual({ kind: 'discovering' });
    resolveInvoke([]);
    await promise;

    expect(setting.discoveryState.value).toEqual({ kind: 'none' });
  });

  it('degrades to none when the invoke call itself rejects', async () => {
    invokeMock.mockImplementationOnce(async () => { throw new Error('command not registered'); });
    const setting = useProxyUpstreamSetting();
    await setting.discover();

    expect(setting.discoveryState.value).toEqual({ kind: 'none' });
  });
});

describe('useProxyUpstreamSetting — a successful save() clears a stale discovery state', () => {
  it('clears discoveryState back to idle after persisting, even if it was multiple beforehand', async () => {
    fakeDiscovered = [
      { url: 'ws://box-one.example:1242', instanceName: 'box-one' },
      { url: 'ws://box-two.example:1242', instanceName: 'box-two' },
    ];
    const setting = useProxyUpstreamSetting();
    await setting.load();
    expect(setting.discoveryState.value.kind).toBe('multiple');

    setting.draft.value = 'ws://typed-instead.example:1242';
    const result = await setting.save();

    expect(result).toEqual({ ok: true });
    expect(setting.discoveryState.value).toEqual({ kind: 'idle' });
  });
});
