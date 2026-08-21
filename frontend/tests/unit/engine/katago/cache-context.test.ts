/**
 * tests/unit/engine/katago/cache-context.test.ts
 *
 * Tier-1 tests for `translateEngineCacheContext` — the NN-cache-context
 * feature's translate-and-validate seam
 * (`src/engine/katago/cache-context.ts`). Pure function; no fakes, no
 * DOM.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { translateEngineCacheContext } from '../../../../src/engine/katago/cache-context';

describe('translateEngineCacheContext', () => {
  it('composes username.context on a legal raw context', () => {
    const result = translateEngineCacheContext('card-5', 'alice');
    expect(result).toEqual({ kind: 'ok', value: 'alice.card-5' });
  });

  it('accepts every character in the legal alphabet (letters, digits, ., _, -)', () => {
    const result = translateEngineCacheContext('Card_5.beta-Test9', 'alice');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.value).toBe('alice.Card_5.beta-Test9');
  });

  it('refuses when no username is available (fail loud, no fallback identity)', () => {
    const result = translateEngineCacheContext('card-5', null);
    expect(result.kind).toBe('error');
  });

  it('refuses an empty username the same as no username', () => {
    const result = translateEngineCacheContext('card-5', '');
    expect(result.kind).toBe('error');
  });

  it('refuses an empty raw context', () => {
    const result = translateEngineCacheContext('', 'alice');
    expect(result.kind).toBe('error');
  });

  it('refuses a whitespace-only raw context', () => {
    const result = translateEngineCacheContext('   ', 'alice');
    expect(result.kind).toBe('error');
  });

  it('refuses illegal characters (space)', () => {
    const result = translateEngineCacheContext('card five', 'alice');
    expect(result.kind).toBe('error');
  });

  it('refuses illegal characters (slash — path-traversal-shaped input)', () => {
    const result = translateEngineCacheContext('../etc/passwd', 'alice');
    expect(result.kind).toBe('error');
  });

  it('refuses illegal characters (unicode)', () => {
    const result = translateEngineCacheContext('カード5', 'alice');
    expect(result.kind).toBe('error');
  });

  it('refuses a composed context over 128 characters', () => {
    const longRaw = 'x'.repeat(128); // 'alice.' + 128 x's = 134 chars
    const result = translateEngineCacheContext(longRaw, 'alice');
    expect(result.kind).toBe('error');
  });

  it('accepts a composed context at exactly 128 characters', () => {
    // 'alice.' is 6 chars; 122 more brings the total to exactly 128.
    const raw = 'x'.repeat(122);
    const result = translateEngineCacheContext(raw, 'alice');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.value.length).toBe(128);
  });

  it('never rewrites/truncates — a refused input produces no ok value under a mangled name', () => {
    const result = translateEngineCacheContext('bad name!', 'alice');
    expect(result.kind).toBe('error');
    expect((result as { kind: 'error' }).kind).toBe('error');
  });
});
