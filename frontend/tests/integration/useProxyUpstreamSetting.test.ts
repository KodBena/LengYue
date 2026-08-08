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
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// `vi.hoisted` because the `vi.mock` factory below is hoisted above
// this file's own top-level bindings — a plain `const` here would be a
// temporal-dead-zone reference from inside the (also hoisted) factory.
const { DEFAULT_UPSTREAM } = vi.hoisted(() => ({ DEFAULT_UPSTREAM: 'ws://127.0.0.1:1242' }));

let fakeStored: string | null = null;
let fakeEnvOverride: string | null = null;

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
