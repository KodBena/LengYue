/**
 * tests/integration/useProxyUpstreamSetting-inert.test.ts
 *
 * Commission constraint 5 ("Non-Tauri deployments: zero behavioral
 * change. The stored-setting machinery must be inert (not just
 * hidden) outside Tauri"). Unlike `useProxyUpstreamSetting.test.ts`,
 * this file does NOT mock `config/env` — jsdom never sets
 * `window.__LENGYUE_PROXY_PORT__`, so `IS_TAURI` resolves to its real,
 * false value here, exercising the actual non-Tauri code path rather
 * than a simulated one.
 *
 * `@tauri-apps/api/core`'s `invoke` is still mocked (spied, never
 * given a real implementation) so the assertion "invoke is never
 * called" is meaningful — if it were, the mock would throw, catching a
 * regression immediately rather than the real `invoke` failing with an
 * unrelated "no Tauri runtime" error.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const invokeMock = vi.fn(() => {
  throw new Error('invoke must never be called outside Tauri');
});
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import { IS_TAURI } from '../../src/config/env';
import { useProxyUpstreamSetting } from '../../src/composables/useProxyUpstreamSetting';

beforeEach(() => {
  invokeMock.mockClear();
});

describe('useProxyUpstreamSetting — inert outside Tauri', () => {
  it('IS_TAURI resolves false in the plain jsdom environment (sanity check for the rest of this file)', () => {
    expect(IS_TAURI).toBe(false);
  });

  it('reports isTauri false', () => {
    const setting = useProxyUpstreamSetting();
    expect(setting.isTauri).toBe(false);
  });

  it('load() no-ops without ever calling invoke', async () => {
    const setting = useProxyUpstreamSetting();
    await setting.load();

    expect(invokeMock).not.toHaveBeenCalled();
    expect(setting.info.value).toBeNull();
    expect(setting.loading.value).toBe(false);
  });

  it('save() no-ops (returns a discriminated failure) without ever calling invoke, even with a valid-shaped draft', async () => {
    const setting = useProxyUpstreamSetting();
    setting.draft.value = 'ws://would-be-valid.example:1242';
    const result = await setting.save();

    expect(result.ok).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
