/**
 * tests/unit/i18n-messages-compile.test.ts
 *
 * Tripwire: every message in every locale catalog must COMPILE under
 * vue-i18n's message format. vue-i18n treats `{...}` in a message as an
 * interpolation placeholder, so a literal brace (e.g. a JSON example
 * embedded in a hint string) is a compile-time SyntaxError — and it
 * surfaces only at RUNTIME, on first t() of that key, as a fatal
 * "Message compilation error" (witnessed live 2026-08-06: the
 * perQueryOverrides.hint JSON example crashed the app at login).
 * Literal braces must use the i18n literal syntax: {'{'} and {'}'}.
 *
 * The suite otherwise never t()'s most keys, so without this walk the
 * class is invisible to CI. This test t()'s EVERY key in EVERY locale,
 * which forces lazy compilation of each message.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { createI18n } from 'vue-i18n';
import en from '../../src/locales/en.json';

const catalogs: Record<string, Record<string, unknown>> = { en };

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null
      ? flattenKeys(v as Record<string, unknown>, key)
      : [key];
  });
}

describe('i18n message compilation (all locales, all keys)', () => {
  for (const [locale, messages] of Object.entries(catalogs)) {
    it(`every '${locale}' message compiles`, () => {
      const i18n = createI18n({
        legacy: false,
        locale,
        messages: { [locale]: messages } as never,
        missingWarn: false,
        fallbackWarn: false,
      });
      const failures: string[] = [];
      for (const key of flattenKeys(messages)) {
        try {
          i18n.global.t(key);
        } catch (e) {
          failures.push(`${key}: ${(e as Error).message}`);
        }
      }
      expect(failures).toEqual([]);
    });
  }
});
