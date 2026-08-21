/**
 * tests/integration/status-bar-player-names-ellipsis.test.ts
 *
 * Regression guard for the occluded-names defect (mandate addendum item
 * 4; `~/xs/occluded_names.png`). Commit 0705b900's S4 fix made
 * `.status-left`/`.player-names`/`.move-badge`/`.game-info` nowrap+shrink
 * to cure the wrap-into-overlap defect (`.claude/dispatch-reports/
 * component-shoddiness-build.md` S4) — but `.player-names` stayed a
 * `display: inline-flex` container with `text-overflow: ellipsis`
 * applied to it directly. `text-overflow: ellipsis` is only specified
 * (and only reliably rendered) against the overflow of a run of INLINE
 * content in a block/inline box; on a flex container with multiple
 * flex-item children (the two `.stone-chip` spans plus the interleaved
 * name/"vs" text runs) browsers hard-clip the last partially-visible
 * flex item with NO ellipsis glyph inserted — witnessed as "Black vs
 * Whi" with no "…" affordance at a narrow bar width.
 *
 * The fix (StatusBar.vue): `.player-names` drops `display: inline-flex`
 * for a plain `display: inline-block` (inline flow, where CSS
 * `text-overflow: ellipsis` actually applies), and gains a `:title`
 * tooltip carrying the untruncated "Black vs White" pairing so an
 * elided name stays discoverable — never silently gone.
 *
 * jsdom performs no real layout (no box metrics, per this test tree's
 * own established convention — see `status-bar-hint-no-reflow.test.ts`'s
 * header), so this guard cannot assert on rendered pixels or on whether
 * a literal "…" glyph paints. It asserts on the computed-style
 * declarations that make the ellipsis-vs-flex argument sound (the flex
 * display is gone; the ellipsis/nowrap/overflow declarations survive)
 * plus the `title` attribute that gives the elided pairing an
 * affordance. It also re-asserts the S4 anti-overlap/never-wrap
 * invariants (`.status-left`/`.status-right`/`.move-badge`/`.game-info`)
 * so this fix cannot silently re-open that regression while closing
 * this one — the "wrap-vs-clip trade" the mandate asks to be pinned.
 *
 * Reads `StatusBar.vue`'s own `<style scoped>` block off disk (not a
 * hand-copied duplicate) so `getComputedStyle` reflects the real,
 * current CSS — same technique as `status-bar-hint-no-reflow.test.ts`.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import StatusBar from '../../src/components/board/StatusBar.vue';
import { createInitialBoard } from '../../src/store/board-factory';
import { i18n } from '../../src/i18n';
import type { BoardState } from '../../src/types';

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

function boardWithMetadata(blackName: string, whiteName: string): {
  board: BoardState;
  metadata: { blackName: string; whiteName: string; komi: number; rules: string };
} {
  return {
    board: createInitialBoard(),
    metadata: { blackName, whiteName, komi: 6.5, rules: 'Chinese' },
  };
}

describe('StatusBar — player names elide with affordance, never clip mid-word (occluded-names regression)', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('.player-names is NOT a flex container — ellipsis is only reliably applied to inline-flow content', () => {
    const { board, metadata } = boardWithMetadata('AlphaGo', 'Lee Sedol');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const el = wrapper.find('.player-names');
    expect(el.exists()).toBe(true);
    const computed = getComputedStyle(el.element);

    // The regression: `display: inline-flex` (or `flex`) on this element
    // is exactly the shape under which browsers do not reliably insert
    // the ellipsis glyph — the "clip with no affordance" defect.
    expect(computed.display).not.toBe('flex');
    expect(computed.display).not.toBe('inline-flex');

    // The ellipsis/nowrap/overflow declarations must still be present —
    // this fix changes HOW they apply (inline flow, not flex), not
    // whether they exist.
    expect(computed.whiteSpace).toBe('nowrap');
    expect(computed.overflow).toBe('hidden');
    expect(computed.textOverflow).toBe('ellipsis');
  });

  it('.player-names carries a title tooltip with the full, untruncated pairing', () => {
    const { board, metadata } = boardWithMetadata('AlphaGo', 'Lee Sedol');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const el = wrapper.find('.player-names');
    const title = el.attributes('title');
    expect(title).toBeTruthy();
    expect(title).toContain('AlphaGo');
    expect(title).toContain('Lee Sedol');
  });

  it('title tooltip tracks the metadata prop, not a stale snapshot', () => {
    const { board, metadata } = boardWithMetadata('Black Player', 'White Player');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const title = wrapper.find('.player-names').attributes('title');
    expect(title).toContain('Black Player');
    expect(title).toContain('White Player');
  });

  it('S4 anti-overlap/never-wrap invariants are preserved (the wrap-vs-clip trade cannot silently flip back)', () => {
    const { board, metadata } = boardWithMetadata('Black', 'White');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const statusLeft = getComputedStyle(wrapper.find('.status-left').element);
    expect(statusLeft.minWidth).toBe('0px');

    const statusRight = getComputedStyle(wrapper.find('.status-right').element);
    expect(statusRight.flexShrink).toBe('0');

    const moveBadge = getComputedStyle(wrapper.find('.move-badge').element);
    expect(moveBadge.whiteSpace).toBe('nowrap');
    expect(moveBadge.flexShrink).toBe('0');

    const gameInfo = getComputedStyle(wrapper.find('.game-info').element);
    expect(gameInfo.whiteSpace).toBe('nowrap');
    expect(gameInfo.flexShrink).toBe('0');

    const playerNames = getComputedStyle(wrapper.find('.player-names').element);
    expect(playerNames.flexGrow).not.toBe('0'); // "flex: 1 1 auto" — still the segment that absorbs the shrink
    expect(playerNames.minWidth).toBe('32px');
  });

  it('narrow mode still tightens the ellipsis ceiling to 90px', () => {
    const { board, metadata } = boardWithMetadata('Black', 'White');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    // jsdom has no ResizeObserver (per this file's own onMounted guard),
    // so `statusBarNarrow` never flips true here — this asserts the RULE
    // exists and targets `.player-names` with the expected ceiling,
    // mirroring this test tree's stated posture of asserting on CSS
    // shape rather than on a layout jsdom cannot produce.
    const styleText = readStatusBarStyleBlock();
    const narrowRuleMatch = styleText.match(/\.status-bar--narrow \.player-names\s*{([^}]*)}/);
    expect(narrowRuleMatch).toBeTruthy();
    expect(narrowRuleMatch![1]).toContain('max-width: 90px');

    // text-overflow/white-space/overflow now live unconditionally on
    // the base `.player-names` rule (S4 fix) — narrow mode only tightens
    // the ceiling. Confirmed against the LIVE computed style (not the
    // narrow-mode rule text, which no longer repeats them) so this
    // assertion tracks the actual cascade rather than one rule's text.
    const computed = getComputedStyle(wrapper!.find('.player-names').element);
    expect(computed.textOverflow).toBe('ellipsis');
  });
});
