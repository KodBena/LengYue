/**
 * tests/unit/charts/card-tree-echarts.test.ts
 *
 * Tier 1 (pure logic): `toEChartsNode`'s `card` branch. Asserts the
 * on-canvas label renders the bare card id (Defect 8 — the maintainer's
 * complaint that card-tree annotations render the full "Card N" string
 * on-canvas for every node simultaneously), while `name` itself stays
 * `Card N` for tooltip/keying consumers. Red without the branch's
 * `label.formatter`: ECharts' default label render falls back to `name`
 * verbatim, so a formatter-less node would show "Card N" rather than "N".
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
import type { CardId } from '../../../src/types';

function cardNode(cardId: number): RenderCardNode {
  return {
    kind: 'card',
    cardId: cardId as CardId, // test fixture — same brand-mint pattern as other test files
    role: 'active',
    children: [],
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

  it('keeps `name` as "Card N" but renders a bare-number on-canvas label', () => {
    const node = toEChartsNode(cardNode(3179));

    expect(node.name).toBe('Card 3179');

    const formatter = node.label?.formatter;
    expect(typeof formatter).toBe('function');
    const rendered = (formatter as () => string)();
    expect(rendered).toMatch(/^\d+$/);
    expect(rendered).toBe('3179');
  });

  it('label.show is true for a non-suspended card (label actually renders)', () => {
    const node = toEChartsNode(cardNode(42));
    expect(node.label?.show).toBe(true);
  });
});
