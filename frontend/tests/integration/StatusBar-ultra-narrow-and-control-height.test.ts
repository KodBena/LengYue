/**
 * tests/integration/StatusBar-ultra-narrow-and-control-height.test.ts
 *
 * Regression coverage for the status-bar-narrow-0c21 ultra-narrow tier.
 * Below `STATUS_BAR_ULTRA_NARROW_THRESHOLD_PX`, the status-right
 * controls move to their own flex line, preventing the active-turn chip
 * from overlapping the Pass control at very narrow widths. The tests
 * below pin the two-tier breakpoint relationship and the scoped
 * flex-wrap/flex-basis behaviour.
 *
 * The remaining control-height checks pin the shared token's single
 * theme.css declaration and Pass-button content alignment. They do not
 * assert incidental rendered dimensions or per-consumer CSS serialization.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import StatusBar from '../../src/components/board/StatusBar.vue';
import ToolbarMoveNav from '../../src/components/chrome/ToolbarMoveNav.vue';
import { createInitialBoard } from '../../src/store/board-factory';
import type { BoardState } from '../../src/types';

const STATUS_BAR_SFC_PATH = join(__dirname, '..', '..', 'src', 'components', 'board', 'StatusBar.vue');
const TOOLBAR_MOVE_NAV_SFC_PATH = join(__dirname, '..', '..', 'src', 'components', 'chrome', 'ToolbarMoveNav.vue');

function readStyleBlock(path: string): string {
  const source = readFileSync(path, 'utf-8');
  const match = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!match) {
    throw new Error(`${path}: no <style> block found — SFC structure changed unexpectedly`);
  }
  return match[1];
}

let statusBarStyleEl: HTMLStyleElement | null = null;
let toolbarMoveNavStyleEl: HTMLStyleElement | null = null;

beforeAll(() => {
  statusBarStyleEl = document.createElement('style');
  statusBarStyleEl.textContent = readStyleBlock(STATUS_BAR_SFC_PATH);
  document.head.appendChild(statusBarStyleEl);

  toolbarMoveNavStyleEl = document.createElement('style');
  toolbarMoveNavStyleEl.textContent = readStyleBlock(TOOLBAR_MOVE_NAV_SFC_PATH);
  document.head.appendChild(toolbarMoveNavStyleEl);
});

afterAll(() => {
  statusBarStyleEl?.remove();
  statusBarStyleEl = null;
  toolbarMoveNavStyleEl?.remove();
  toolbarMoveNavStyleEl = null;
});

function boardWithMetadata(): { board: BoardState; metadata: { blackName: string; whiteName: string; komi: number; rules: string } } {
  const board = createInitialBoard();
  const root = board.nodes[board.rootNodeId];
  root.properties = {
    ...root.properties,
    PB: ['Alexandrescu Constantinopoulos'],
    PW: ['Featherstonehaugh Cholmondeley'],
  };
  return {
    board,
    metadata: { blackName: 'Alexandrescu Constantinopoulos', whiteName: 'Featherstonehaugh Cholmondeley', komi: 7.5, rules: 'Chinese' },
  };
}

describe('StatusBar — ultra-narrow second-line tier (status-bar-narrow-0c21)', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('.status-bar--ultra-narrow forces .status-right onto its own flex line', () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });
    // jsdom has no ResizeObserver, so neither `statusBarNarrow` nor
    // `statusBarUltraNarrow` ever flip reactively — both classes are
    // applied directly, the same manual-trigger idiom the sibling
    // narrow-mode test file uses. Ultra-narrow implies narrow (the
    // 300px threshold is below the 700px one), so both are present
    // together exactly as a real narrow bar would render them.
    const bar = wrapper.find('.status-bar').element;
    bar.classList.add('status-bar--narrow', 'status-bar--ultra-narrow');

    const statusRight = wrapper.find('.status-right').element;
    const cs = getComputedStyle(statusRight);
    expect(cs.flexBasis).toBe('100%');

    // The bar itself must allow wrapping for the 100%-basis line-break
    // to take effect at all — `flex-wrap` is scoped to this tier only
    // (see StatusBar.vue's own comment on why an UNSCOPED top-level
    // `flex-wrap: wrap` was tried and reverted: it triggers a
    // premature line-break at ample widths too, because Chromium's
    // line-breaking pass uses each item's un-shrunk hypothetical size,
    // and `.status-left`'s is its full unclamped natural content width
    // now that `.player-names` is genuinely uncapped).
    expect(getComputedStyle(bar).flexWrap).toBe('wrap');
  });

  it('the ultra-narrow rule is absent when only the narrow (not ultra-narrow) class is applied — the two tiers are independently gated', () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });
    const bar = wrapper.find('.status-bar').element;
    bar.classList.add('status-bar--narrow');
    // Deliberately NOT adding 'status-bar--ultra-narrow' here.

    expect(getComputedStyle(bar).flexWrap).not.toBe('wrap');
    const statusRight = wrapper.find('.status-right').element;
    expect(getComputedStyle(statusRight).flexBasis).not.toBe('100%');
  });

  it('source pin: the ultra-narrow breakpoint constant is smaller than the narrow one — ultra-narrow is a stricter subset', () => {
    const source = readFileSync(STATUS_BAR_SFC_PATH, 'utf-8');
    const narrowMatch = source.match(/STATUS_BAR_NARROW_THRESHOLD_PX\s*=\s*(\d+)/);
    const ultraMatch = source.match(/STATUS_BAR_ULTRA_NARROW_THRESHOLD_PX\s*=\s*(\d+)/);
    expect(narrowMatch).toBeTruthy();
    expect(ultraMatch).toBeTruthy();
    const narrowPx = Number(narrowMatch![1]);
    const ultraPx = Number(ultraMatch![1]);
    expect(ultraPx).toBeLessThan(narrowPx);
  });
});

describe('StatusBar — unified control-height token (status-bar-narrow-0c21)', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('.pass-btn centers its content the same flex-centering way ToolbarMoveNav\'s .toolbar-btn does', () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });
    const passBtn = wrapper.find('.pass-btn').element;
    const cs = getComputedStyle(passBtn);
    expect(cs.display).toBe('inline-flex');
    expect(cs.alignItems).toBe('center');
    expect(cs.justifyContent).toBe('center');
  });

  it('theme.css mints exactly one --control-height-min anchor (ADR-0012 P1 — single source of truth)', () => {
    const themeCssPath = join(__dirname, '..', '..', 'src', 'assets', 'css', 'theme.css');
    const themeSource = readFileSync(themeCssPath, 'utf-8');
    const declarations = themeSource.match(/--control-height-min\s*:\s*[^;]+;/g) ?? [];
    expect(declarations.length).toBe(1);
    expect(declarations[0]).toContain('24px');
  });
});
