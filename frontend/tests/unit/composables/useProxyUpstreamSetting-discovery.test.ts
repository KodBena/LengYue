/**
 * tests/unit/composables/useProxyUpstreamSetting-discovery.test.ts
 *
 * Pure-function coverage for the mDNS-discovery decision half of
 * `useProxyUpstreamSetting` (ledger row 944, `discover_upstreams`):
 * `shouldAutoDiscover` (given a loaded `ProxyUpstreamInfo`, should
 * `load()` auto-run a discovery browse?) and `classifyDiscoveryResults`
 * (given raw discovery results, which of the three outcomes the
 * ratified contract names applies?). No Tauri `invoke` mock here by
 * design — these are ordinary functions of their inputs, asserted
 * directly. The composable-shell coverage (the actual `invoke` calls
 * these functions gate/interpret) lives in
 * `tests/integration/useProxyUpstreamSetting.test.ts`.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  shouldAutoDiscover,
  classifyDiscoveryResults,
  type ProxyUpstreamInfo,
  type DiscoveredUpstream,
} from '../../../src/composables/useProxyUpstreamSetting';

function info(overrides: Partial<ProxyUpstreamInfo>): ProxyUpstreamInfo {
  return {
    effective: 'ws://127.0.0.1:1242',
    stored: null,
    envOverrideActive: false,
    defaultUpstream: 'ws://127.0.0.1:1242',
    ...overrides,
  };
}

describe('shouldAutoDiscover', () => {
  it('is false when info is null (load() has not succeeded yet)', () => {
    expect(shouldAutoDiscover(null)).toBe(false);
  });

  it('is false when the env override is active, regardless of stored', () => {
    expect(shouldAutoDiscover(info({ envOverrideActive: true, stored: null }))).toBe(false);
    expect(shouldAutoDiscover(info({ envOverrideActive: true, stored: 'ws://x:1' }))).toBe(false);
  });

  it('is false when a value is already stored, even without an env override', () => {
    expect(shouldAutoDiscover(info({ envOverrideActive: false, stored: 'ws://x:1' }))).toBe(false);
  });

  it('is true only when neither the env override nor a stored value exists', () => {
    expect(shouldAutoDiscover(info({ envOverrideActive: false, stored: null }))).toBe(true);
  });
});

describe('classifyDiscoveryResults', () => {
  it('classifies zero results as none', () => {
    expect(classifyDiscoveryResults([])).toEqual({ kind: 'none' });
  });

  it('classifies exactly one result as single, carrying the discovered upstream', () => {
    const only: DiscoveredUpstream = { url: 'ws://only.example:1242', instanceName: 'only-box' };
    expect(classifyDiscoveryResults([only])).toEqual({ kind: 'single', upstream: only });
  });

  it('classifies more than one result as multiple, carrying every discovered upstream', () => {
    const first: DiscoveredUpstream = { url: 'ws://a.example:1242', instanceName: 'box-a' };
    const second: DiscoveredUpstream = { url: 'ws://b.example:1242', instanceName: 'box-b' };
    expect(classifyDiscoveryResults([first, second])).toEqual({ kind: 'multiple', upstreams: [first, second] });
  });

  it('classifies three-plus results as multiple too (not just exactly two)', () => {
    const results: DiscoveredUpstream[] = [
      { url: 'ws://a.example:1242', instanceName: 'box-a' },
      { url: 'ws://b.example:1242', instanceName: 'box-b' },
      { url: 'ws://c.example:1242', instanceName: 'box-c' },
    ];
    expect(classifyDiscoveryResults(results)).toEqual({ kind: 'multiple', upstreams: results });
  });
});
