/**
 * tests/unit/lib/ws-url.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/lib/ws-url.ts` — the shared
 * validator `useEngineUriEditor` (the toolbar URI editor) applies
 * before committing a new `engine.katago.url`.
 *
 * No DOM, no fakes, no Vue reactivity.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { validateEngineUri } from '../../../src/lib/ws-url';

describe('validateEngineUri', () => {
  it('accepts a well-formed ws:// URI', () => {
    expect(validateEngineUri('ws://127.0.0.1:41948')).toEqual({ ok: true });
  });

  it('accepts a well-formed wss:// URI', () => {
    expect(validateEngineUri('wss://engine.example.com:443/path')).toEqual({ ok: true });
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateEngineUri('  ws://127.0.0.1:41948  ')).toEqual({ ok: true });
  });

  it('rejects an empty string', () => {
    const result = validateEngineUri('');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errorKey).toBe('engineUri.error.empty');
  });

  it('rejects a whitespace-only string', () => {
    const result = validateEngineUri('   ');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errorKey).toBe('engineUri.error.empty');
  });

  it('rejects an unparseable string', () => {
    const result = validateEngineUri('not a uri at all');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errorKey).toBe('engineUri.error.malformed');
  });

  it('rejects a non-ws(s) scheme', () => {
    const result = validateEngineUri('http://127.0.0.1:41948');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errorKey).toBe('engineUri.error.scheme');
  });

  it('rejects file:// URIs', () => {
    const result = validateEngineUri('file:///etc/passwd');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errorKey).toBe('engineUri.error.scheme');
  });
});
