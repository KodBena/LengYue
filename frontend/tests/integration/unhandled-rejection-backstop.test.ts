/**
 * tests/integration/unhandled-rejection-backstop.test.ts
 *
 * Tier-3 (integration) coverage for the window `unhandledrejection`
 * backstop (`src/lib/unhandled-rejection-backstop.ts`). The backstop's
 * de-dup logic is driven against the REAL store (`pushSystemMessage` →
 * `store.engine.messages`) and the REAL i18n catalogs (`i18n.global.t`),
 * with only the developer-surface `console.error` sink replaced by a spy
 * — the same wiring `main.ts` installs, minus the `window` listener
 * registration (the item scopes out full-window e2e). Firing a synthetic
 * rejection means calling `handle(reason)` directly, which is exactly the
 * function `main.ts`'s listener delegates to (`backstop.handle(event.reason)`).
 *
 * The assertions pin the BEHAVIOUR the item commissions: every rejection
 * reaches the developer surface (level 5); the first occurrence of each
 * distinct reason reaches the user surface (level 4); a storm of the SAME
 * reason surfaces once; and an unbounded stream of DISTINCT reasons is
 * capped so it cannot wipe the 50-message system log (the enrichment-merge
 * latch precedent, generalized). Per tests/CLAUDE.md's i18n note, the
 * system-message assertions pin the KEY's interpolated content
 * (the reason text / the cap count), not an exact translated string.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createRejectionBackstop } from '../../src/lib/unhandled-rejection-backstop';
import { store, pushSystemMessage, clearSystemMessages } from '../../src/store';
import { i18n } from '../../src/i18n';

/**
 * Build a backstop wired exactly as `main.ts` does — real store push,
 * real i18n translate — but with a spy console sink so we can assert on
 * the level-5 surface without polluting test output. `maxDistinctSurfaced`
 * is overridable so the cap test doesn't have to fire eight real reasons.
 */
function makeBackstop(maxDistinctSurfaced?: number) {
  const logError = vi.fn();
  const backstop = createRejectionBackstop({
    pushSystemMessage,
    translate: (key, params) => i18n.global.t(key, params ?? {}),
    logError,
    maxDistinctSurfaced,
  });
  return { backstop, logError };
}

/** The reactive system-log entries, newest first (pushSystemMessage unshifts). */
function logTexts(): string[] {
  return store.engine.messages.map((m) => m.text);
}

beforeEach(() => {
  // The system log is shared reactive state; isolate each test.
  clearSystemMessages();
});

describe('unhandled-rejection backstop', () => {
  it('surfaces a single rejection to both the developer and user surfaces', () => {
    const { backstop, logError } = makeBackstop();

    backstop.handle(new Error('boom'));

    // Level 5 — developer surface, the raw reason.
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0]).toContain('[unhandledrejection] Unhandled promise rejection:');

    // Level 4 — user surface, one system-log entry carrying the message.
    expect(store.engine.messages).toHaveLength(1);
    expect(store.engine.messages[0].type).toBe('error');
    expect(store.engine.messages[0].text).toContain('boom');
  });

  it('handles a non-Error reason via String() without throwing', () => {
    const { backstop, logError } = makeBackstop();

    expect(() => backstop.handle('plain string reason')).not.toThrow();
    expect(() => backstop.handle({ code: 42 })).not.toThrow();

    // Both reach the developer surface; both surface to the user once.
    expect(logError).toHaveBeenCalledTimes(2);
    expect(store.engine.messages).toHaveLength(2);
    expect(logTexts().some((t) => t.includes('plain string reason'))).toBe(true);
    // A plain object stringifies to [object Object]; the point is it does
    // not throw and still produces a user-surface entry.
    expect(logTexts().some((t) => t.includes('[object Object]'))).toBe(true);
  });

  it('de-duplicates a storm of the SAME reason: one user-surface entry, every dev-surface log', () => {
    const { backstop, logError } = makeBackstop();

    for (let i = 0; i < 100; i++) {
      backstop.handle(new Error('repeated failure'));
    }

    // Level 5 — every occurrence logs (the developer never loses a rejection).
    expect(logError).toHaveBeenCalledTimes(100);
    // Level 4 — the storm collapses to a single system-log entry, so the
    // 50-slot log is not wiped by one looping rejection.
    expect(store.engine.messages).toHaveLength(1);
    expect(store.engine.messages[0].text).toContain('repeated failure');
  });

  it('distinct Error instances with the same message are one failure (keyed on message)', () => {
    const { backstop } = makeBackstop();

    backstop.handle(new Error('same message'));
    backstop.handle(new Error('same message')); // different instance, same text

    expect(store.engine.messages).toHaveLength(1);
  });

  it('caps an unbounded stream of DISTINCT reasons so the log cannot be wiped', () => {
    // Cap of 3 keeps the test small; the production default is 8.
    const { backstop, logError } = makeBackstop(3);

    for (let i = 0; i < 50; i++) {
      backstop.handle(new Error(`distinct failure ${i}`));
    }

    // Level 5 — every distinct rejection still reaches the console.
    expect(logError).toHaveBeenCalledTimes(50);

    // Level 4 — exactly `cap` distinct reasons surface, plus ONE storm
    // notice once the cap is crossed: 3 + 1 = 4 entries, well under the
    // 50-message log cap regardless of how many distinct reasons arrive.
    expect(store.engine.messages).toHaveLength(4);

    // The storm notice carries the cap count and is the newest entry
    // (unshift puts it at index 0 after the 3 surfaced reasons).
    const stormNotice = store.engine.messages[0];
    expect(stormNotice.type).toBe('error');
    expect(stormNotice.text).toContain('3');
    // The storm notice fires exactly once, not on every subsequent reason.
    const stormNotices = logTexts().filter((t) => t.includes('suppressed'));
    expect(stormNotices).toHaveLength(1);
  });

  it('reset() clears the latch so a previously-surfaced reason surfaces again', () => {
    const { backstop } = makeBackstop();

    backstop.handle(new Error('transient'));
    expect(store.engine.messages).toHaveLength(1);

    // A repeat is de-duplicated...
    backstop.handle(new Error('transient'));
    expect(store.engine.messages).toHaveLength(1);

    // ...until the latch is reset (the analog of the enrichment-merge
    // latch's purgeAll clearing with the workspace).
    backstop.reset();
    backstop.handle(new Error('transient'));
    expect(store.engine.messages).toHaveLength(2);
  });

  it('a pushSystemMessage failure does not escape the handler (no compounding rejection)', () => {
    const logError = vi.fn();
    const throwingPush = vi.fn(() => {
      throw new Error('store write failed');
    });
    const backstop = createRejectionBackstop({
      pushSystemMessage: throwingPush,
      translate: (key, params) => i18n.global.t(key, params ?? {}),
      logError,
    });

    // The handler must not re-throw — a throw here would itself become an
    // unhandled error inside the listener, compounding the failure.
    expect(() => backstop.handle(new Error('original'))).not.toThrow();
    // The push failure is itself logged to the developer surface.
    expect(logError.mock.calls.some((c) => c[0] === '[unhandledrejection] pushSystemMessage failed:')).toBe(true);
  });
});
