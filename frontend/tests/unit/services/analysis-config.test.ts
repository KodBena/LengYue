/**
 * tests/unit/services/analysis-config.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/services/analysis-config.ts::hashConfig`
 * — the deterministic DJB2-shaped hash function used to key
 * KataGo-analysis cache entries.
 *
 * `compileAnalysisConfig` is also exported from this module but is
 * not pure (it reads `store.profile.settings.engine.katago.analysis_env`
 * and the qEUBO-overlay computed). Its testing belongs at the
 * composable-integration tier — covered when a future PR adds tests
 * for `useQeubo`-driven analysis-config behaviour. `hashConfig` is
 * a closed-form pure function over its argument and is the
 * appropriate Tier-1 target.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { hashConfig } from '../../../src/services/analysis-config';

describe('hashConfig', () => {
  it('returns "default" when given undefined or null', () => {
    expect(hashConfig(undefined)).toBe('default');
    expect(hashConfig(null)).toBe('default');
  });

  it('produces a hex string for a non-empty config', () => {
    const config = { bindings: { delta_fn: 'foo' }, parameters: { x: 1 } };
    const result = hashConfig(config);
    expect(result).toMatch(/^[0-9a-f]+$/);
    expect(result).not.toBe('default');
  });

  it('is deterministic — equal input produces equal hash', () => {
    const config = { bindings: { delta_fn: 'foo' }, parameters: { x: 1 } };
    expect(hashConfig(config)).toBe(hashConfig(config));
  });

  it('produces different hashes for inputs that JSON.stringify to different strings', () => {
    const a = { bindings: { delta_fn: 'foo' } };
    const b = { bindings: { delta_fn: 'bar' } };
    expect(hashConfig(a)).not.toBe(hashConfig(b));
  });

  it('treats two configs with same JSON.stringify output as equal', () => {
    // Object literals with insertion-order keys produce stable
    // JSON.stringify output. The hash respects that. Tests with a
    // re-constructed-but-equivalent literal verify the function is
    // pure over its input shape, not over reference identity.
    const a = { bindings: { delta_fn: 'foo' }, parameters: { x: 1 } };
    const b = { bindings: { delta_fn: 'foo' }, parameters: { x: 1 } };
    expect(hashConfig(a)).toBe(hashConfig(b));
  });
});
