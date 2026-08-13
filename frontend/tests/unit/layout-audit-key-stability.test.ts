/**
 * tests/unit/layout-audit-key-stability.test.ts
 *
 * ADR-0019 CI-gate build (commission per
 * `.claude/dispatch-reports/lyt-final-opus-review.md` §3 Rule 2(b)).
 * Mechanized proof of `scripts/layout-audit.mjs`'s load-bearing design
 * decision: `stableSelector(el)` never uses `:nth-child`/`:nth-of-type`
 * or any measured coordinate, so inserting an UNRELATED sibling
 * anywhere in the tree cannot change any existing finding's key. This
 * is the property that makes the ratchet baseline
 * (`layout-audit-baseline.json`) safe to key on — a coordinate- or
 * position-keyed baseline degrades from fail-noisy to fail-open the
 * moment an unrelated layout change shifts a pixel or a sibling
 * (anthropics/claude-code#82589, named explicitly in the build
 * commission).
 *
 * Also exercises the pure WCAG contrast math (`relLuminance`,
 * `contrastRatioOf`, `parseRgbString`) the audit's C19/C17 rules use,
 * against known reference values (black/white = 21:1).
 *
 * jsdom (Vitest's default environment) is sufficient here: everything
 * under test operates on `id`/`className`/`tagName`/`parentElement`,
 * all of which jsdom implements faithfully. `getBoundingClientRect`-
 * dependent logic (the actual escape/occlusion/size rules) is NOT
 * exercised here — jsdom does not lay out real boxes — and is instead
 * verified by running the script for real against the built SPA (see
 * `.claude/dispatch-reports/lyt-adr0019-gates-build.md`'s WITNESSED
 * two-run determinism check).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import {
  stableSelector,
  relLuminance,
  contrastRatioOf,
  parseRgbString,
} from '../../scripts/layout-audit.mjs';

function buildFixture(): { container: HTMLElement; targets: HTMLElement[] } {
  const container = document.createElement('div');
  container.id = 'split-workspace';

  const panel = document.createElement('div');
  panel.className = 'lyt-leaf-cell control-panel';
  container.appendChild(panel);

  const row = document.createElement('div');
  row.className = 'toolbar-row';
  panel.appendChild(row);

  const targetA = document.createElement('button');
  targetA.className = 'toolbar-btn pass-btn';
  row.appendChild(targetA);

  const targetB = document.createElement('select');
  targetB.className = 'rules-select';
  row.appendChild(targetB);

  document.body.appendChild(container);
  return { container, targets: [targetA, targetB] };
}

describe('stableSelector — key stability under unrelated DOM insertion', () => {
  it('is unchanged by inserting a sibling BEFORE the target at every ancestor level', () => {
    const { container, targets } = buildFixture();
    const keysBefore = targets.map((t) => stableSelector(t));

    // Insert unrelated siblings at three different ancestor depths --
    // exactly the mutation an nth-child-keyed selector would be
    // vulnerable to.
    const newRoot = document.createElement('div');
    newRoot.className = 'unrelated-root-sibling';
    container.parentElement!.insertBefore(newRoot, container);

    const newPanelSibling = document.createElement('div');
    newPanelSibling.className = 'unrelated-panel-sibling';
    container.insertBefore(newPanelSibling, container.firstChild);

    const row = container.querySelector('.toolbar-row')!;
    const newRowSibling = document.createElement('button');
    newRowSibling.className = 'unrelated-row-sibling toolbar-btn';
    row.insertBefore(newRowSibling, row.firstChild);

    const keysAfter = targets.map((t) => stableSelector(t));
    expect(keysAfter).toEqual(keysBefore);
  });

  it('anchors on `id` and ignores everything above it', () => {
    const parent = document.createElement('div');
    parent.className = 'some-wrapper';
    const anchored = document.createElement('button');
    anchored.id = 'connect-btn';
    parent.appendChild(anchored);
    document.body.appendChild(parent);

    const before = stableSelector(anchored);
    expect(before).toBe('#connect-btn');

    // Reparenting under a brand-new ancestor chain must not change the
    // key, because the walk terminates at the id.
    const newParent = document.createElement('section');
    newParent.className = 'totally-different-wrapper deeply nested class list';
    document.body.appendChild(newParent);
    newParent.appendChild(anchored);

    expect(stableSelector(anchored)).toBe(before);
  });

  it('anchors on `data-testid` when no id is present', () => {
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'lyt-presence-target-controlPanel');
    document.body.appendChild(el);
    expect(stableSelector(el)).toBe('[data-testid="lyt-presence-target-controlPanel"]');
  });

  it('never emits an nth-child/nth-of-type fragment', () => {
    const { targets } = buildFixture();
    for (const t of targets) {
      expect(stableSelector(t)).not.toMatch(/nth-child|nth-of-type|:\d/);
    }
  });

  it('sorts class tokens so class-attribute reordering does not change the key', () => {
    const a = document.createElement('button');
    a.className = 'toolbar-btn pass-btn highlight';
    const b = document.createElement('button');
    b.className = 'highlight pass-btn toolbar-btn';
    document.body.appendChild(a);
    document.body.appendChild(b);
    expect(stableSelector(a)).toBe(stableSelector(b));
  });
});

describe('WCAG contrast math (C19/C17 rule support)', () => {
  it('black on white is 21:1 (the canonical reference value)', () => {
    const ratio = contrastRatioOf([0, 0, 0], [255, 255, 255]);
    expect(ratio).toBeCloseTo(21, 1);
  });

  it('identical colors are 1:1', () => {
    const ratio = contrastRatioOf([128, 64, 200], [128, 64, 200]);
    expect(ratio).toBeCloseTo(1, 5);
  });

  it('is symmetric in its two arguments', () => {
    const fg: [number, number, number] = [239, 239, 239];
    const bg: [number, number, number] = [255, 255, 255];
    expect(contrastRatioOf(fg, bg)).toBeCloseTo(contrastRatioOf(bg, fg), 10);
  });

  it('reproduces the review-witnessed near-invisible palette-select pair (~1.15:1)', () => {
    // final-opus-review §"Class 7", #analysis-palette-select:
    // color rgb(255,255,255) on background-color rgb(239,239,239).
    const ratio = contrastRatioOf([255, 255, 255], [239, 239, 239]);
    expect(ratio).toBeGreaterThan(1.0);
    expect(ratio).toBeLessThan(1.3);
  });

  it('parseRgbString reads rgb() and rgba() forms, and rejects garbage', () => {
    expect(parseRgbString('rgb(26, 26, 26)')).toEqual([26, 26, 26, 1]);
    expect(parseRgbString('rgba(0, 167, 255, 0.5)')).toEqual([0, 167, 255, 0.5]);
    expect(parseRgbString('transparent')).toBeNull();
    expect(parseRgbString('')).toBeNull();
  });

  it('relLuminance ranks white above mid-gray above black', () => {
    const lWhite = relLuminance([255, 255, 255]);
    const lGray = relLuminance([128, 128, 128]);
    const lBlack = relLuminance([0, 0, 0]);
    expect(lWhite).toBeGreaterThan(lGray);
    expect(lGray).toBeGreaterThan(lBlack);
  });
});
