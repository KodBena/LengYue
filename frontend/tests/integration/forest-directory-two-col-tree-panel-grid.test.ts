/**
 * tests/integration/forest-directory-two-col-tree-panel-grid.test.ts
 *
 * Regression guard for the card-trees render collapse diagnosed in
 * `.claude/dispatch-reports/lyt-cardtrees-regression.md` and fixed by
 * `.claude/dispatch-reports/cardtrees-fix-next.md` (ledger row 1937).
 *
 * The defect: `ForestDirectory.vue`'s `.panel-content-two-col
 * .tree-panel` rule used to be a wrapped flexbox
 * (`flex-flow: row wrap` + `align-content: flex-start`). Per
 * docs/adr/0000 Rule 2(a), a non-default `align-content` opts *every*
 * flex line out of cross-axis stretch — when `.chart-wrapper` landed
 * alone on the second line (the ordinary Browse-tab case, no
 * `CardMetadataPanel` sibling), its declared `flex: 1 1 0` only still
 * governed its *width*; its *height* collapsed to content instead of
 * filling the panel, and `CardTreeWidget`'s `height: 100%` chain
 * bottomed out at 0 (`clientHeight: 0`, no ECharts SVG ever mounted).
 *
 * The fix converts `.tree-panel` in two-column mode to `display: grid`
 * with explicit tracks (`grid-template-rows: auto 1fr`): the header row
 * sizes to its own content, and the body row (chart-wrapper /
 * card-metadata-panel) is an explicit `1fr` fraction of the remaining
 * space — never an implicit content-hypothetical default, and immune to
 * the wrap-axis-flip hazard the old flexbox shape had.
 *
 * jsdom performs no real layout (no box metrics), so a true "the child
 * measures a non-trivial pixel height" assertion is infeasible here —
 * named honestly rather than faked. What IS pinnable, and is the
 * structural argument for why the collapse can no longer happen: the
 * CSS shape itself, read through jsdom's CSSOM (`getComputedStyle`),
 * against the component's OWN CURRENT `<style>` block read off disk
 * (not a hand-copied duplicate that could drift from the source of
 * truth — same idiom as
 * `tests/integration/status-bar-hint-no-reflow.test.ts`). Grid's
 * `1fr` row track is the invariant a real browser would honor to fill
 * available height; asserting it's `1fr` (not `auto`, not absent) is
 * the closest a layout-free DOM can get to "this child fills its
 * container."
 *
 * No Vue component is mounted here — the assertions are pure DOM +
 * CSSOM against a fixture built with the SAME class names
 * `ForestDirectory.vue`'s template uses in the two-column branch, so
 * this stays independent of the composable/service wiring the real
 * component needs (auth, forest data, etc.) while still exercising the
 * project's real, current CSS.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FOREST_DIRECTORY_SFC_PATH = join(
  __dirname, '..', '..', 'src', 'components', 'tree', 'ForestDirectory.vue',
);

/**
 * Extracts the `<style scoped>...</style>` body from the SFC source and
 * returns it as plain CSS text — read from the CURRENT file on disk
 * (mirrors `status-bar-hint-no-reflow.test.ts`'s helper) so this guard
 * tracks the real component style, including any future edit to it.
 */
function readForestDirectoryStyleBlock(): string {
  const source = readFileSync(FOREST_DIRECTORY_SFC_PATH, 'utf-8');
  const match = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!match) {
    throw new Error('ForestDirectory.vue: no <style> block found — SFC structure changed unexpectedly');
  }
  // `:deep(X)` is a Vue SFC `<style scoped>` compiler transform (rewritten
  // at build time into a real attribute-scoped descendant selector), not
  // valid plain CSS — jsdom's parser silently drops a rule it can't parse,
  // which would make the .card-metadata-panel placement assertions below
  // false-negative for a reason unrelated to the fix under test. Unwrap it
  // to the plain descendant selector it compiles down to (this fixture
  // has no scoping-attribute collision to worry about, unlike production).
  return match[1].replace(/:deep\(([^)]+)\)/g, '$1');
}

let styleEl: HTMLStyleElement | null = null;

beforeAll(() => {
  styleEl = document.createElement('style');
  styleEl.textContent = readForestDirectoryStyleBlock();
  document.head.appendChild(styleEl);
});

afterAll(() => {
  styleEl?.remove();
  styleEl = null;
});

let fixture: HTMLElement | null = null;

/**
 * Builds a bare fixture reproducing the DOM shape ForestDirectory.vue's
 * template produces for the `.forest-container.panel-content-two-col`
 * branch: `.tree-panel` hosting `.panel-header`, `.chart-wrapper`, and
 * (optionally) a `.card-metadata-panel` sibling — the exact selector
 * targets the component's own `<style>` declares rules against.
 */
function mountTwoColFixture(opts: { withMetadataPanel: boolean }): {
  treePanel: HTMLElement;
  panelHeader: HTMLElement;
  chartWrapper: HTMLElement;
  metadataPanel: HTMLElement | null;
} {
  const container = document.createElement('div');
  container.className = 'forest-container panel-content-two-col';

  const treePanel = document.createElement('div');
  treePanel.className = 'tree-panel';

  const panelHeader = document.createElement('div');
  panelHeader.className = 'panel-header';
  panelHeader.textContent = 'Lineage Explorer';

  const chartWrapper = document.createElement('div');
  chartWrapper.className = 'chart-wrapper';
  const cardTreeWidgetRoot = document.createElement('div');
  cardTreeWidgetRoot.className = 'card-tree-widget';
  chartWrapper.appendChild(cardTreeWidgetRoot);

  treePanel.appendChild(panelHeader);
  treePanel.appendChild(chartWrapper);

  let metadataPanel: HTMLElement | null = null;
  if (opts.withMetadataPanel) {
    metadataPanel = document.createElement('div');
    metadataPanel.className = 'card-metadata-panel';
    treePanel.appendChild(metadataPanel);
  }

  container.appendChild(treePanel);
  document.body.appendChild(container);
  fixture = container;

  return { treePanel, panelHeader, chartWrapper, metadataPanel };
}

beforeEach(() => {
  fixture = null;
});

afterEach(() => {
  fixture?.remove();
  fixture = null;
});

describe('ForestDirectory two-column .tree-panel — grid tracks, not implicit flex stretch (ledger row 1937)', () => {
  it('is display:grid with an explicit 1fr body row — never the old flex-wrap shape', () => {
    const { treePanel } = mountTwoColFixture({ withMetadataPanel: false });
    const computed = getComputedStyle(treePanel);

    expect(computed.display).toBe('grid');
    // Two tracks: chart-wrapper's flexible column, the metadata panel's
    // own (collapsing-to-content-when-absent) column.
    expect(computed.gridTemplateColumns).toBe('1fr auto');
    // THE invariant that forecloses the collapse: the body row is an
    // explicit fraction of remaining space, not an implicit
    // content-hypothetical default (the old align-content: flex-start
    // shape's failure mode) and not a second `auto` row (which would
    // reproduce the same "sizes to its own content" collapse under grid).
    expect(computed.gridTemplateRows).toBe('auto 1fr');
  });

  it('places .panel-header on its own full-width row (row 1, spanning both columns)', () => {
    const { panelHeader } = mountTwoColFixture({ withMetadataPanel: false });
    const computed = getComputedStyle(panelHeader);

    expect(computed.gridRow).toBe('1');
    expect(computed.gridColumn).toBe('1 / -1');
  });

  it('places .chart-wrapper on the explicit-1fr body row (row 2, column 1) — the fill-assuming child from the regression', () => {
    const { chartWrapper } = mountTwoColFixture({ withMetadataPanel: false });
    const computed = getComputedStyle(chartWrapper);

    expect(computed.gridRow).toBe('2');
    expect(computed.gridColumn).toBe('1');
    // min-height: 0 is load-bearing for a grid item that must be allowed
    // to shrink below its content's intrinsic size within a fixed track —
    // without it, a grid item's default `min-height: auto` can refuse to
    // respect the track and overflow instead of filling it.
    expect(computed.minHeight).toBe('0px');
  });

  it('.chart-wrapper still gets the 1fr body row (column 1) even when NO CardMetadataPanel sibling is present — the exact trigger condition from the regression', () => {
    // This is the regression's precise repro condition: the ordinary
    // Browse-tab case where nothing is selected for inline edit, so
    // .chart-wrapper is alone in the body row. Under the old flex-wrap
    // shape this was exactly the case where .chart-wrapper landed alone
    // on its line and its height collapsed to content. Under grid, the
    // row's `1fr` track size does not depend on what else occupies it.
    const { treePanel, chartWrapper } = mountTwoColFixture({ withMetadataPanel: false });

    expect(getComputedStyle(treePanel).gridTemplateRows).toBe('auto 1fr');
    expect(getComputedStyle(chartWrapper).gridRow).toBe('2');
  });

  it('places .card-metadata-panel on the same body row, second column, when present', () => {
    const { metadataPanel } = mountTwoColFixture({ withMetadataPanel: true });
    expect(metadataPanel).not.toBeNull();
    const computed = getComputedStyle(metadataPanel!);

    expect(computed.gridRow).toBe('2');
    expect(computed.gridColumn).toBe('2');
  });

  it('never carries the old defective shape: align-content is not overridden away from its default', () => {
    // Regression pin: the old rule set `align-content: flex-start` on a
    // `flex-flow: row wrap` container, which is exactly what opted every
    // line out of cross-axis stretch. `align-content` has no effect on a
    // grid container's own item placement the way it did on the old
    // flexbox shape, but asserting it stays at its unset default here
    // guards against a future edit re-introducing the flex-wrap shape
    // (with the align-content override intact) without updating this
    // fixture's expectations — a silent revert would leave this
    // assertion's `display` check as the sole guard, this one is the
    // explicit belt-and-suspenders pin named in the original diagnosis.
    const { treePanel } = mountTwoColFixture({ withMetadataPanel: false });
    const computed = getComputedStyle(treePanel);

    expect(computed.alignContent).not.toBe('flex-start');
  });
});
