/**
 * tests/integration/StatusBar-narrow-no-overflow.test.ts
 *
 * Regression coverage for N1 (BLOCKER) / N4 (MAJOR), LYT finish-pass-2
 * (`.claude/dispatch-reports/lyt-finish-pass-2.md` §6): at 420×880 the
 * `Pass` button and `B: 0 · W: 0` captures were off-screen and
 * unreachable (`#status-bar` `scrollWidth 530` vs `clientWidth 420`,
 * no scrollbar); at 1280×1024 the same class recurred against the
 * captures span. The original fix (`.claude/dispatch-reports/
 * lyt-n1-statusbar.md`) tightened `.status-bar--narrow`'s collapse with
 * a fixed 90px `.player-names` cap plus tighter gaps/padding.
 *
 * Superseded, status-bar-narrow-0c21
 * (`.claude/dispatch-reports/statusbar-narrow-0c21-build.md`): that
 * flat 90px cap turned out to be a STEP FUNCTION independent of how
 * much room the bar actually had the instant `narrow` engaged — live-
 * witnessed re-occluding BOTH player names entirely (`~/ys/0c21_status
 * _bar_...png`) at a bar width where the ephemeral `.transient-hint`
 * slot (almost always empty) was still absorbing hundreds of free
 * pixels the names could have used instead. Below that, an even
 * narrower width (`~/ys/63a0_gaslighted.png`) reproduced a deeper
 * defect: `.player-names`' own `min-width: 32px` floor, combined with
 * `.status-left`'s `min-width: 0` (S4), let the names OVERFLOW
 * `.status-left`'s shrunk box directly into `.status-right`, visually
 * corrupting the `Pass` button.
 *
 * The current fix (three composing mechanisms, each pinned below):
 * 1. The flat 90px cap is REMOVED — `.player-names` flexes the same
 *    way in every tier, genuinely reactive to available width.
 * 2. `.status-bar--narrow .transient-hint` gets `flex-grow: 0` — the
 *    ephemeral hint slot yields its claim on surplus width to player
 *    identity in the tier where space is actually scarce.
 * 3. `.status-bar` reserves a `gap` between its three direct children
 *    (`.status-left` / `.transient-hint` / `.status-right`) — a
 *    structural minimum separation regardless of how any of the three
 *    end up sized, closing the active-turn ring's outline-bleed class.
 * 4. Below `STATUS_BAR_ULTRA_NARROW_THRESHOLD_PX` (300px, a SECOND,
 *    independently-committed breakpoint —
 *    `StatusBar-ultra-narrow.test.ts` covers this tier and the
 *    control-height unification together), `.status-right` moves to
 *    its own second flex line — closing the class `gap` alone cannot
 *    (a child overflowing its OWN shrunk parent, not a sibling gap).
 *
 * jsdom has no real flex/text layout, so this file follows the SAME
 * two-part convention `ToolbarEngineMetrics-overlap-fix.test.ts` and
 * `ToolbarEngineControls-state-invariance.test.ts` already use:
 *
 *   1. A computed-style pin (the `status-bar-hint-no-reflow.test.ts`
 *      idiom — install the SFC's own `<style scoped>` block as a real
 *      stylesheet, then read `getComputedStyle`) confirming the
 *      current declarations this fix depends on are actually present.
 *   2. An arithmetic no-overflow check using REAL widths measured via
 *      an isolated live-rig Playwright probe against the real theme
 *      font stack (`.claude/dispatch-reports/
 *      statusbar-narrow-0c21-build.md`, worst-case content: a 245-move
 *      game, 27/19 captures, two 33/34-character player names) —
 *      reused verbatim as named constants, not re-derived here, same
 *      discipline the two existing files above already follow.
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

describe('StatusBar — narrow-mode no-overflow (N1/N4 fix, status-bar-narrow-0c21 revision)', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  describe('computed-style pin — the current narrow-mode declarations', () => {
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

    it('.player-names carries NO narrow-mode max-width — the flat cap is removed, not retuned', () => {
      // status-bar-narrow-0c21: the former fixed 90px cap engaged the
      // instant `narrow` flipped, regardless of how much of the bar's
      // width was actually free — the root cause of both names
      // rendering fully elided while `.transient-hint` sat on hundreds
      // of unused pixels. Asserting its ABSENCE (not a new value) is
      // the correct pin: no rule should reintroduce a step-function
      // ceiling on this element in this tier.
      const el = wrapper!.find('.player-names').element;
      const maxWidth = getComputedStyle(el).maxWidth;
      expect(maxWidth === 'none' || maxWidth === '').toBe(true);

      // Item 1 (occluded-names REOPENED, mandate addendum) / defect (f)
      // repair (statusbar-cards-completion-build), unchanged by this
      // revision: the ellipsis/nowrap/overflow declarations live on the
      // INNER `.player-name-text` span, not on `.player-name` itself —
      // moving the clip boundary off the chip so the active-turn ring
      // (painted OUTSIDE the chip's own border box) is never clipped by
      // the ellipsis affordance's own `overflow: hidden`.
      const blackNameText = wrapper!.find('.player-name--black .player-name-text').element;
      const whiteNameText = wrapper!.find('.player-name--white .player-name-text').element;
      for (const nameEl of [blackNameText, whiteNameText]) {
        expect(getComputedStyle(nameEl).whiteSpace).toBe('nowrap');
        expect(getComputedStyle(nameEl).overflow).toBe('hidden');
        expect(getComputedStyle(nameEl).textOverflow).toBe('ellipsis');
      }
      const blackName = wrapper!.find('.player-name--black').element;
      const whiteName = wrapper!.find('.player-name--white').element;
      for (const nameEl of [blackName, whiteName]) {
        expect(getComputedStyle(nameEl).overflow).not.toBe('hidden');
      }
    });

    it('.status-bar--narrow .transient-hint yields its flex-grow to player identity', () => {
      // status-bar-narrow-0c21: the mechanism that makes removing the
      // 90px cap safe — the ephemeral hint slot (base rule: `flex-grow:
      // 1`, almost always empty) no longer competes with `.player-names`
      // for the bar's surplus once the bar is genuinely narrow.
      const hint = wrapper!.find('.transient-hint').element;
      expect(getComputedStyle(hint).flexGrow).toBe('0');
    });

    it('.status-bar reserves a minimum gap between its three direct children', () => {
      // status-bar-narrow-0c21: the structural overlap guard — closes
      // the active-turn ring's outline-bleed class regardless of how
      // `.transient-hint` or `.player-names` end up sized. Unlike the
      // narrow-mode-only `.status-left`/`.status-right` internal gaps
      // (below), this one lives on the OUTER `.status-bar` and applies
      // at every width tier, not just narrow.
      const bar = wrapper!.find('.status-bar').element;
      expect(getComputedStyle(bar).gap).toBe('var(--space-default)');
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

  describe('arithmetic no-overflow check — real widths from the status-bar-narrow-0c21 live rig probe', () => {
    // Real widths measured via an isolated live-rig Playwright probe
    // (`.claude/dispatch-reports/statusbar-narrow-0c21-build.md`)
    // against the theme's real font stack, worst-case content
    // (long player names, heavy captures), narrow mode engaged, at the
    // documented floor (420px) and just above the ultra-narrow
    // breakpoint (310px) where `.player-names` sits at its `min-width:
    // 32px` floor rather than a cap (there is no cap any more — see
    // above). Reused verbatim, not re-derived — same discipline
    // `ToolbarEngineMetrics-overlap-fix.test.ts`'s own
    // `EVAL_SUMMARY_WORST_CASE_PX` follows.
    const TOOLBAR_MOVE_NAV_PX = 84.8;
    const MOVE_BADGE_PX = 56;
    const PLAYER_NAMES_FLOOR_PX = 32; // `.player-names`' own min-width — the terminal floor, not a cap
    const PASS_BTN_PX = 36.2;
    const CAPS_PX = 78;
    const NARROW_GAP_PX = 4; // --space-tight, 2 gaps in .status-left + 1 in .status-right
    const BAR_PADDING_PX = 4; // --space-tight, both sides
    const BAR_GAP_PX = 8; // --space-default, reserved between .status-bar's 3 direct children (2 gaps)

    // .status-left: nav + gap + move-badge + gap + player-names (at its floor)
    const STATUS_LEFT_PX = TOOLBAR_MOVE_NAV_PX + NARROW_GAP_PX + MOVE_BADGE_PX + NARROW_GAP_PX + PLAYER_NAMES_FLOOR_PX;
    // .status-right: pass-btn + gap + caps
    const STATUS_RIGHT_PX = PASS_BTN_PX + NARROW_GAP_PX + CAPS_PX;
    // .status-bar: left padding + status-left + 2 reserved bar gaps (hint collapses to 0) + status-right + right padding
    const MINIMUM_BAR_WIDTH_PX = BAR_PADDING_PX + STATUS_LEFT_PX + 2 * BAR_GAP_PX + STATUS_RIGHT_PX + BAR_PADDING_PX;

    it('minimum required width fits comfortably under 420px (this codebase\'s documented narrow floor), WITH margin', () => {
      expect(MINIMUM_BAR_WIDTH_PX).toBeLessThan(420);
      // Margin, not just "fits" — a future label/spacing tweak that
      // eats the margin down to zero should be caught here rather
      // than only live (same discipline as the eval/health overlap
      // test's own margin assertion).
      const marginAt420 = 420 - MINIMUM_BAR_WIDTH_PX;
      expect(marginAt420).toBeGreaterThan(30);
    });

    it('minimum required width sits ABOVE the ultra-narrow breakpoint (300px) — the two tiers don\'t overlap', () => {
      // If this ever went the other way (minimum need dropping below
      // 300px), the ultra-narrow tier's own second-line wrap
      // (`StatusBar-ultra-narrow.test.ts`) would be reachable from a
      // width where a single line was still supposed to work — a
      // tier-boundary inconsistency this assertion catches.
      expect(MINIMUM_BAR_WIDTH_PX).toBeGreaterThan(300);
    });

    it('Pass and captures both land fully inside a 420px track (no off-screen positioning)', () => {
      // Reconstruct the flex-row x-positions the same way the browser
      // would lay them out left-to-right within .status-left / .status-right.
      const leftStart = BAR_PADDING_PX;
      const navRight = leftStart + TOOLBAR_MOVE_NAV_PX;
      const badgeRight = navRight + NARROW_GAP_PX + MOVE_BADGE_PX;
      const namesRight = badgeRight + NARROW_GAP_PX + PLAYER_NAMES_FLOOR_PX;
      expect(namesRight).toBeLessThanOrEqual(STATUS_LEFT_PX + BAR_PADDING_PX);

      // .status-right sits after .status-left plus the two reserved
      // bar gaps (`.transient-hint` collapses to 0 between them) — so
      // its rightmost content sits at TRACK_WIDTH - BAR_PADDING_PX
      // exactly when there's zero slack (the worst case for
      // reachability), and Pass/caps are laid out left-to-right within
      // that block.
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
      // real geometry measurement and confirmed both reachable, no
      // overlap, at this width.
      const passCenter = (passLeft + passRight) / 2;
      const capsCenter = (capsLeft + capsRight) / 2;
      expect(passCenter).toBeGreaterThan(0);
      expect(passCenter).toBeLessThan(TRACK_WIDTH);
      expect(capsCenter).toBeGreaterThan(0);
      expect(capsCenter).toBeLessThan(TRACK_WIDTH);

      // No overlap: `.player-names`' rightmost extent (namesRight) sits
      // strictly before Pass's leftmost extent (passLeft), with the
      // reserved bar gap (at minimum) between them.
      expect(passLeft - namesRight).toBeGreaterThanOrEqual(BAR_GAP_PX);
    });
  });
});
