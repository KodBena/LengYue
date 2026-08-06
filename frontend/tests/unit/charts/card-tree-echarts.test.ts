/**
 * tests/unit/charts/card-tree-echarts.test.ts
 *
 * Tier 1 (pure logic): `toEChartsNode`'s `card` branch. Asserts the
 * on-canvas label renders the card's per-user `displayOrdinal` — not
 * the raw PK `cardId` — while `name` itself stays `Card <id>` for
 * tooltip/keying consumers (Defect 8, the maintainer's original
 * complaint that card-tree annotations render the full "Card N"
 * string on-canvas for every node simultaneously; superseded by the
 * per-user-id-enumeration design closing the *further* leak that a
 * bare `cardId` label exposes a global-sequence position — see
 * `.claude/dispatch-reports/per-user-id-enumeration-design.md`,
 * Decision 5's note that this test's *shape* (a `/^\d+$/`-matching
 * label) must not silently keep pinning the leaked raw-PK *value*).
 * Red without the branch's `label.formatter`: ECharts' default label
 * render falls back to `name` verbatim, so a formatter-less node
 * would show "Card N" rather than a bare number.
 *
 * `card-tree-echarts.ts` reads chrome-anchor colours via `themeColor()`
 * (`itemStyle.color` for an 'active'-role node), which throws loudly
 * per ADR-0002 when the backing CSS custom property is empty — jsdom
 * (the suite's global test environment) doesn't load `theme.css`. Stub
 * only the two properties the 'active'-role branch under test reads,
 * the same minimal-stub shape `tests/integration/render-count/
 * jsdom-stubs.ts` uses for the same underlying reason.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { toEChartsNode } from '../../../src/components/charts/card-tree-echarts';
import type { RenderCardNode } from '../../../src/composables/cards/useCardTreeProjection';
import type { CardId, CardDisplayOrdinal, CardPublicId, ContentHash, ReviewCard } from '../../../src/types';

function cardNode(cardId: number): RenderCardNode {
  return {
    kind: 'card',
    cardId: cardId as CardId, // test fixture — same brand-mint pattern as other test files
    role: 'active',
    children: [],
  };
}

/**
 * Minimal `ReviewCard` fixture. `displayOrdinal` is deliberately set
 * to a value distinct from `cardId` so a test asserting on the
 * rendered label proves it's reading `displayOrdinal`, not silently
 * passing because the two happen to coincide.
 */
function reviewCard(cardId: number, displayOrdinal: number): ReviewCard {
  return {
    id: cardId as CardId,
    displayOrdinal: displayOrdinal as CardDisplayOrdinal,
    publicId: `test-public-id-${cardId}` as CardPublicId,
    canonicalContent: '(;FF[4])',
    contentHash: 'deadbeef' as ContentHash,
    numMoves: 1,
    model: { alpha: 3, beta: 3, t: 1 },
    lastReviewedAt: null,
    numReviews: 0,
    suspended: false,
    defaultVisits: 1000,
    gamma: 0.9,
    tags: [],
  };
}

const THEME_STUB_VARS = ['--accent-primary', '--accent-primary-canonical', '--text-0'];

describe('toEChartsNode — card branch (Defect 8)', () => {
  beforeAll(() => {
    for (const name of THEME_STUB_VARS) {
      document.documentElement.style.setProperty(name, '#4aaef0');
    }
  });

  afterAll(() => {
    for (const name of THEME_STUB_VARS) {
      document.documentElement.style.removeProperty(name);
    }
  });

  it('keeps `name` as "Card <id>" but renders the per-user displayOrdinal on-canvas, not the raw PK', () => {
    // cardId (a GoGoD-import-scale PK) vs displayOrdinal (a small,
    // per-user ordinal) are deliberately far apart so the assertion
    // can't pass by coincidence.
    const cards = new Map([[3179 as CardId, reviewCard(3179, 4)]]);
    const node = toEChartsNode(cardNode(3179), null, cards);

    expect(node.name).toBe('Card 3179');

    const formatter = node.label?.formatter;
    expect(typeof formatter).toBe('function');
    const rendered = (formatter as () => string)();
    expect(rendered).toMatch(/^\d+$/);
    expect(rendered).toBe('4');
  });

  it('falls back to an ellipsis when the card has not hydrated into the cards map yet', () => {
    const node = toEChartsNode(cardNode(3179));
    const formatter = node.label?.formatter;
    const rendered = (formatter as () => string)();
    expect(rendered).toBe('…');
  });

  it('label.show is true for a non-suspended card (label actually renders)', () => {
    const cards = new Map([[42 as CardId, reviewCard(42, 1)]]);
    const node = toEChartsNode(cardNode(42), null, cards);
    expect(node.label?.show).toBe(true);
  });
});
