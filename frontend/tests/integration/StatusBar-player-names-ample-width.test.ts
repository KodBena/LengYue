/**
 * tests/integration/StatusBar-player-names-ample-width.test.ts
 *
 * Regression coverage for defects (a) and (f)
 * (statusbar-cards-completion-build), both re-witnessed live at 1920px
 * against the reverted divider-mechanics base (90b67af3) — see that
 * report for the live-witness screenshots. This file pins the DOM/CSS
 * shape at the component-test tier (`StatusBar-narrow-no-overflow.test.ts`
 * covers the narrow-mode collapse; this file covers the AMPLE-width
 * case those defects live in).
 *
 * Defect (a) — REOPENED a second time: `.player-name`'s `flex: 1 1 0`
 * pinned each name's flex-BASIS to the literal `0`, which — per the CSS
 * Flexbox intrinsic-sizing algorithm — also zeroed `.player-names`' own
 * max-content contribution up the tree, so `.status-left`/`.status-bar`
 * never handed `.player-names` more than its bare `min-width: 32px`
 * floor even at an enormous ample width, and both names ellipsized
 * immediately. Fix: `flex: 1 1 auto` (basis = each name's own natural
 * content width) restores that propagation.
 *
 * Defect (f) — the active-turn ring (`.stone-chip.active`'s `outline`,
 * painted OUTSIDE the chip's border box) was clipped by `.player-name`'s
 * own `overflow: hidden` (needed for the ellipsis affordance) on every
 * edge except the one a prior left-padding band-aid opened. Fix: stop
 * clipping the CHIP at all — `overflow: hidden` / `text-overflow:
 * ellipsis` / `white-space: nowrap` move to a NEW inner
 * `.player-name-text` span wrapping only the name text; `.player-name`
 * itself carries no overflow clipping on any edge.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import StatusBar from '../../src/components/board/StatusBar.vue';
import { createInitialBoard } from '../../src/store/board-factory';
import type { BoardState } from '../../src/types';

// vitest.config.ts sets `css: false` — a mounted SFC's <style> block is
// NEVER auto-injected in this test environment. Every assertion below
// reads `getComputedStyle`, so the real, CURRENT stylesheet has to be
// installed by hand first — same idiom `StatusBar-narrow-no-overflow.
// test.ts` (read in full before authoring this file) already uses.
const STATUS_BAR_SFC_PATH = join(__dirname, '..', '..', 'src', 'components', 'board', 'StatusBar.vue');

function readStatusBarStyleBlock(): string {
  const source = readFileSync(STATUS_BAR_SFC_PATH, 'utf-8');
  const match = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!match) {
    throw new Error('StatusBar.vue: no <style> block found — SFC structure changed unexpectedly');
  }
  return match[1];
}

let styleEl: HTMLStyleElement | null = null;

beforeAll(() => {
  styleEl = document.createElement('style');
  styleEl.textContent = readStatusBarStyleBlock();
  document.head.appendChild(styleEl);
});

afterAll(() => {
  styleEl?.remove();
  styleEl = null;
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

describe('StatusBar — player names at ample width (defect a) and active-turn ring (defect f)', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('DOM structure: each .player-name wraps a stone-chip AND a nested .player-name-text span carrying the name text (not bare text)', () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const blackNameText = wrapper.find('.player-name--black .player-name-text');
    const whiteNameText = wrapper.find('.player-name--white .player-name-text');
    expect(blackNameText.exists()).toBe(true);
    expect(whiteNameText.exists()).toBe(true);
    expect(blackNameText.text()).toBe(metadata.blackName);
    expect(whiteNameText.text()).toBe(metadata.whiteName);

    // The chip is a SIBLING of .player-name-text, not a descendant of it —
    // both live directly under .player-name so the chip's own ring paints
    // outside a box that is never itself the ellipsis-clipping element.
    const blackChip = wrapper.find('.player-name--black .stone-chip');
    expect(blackChip.exists()).toBe(true);
    expect(blackChip.element.parentElement).toBe(wrapper.find('.player-name--black').element);
  });

  it('defect (a): .player-name\'s flex-basis is "auto", never the literal "0" that reopened item 1', () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });
    const blackName = wrapper.find('.player-name--black').element;
    // jsdom's CSSOM resolves the shorthand's basis longhand even without a
    // real layout engine — this is the exact footgun StatusBar.vue's own
    // comment names: `flex-basis: 0` (not `0%`, not `auto`) silently
    // severs a flex item's content size from its ancestors' intrinsic-size
    // calculations. Pinning `auto` here is pinning the fix, not a
    // rendered pixel.
    expect(getComputedStyle(blackName).flexBasis).toBe('auto');
  });

  it('defect (f): .player-name never carries overflow clipping on any edge — the chip\'s ring has nowhere to be clipped', () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const blackName = wrapper.find('.player-name--black').element;
    const whiteName = wrapper.find('.player-name--white').element;
    for (const el of [blackName, whiteName]) {
      const cs = getComputedStyle(el);
      expect(cs.overflow).not.toBe('hidden');
      expect(cs.display).toBe('inline-flex');
    }
  });

  it('defect (f): the ellipsis/clip declarations live on .player-name-text, not on .player-name — the clip boundary moved off the chip', () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const nameText = wrapper.find('.player-name--black .player-name-text').element;
    const cs = getComputedStyle(nameText);
    expect(cs.overflow).toBe('hidden');
    expect(cs.textOverflow).toBe('ellipsis');
    expect(cs.whiteSpace).toBe('nowrap');
  });
});
