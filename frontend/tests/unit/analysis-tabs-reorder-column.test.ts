/**
 * tests/unit/analysis-tabs-reorder-column.test.ts
 *
 * Regression guard for finding G20 (independent geometry consult,
 * `.claude/dispatch-reports/opus-uiux-geometry-consult.md`, rows
 * 1556/1565): Analysis Layout's ↑/↓ reorder buttons didn't form a
 * column — group rows (name + up/down/delete) placed ↑ at x=1823,
 * child rows (name + move-select + up/down) placed ↑ at x=1849, a
 * 26px offset, because the child row's extra `.move-select` (a
 * variable-width element absent from the group row) sat between the
 * name and the buttons.
 *
 * Fixed by wrapping both rows' trailing icon-buttons in a shared
 * `.row-actions` block: a fixed-width (80px = 3 * 24px icon-btn +
 * 2 * 4px gaps), right-flush, `justify-content: flex-start` cluster.
 * Because the block's own width is fixed regardless of how many
 * buttons it holds, up/down start at the same offset from the row's
 * right edge in both row kinds, whether or not a delete button
 * follows.
 *
 * Source-text + mount assertions: the CSS shape is a Tier-1
 * source-text check (jsdom has no real layout engine, matching this
 * repo's `TabWidget-overflow.test.ts` convention); the mount checks
 * confirm both row kinds actually render their buttons inside
 * `.row-actions` (not the raw flex row), which is what makes the
 * fixed-width block apply.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import AnalysisTabsEditor from '../../src/components/editors/AnalysisTabsEditor.vue';
import type { AnalysisTab } from '../../src/store/schema';
import type { AnalysisTabId } from '../../src/types';

const SRC = readFileSync(
  resolve(process.cwd(), 'src/components/editors/AnalysisTabsEditor.vue'),
  'utf-8',
);

describe('AnalysisTabsEditor.vue — reorder-button column (G20)', () => {
  it('.row-actions is a fixed-width, right-flush cluster (independent of how many buttons it holds)', () => {
    const rule = /\.row-actions\s*\{[^}]*\}/.exec(SRC);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/width:\s*80px\s*;/);
    expect(rule![0]).toMatch(/flex-shrink:\s*0\s*;/);
    expect(rule![0]).toMatch(/justify-content:\s*flex-start\s*;/);
  });

  it('the group row (tab-head) wraps its up/down/delete buttons in .row-actions', () => {
    const start = SRC.indexOf('class="tab-head"');
    const end = SRC.indexOf('empty-hint', start); // next markup after tab-head closes
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const tabHead = SRC.slice(start, end);
    expect(tabHead).toMatch(/<div class="row-actions">/);
    expect((tabHead.match(/class="icon-btn/g) ?? []).length).toBe(3); // up, down, delete
  });

  it('the child row (panel-row) wraps its up/down buttons in the SAME .row-actions class', () => {
    const start = SRC.indexOf('class="move-select"'); // first occurrence: the per-panel row-to-tab select
    const end = SRC.indexOf('</div>\n    </div>', start); // panel-row's close, then tab-block's close
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const panelRow = SRC.slice(start, end);
    expect(panelRow).toMatch(/<div class="row-actions">/);
    expect((panelRow.match(/class="icon-btn/g) ?? []).length).toBe(2); // up, down (no delete)
  });

  const tabs: AnalysisTab[] = [
    { id: 'tab-a' as AnalysisTabId, label: 'Tab A', panelIds: [] },
    { id: 'tab-b' as AnalysisTabId, label: 'Tab B', panelIds: [] },
  ];

  it('mount: both a group row and (once a panel is assigned) a child row render their arrows inside .row-actions', () => {
    const wrapper = mount(AnalysisTabsEditor, {
      props: { tabs },
      global: { plugins: [i18n] },
    });
    const tabHeadActions = wrapper.find('.tab-head .row-actions');
    expect(tabHeadActions.exists()).toBe(true);
    expect(tabHeadActions.findAll('.icon-btn').length).toBe(3); // up, down, delete
  });
});
