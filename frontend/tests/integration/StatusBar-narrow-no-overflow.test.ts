/**
 * tests/integration/StatusBar-narrow-no-overflow.test.ts
 *
 * Regression coverage for N1 (BLOCKER) / N4 (MAJOR), LYT finish-pass-2
 * (`.claude/dispatch-reports/lyt-finish-pass-2.md` §6): at 420×880 the
 * `Pass` button and `B: 0 · W: 0` captures were off-screen and
 * unreachable (`#status-bar` `scrollWidth 530` vs `clientWidth 420`,
 * no scrollbar); at 1280×1024 the same class recurred against the
 * captures span. The fix (`.claude/dispatch-reports/lyt-n1-statusbar.md`)
 * tightens `.status-bar--narrow`'s existing collapse — a fixed 90px
 * `.player-names` cap (replacing a `40%` cap that measured live at
 * ~250px against a 647px bar, per that report's root-cause finding)
 * plus tighter gaps/padding already declared elsewhere in the file.
 *
 * jsdom has no real flex/text layout, so this file follows the SAME
 * two-part convention `ToolbarEngineMetrics-overlap-fix.test.ts` and
 * `ToolbarEngineControls-state-invariance.test.ts` already use:
 *
 *   1. A computed-style pin (the `status-bar-hint-no-reflow.test.ts`
 *      idiom — install the SFC's own `<style scoped>` block as a real
 *      stylesheet, then read `getComputedStyle`) confirming the fixed
 *      `max-width` / tightened `gap` / `padding` declarations this fix
 *      depends on are actually present on the rendered `.status-bar`
 *      when narrow.
 *   2. An arithmetic no-overflow check using REAL widths measured via
 *      an isolated live-rig Playwright probe against the real theme
 *      font stack (`.claude/dispatch-reports/lyt-n1-statusbar.md`,
 *      worst-case content: a 245-move game, 27/19 captures, two
 *      33-40-character player names) — reused verbatim as named
 *      constants, not re-derived here, same discipline the two
 *      existing files above already follow.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import StatusBar from '../../src/components/board/StatusBar.vue';
import { createInitialBoard } from '../../src/store/board-factory';
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

// Worst-case-shaped board state — a 245-move game with realistic-heavy
// captures and long player names, matching the live rig probe this
// test's widths are sourced from.
function worstCaseBoardWithMetadata(): { board: BoardState; metadata: { blackName: string; whiteName: string; komi: number; rules: string } } {
  const board = createInitialBoard();
  board.captures = { B: 27, W: 19 };
  const root = board.nodes[board.rootNodeId];
  root.properties = {
    ...root.properties,
    PB: ['Honorable Long Player Name Nine'],
    PW: ['Another Rather Long Opponent Name'],
  };
  return {
    board,
    metadata: { blackName: 'Honorable Long Player Name Nine', whiteName: 'Another Rather Long Opponent Name', komi: 6.5, rules: 'Chinese' },
  };
}

describe('StatusBar — narrow-mode no-overflow (N1/N4 fix)', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  describe('computed-style pin — the tightened narrow-mode declarations exist', () => {
    beforeEach(() => {
      const { board, metadata } = worstCaseBoardWithMetadata();
      wrapper = mount(StatusBar, {
        props: { board, metadata, canPass: true },
        global: { plugins: [i18n] },
      });
      // jsdom has no ResizeObserver (see StatusBar.vue's own onMounted
      // guard), so `statusBarNarrow` never flips reactively here — the
      // class is applied directly, the same manual-trigger idiom this
      // tree uses whenever a CSS-only, ResizeObserver-driven branch
      // needs a computed-style assertion without a real layout engine.
      wrapper.find('.status-bar').element.classList.add('status-bar--narrow');
    });

    it('.player-names gets a FIXED px cap, not a percentage (the root cause this fix closes)', () => {
      const el = wrapper!.find('.player-names').element;
      const maxWidth = getComputedStyle(el).maxWidth;
      expect(maxWidth).toBe('90px');
      expect(maxWidth.endsWith('%')).toBe(false);
      // Item 1 (occluded-names REOPENED, mandate addendum): the
      // ellipsis/nowrap/overflow declarations now live on EACH
      // `.player-name` child (symmetric per-name degradation), not on
      // the outer `.player-names` row — see `StatusBar.vue`'s own
      // comment on `.player-name`. Both children carry them equally,
      // which is itself the "neither name is privileged" assertion.
      const blackName = wrapper!.find('.player-name--black').element;
      const whiteName = wrapper!.find('.player-name--white').element;
      for (const nameEl of [blackName, whiteName]) {
        expect(getComputedStyle(nameEl).whiteSpace).toBe('nowrap');
        expect(getComputedStyle(nameEl).overflow).toBe('hidden');
        expect(getComputedStyle(nameEl).textOverflow).toBe('ellipsis');
      }
    });

    it('.status-left / .status-right gaps tighten to --space-tight in narrow mode', () => {
      // jsdom resolves custom-property REFERENCES, not their theme.css
      // values (theme.css isn't installed alongside this SFC's own
      // style block, mirroring `status-bar-hint-no-reflow.test.ts`'s
      // own scope) — the assertion pins the declaration (narrower
      // token, not the wide-mode `--space-medium`), the live rig probe
      // (this file's header) confirms the resolved 4px in a real browser.
      const left = wrapper!.find('.status-left').element;
      const right = wrapper!.find('.status-right').element;
      expect(getComputedStyle(left).gap).toBe('var(--space-tight)');
      expect(getComputedStyle(right).gap).toBe('var(--space-tight)');
    });

    it('.status-bar itself tightens its horizontal padding in narrow mode', () => {
      // getComputedStyle round-trips this declaration's `padding`
      // shorthand (a literal `0` mixed with a `var()` reference) back
      // as `0` on every longhand AND on the shorthand itself — a jsdom
      // CSSOM quirk (the flex-shorthand footgun
      // `status-bar-hint-no-reflow.test.ts`'s own header documents is
      // the same family: jsdom's CSSOM doesn't expand this shape the
      // way a real browser does). Reading the SFC's own source text
      // (already loaded for the stylesheet installation above) is the
      // reliable signal here, not getComputedStyle.
      const styleBlock = readStatusBarStyleBlock();
      expect(styleBlock).toMatch(/\.status-bar--narrow\.status-bar\s*{\s*padding:\s*0\s+var\(--space-tight\);?\s*}/);
    });

    it('.pass-btn, .move-badge and .caps are NEVER removed from flow by narrow mode', () => {
      // The structural guarantee this bar's own header comment names:
      // these three carry no `display: none` rule at any tier.
      expect(getComputedStyle(wrapper!.find('.pass-btn').element).display).not.toBe('none');
      expect(getComputedStyle(wrapper!.find('.move-badge').element).display).not.toBe('none');
      expect(getComputedStyle(wrapper!.find('.caps').element).display).not.toBe('none');
      expect(wrapper!.find('.pass-btn').exists()).toBe(true);
      expect(wrapper!.find('.caps').exists()).toBe(true);
    });

    it('.game-info, .move-numbers-btn and UserBadge ARE removed from flow (existing G12 collapse, unchanged)', () => {
      expect(getComputedStyle(wrapper!.find('.game-info').element).display).toBe('none');
      expect(getComputedStyle(wrapper!.find('.move-numbers-btn').element).display).toBe('none');
    });
  });

  describe('arithmetic no-overflow check — real widths from the live rig probe', () => {
    // Real widths measured via an isolated live-rig Playwright probe
    // (`.claude/dispatch-reports/lyt-n1-statusbar.md`) against the
    // theme's real font stack, worst-case content (245-move game,
    // 27/19 captures, ~33-40-char player names), narrow mode engaged.
    // Reused verbatim, not re-derived — same discipline
    // `ToolbarEngineMetrics-overlap-fix.test.ts`'s own
    // `EVAL_SUMMARY_WORST_CASE_PX` follows.
    const TOOLBAR_MOVE_NAV_PX = 84.8;
    const MOVE_BADGE_PX = 56;
    const PLAYER_NAMES_CAPPED_PX = 90; // the fixed max-width itself
    const PASS_BTN_PX = 36.2;
    const CAPS_PX = 78;
    const NARROW_GAP_PX = 4; // --space-tight, 2 gaps in .status-left + 1 in .status-right
    const BAR_PADDING_PX = 4; // --space-tight, both sides

    // .status-left: nav + gap + move-badge + gap + player-names
    const STATUS_LEFT_PX = TOOLBAR_MOVE_NAV_PX + NARROW_GAP_PX + MOVE_BADGE_PX + NARROW_GAP_PX + PLAYER_NAMES_CAPPED_PX;
    // .status-right: pass-btn + gap + caps
    const STATUS_RIGHT_PX = PASS_BTN_PX + NARROW_GAP_PX + CAPS_PX;
    // .status-bar: left padding + status-left + status-right + right padding
    // (.transient-hint is flex-grow:1/flex-shrink:1/min-width:0 — it
    // never adds to the MINIMUM required width; it only absorbs
    // whatever slack remains once everything else has its space).
    const MINIMUM_BAR_WIDTH_PX = BAR_PADDING_PX + STATUS_LEFT_PX + STATUS_RIGHT_PX + BAR_PADDING_PX;

    it('minimum required width (365px witnessed) fits comfortably under 420px, WITH margin', () => {
      expect(MINIMUM_BAR_WIDTH_PX).toBeCloseTo(365, 0);
      expect(MINIMUM_BAR_WIDTH_PX).toBeLessThan(420);
      // Margin, not just "fits" — a future label/spacing tweak that
      // eats the margin down to zero should be caught here rather
      // than only live (same discipline as the eval/health overlap
      // test's own margin assertion).
      const marginAt420 = 420 - MINIMUM_BAR_WIDTH_PX;
      expect(marginAt420).toBeGreaterThan(40);
    });

    it('minimum required width fits under 1280px\'s own witnessed 647px bar track (N4\'s viewport)', () => {
      const BAR_WIDTH_1280 = 647; // live-measured .status-bar width at 1280×1024 in this rig's layout
      expect(MINIMUM_BAR_WIDTH_PX).toBeLessThan(BAR_WIDTH_1280);
    });

    it('Pass and captures both land fully inside a 420px track (no off-screen positioning)', () => {
      // Reconstruct the flex-row x-positions the same way the browser
      // would lay them out left-to-right within .status-left / .status-right.
      const leftStart = BAR_PADDING_PX;
      const navRight = leftStart + TOOLBAR_MOVE_NAV_PX;
      const badgeRight = navRight + NARROW_GAP_PX + MOVE_BADGE_PX;
      const namesRight = badgeRight + NARROW_GAP_PX + PLAYER_NAMES_CAPPED_PX;
      expect(namesRight).toBeLessThanOrEqual(STATUS_LEFT_PX + BAR_PADDING_PX);

      // .status-right is right-aligned against the bar's own right edge
      // (justify-content: space-between, with .transient-hint absorbing
      // the middle slack) — so its rightmost content sits at
      // TRACK_WIDTH - BAR_PADDING_PX exactly when there's zero slack
      // (the worst case for reachability), and Pass/caps are laid out
      // left-to-right within that block.
      const TRACK_WIDTH = 420;
      const rightBlockLeft = TRACK_WIDTH - BAR_PADDING_PX - STATUS_RIGHT_PX;
      const passLeft = rightBlockLeft;
      const passRight = passLeft + PASS_BTN_PX;
      const capsLeft = passRight + NARROW_GAP_PX;
      const capsRight = capsLeft + CAPS_PX;

      // Reachability: both controls' full rect lies within [0, TRACK_WIDTH].
      expect(passLeft).toBeGreaterThanOrEqual(0);
      expect(passRight).toBeLessThanOrEqual(TRACK_WIDTH);
      expect(capsLeft).toBeGreaterThanOrEqual(0);
      expect(capsRight).toBeLessThanOrEqual(TRACK_WIDTH);

      // Hit-test proxy (jsdom has no real elementFromPoint stacking):
      // each control's own center point falls strictly inside the
      // track, which is the geometric precondition
      // `document.elementFromPoint` reachability depends on — the
      // live rig probe (linked in this file's header) performed the
      // real `elementFromPoint` hit-test and confirmed both reachable.
      const passCenter = (passLeft + passRight) / 2;
      const capsCenter = (capsLeft + capsRight) / 2;
      expect(passCenter).toBeGreaterThan(0);
      expect(passCenter).toBeLessThan(TRACK_WIDTH);
      expect(capsCenter).toBeGreaterThan(0);
      expect(capsCenter).toBeLessThan(TRACK_WIDTH);
    });
  });
});
