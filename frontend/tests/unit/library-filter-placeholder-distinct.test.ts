/**
 * tests/unit/library-filter-placeholder-distinct.test.ts
 *
 * Regression guard for menus-ui-audit finding M27 (report.md, ledger
 * row 1251): two of Library's three player filters ("Player (any
 * color)" and "White") shared the identical placeholder "e.g. Cho",
 * defeating the point of a per-field example. Each of the three
 * filters must show a distinct example name.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'src/components/library/LibraryTab.vue'), 'utf-8');

describe('LibraryTab.vue — the three player filters carry distinct example placeholders (M27)', () => {
  it('every placeholder="e.g. ..." string on a LibraryPlayerFilter is unique', () => {
    const matches = [...SRC.matchAll(/<LibraryPlayerFilter[\s\S]*?\/>/g)].map((m) => m[0]);
    expect(matches.length).toBe(3);
    const placeholders = matches.map((block) => /placeholder="([^"]+)"/.exec(block)?.[1]);
    expect(placeholders.every((p) => typeof p === 'string' && p.length > 0)).toBe(true);
    expect(new Set(placeholders).size).toBe(placeholders.length);
  });
});
