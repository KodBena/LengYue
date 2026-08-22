/**
 * tests/integration/status-bar-player-names-ellipsis.test.ts
 *
 * Regression guard for the occluded-names defect, now covering BOTH
 * arcs of the fix (`.claude/dispatch-reports/preview-board-followup-
 * build.md` item 1 supersedes the prior item-4 fix's own test intent,
 * which is preserved and extended here rather than dropped):
 *
 * Arc 1 (commit 0705b900, S4 fix, ellipsis-vs-flex). `.status-left`/
 * `.player-names`/`.move-badge`/`.game-info` went nowrap+shrink to cure
 * a wrap-into-overlap defect (`.claude/dispatch-reports/
 * component-shoddiness-build.md` S4), but `.player-names` stayed a
 * `display: inline-flex` container with `text-overflow: ellipsis`
 * applied to it directly. `text-overflow: ellipsis` is only specified
 * (and only reliably rendered) against the overflow of a run of INLINE
 * content in a block/inline box; on a flex container with multiple
 * flex-item children, browsers hard-clip the last partially-visible
 * flex item with NO ellipsis glyph inserted — witnessed as "Black vs
 * Whi" with no "…" affordance at a narrow bar width.
 *
 * Arc 2 (mandate addendum item 1, REOPENED — commissioner-witnessed
 * live, `~/xs/_invisible_control_panel.png` /
 * `~/xs/8b66_occluded_names_visible_tree_horizontal_scrolbar.png`).
 * Arc 1's fix alone still failed the mandate's two-part contract:
 *
 *   (a) `.status-left` never carried its own `flex-grow`, so it never
 *       claimed a share of `.status-bar`'s spare width — only
 *       `.transient-hint` did. `.player-names`' `flex: 1 1 auto` was
 *       consequently inert: it could never render past its own bare
 *       content width no matter how much blank bar remained to its
 *       right ("starved despite available space").
 *   (b) the single `.player-names` blob applied ONE ellipsis to the
 *       whole "Black vs White" run, so under narrowing the ellipsis
 *       always ate the TAIL (White) while the HEAD (Black) stayed
 *       perpetually intact — first-takes-all tail elision, never a
 *       symmetric degradation.
 *
 * The fix (`StatusBar.vue`): `.status-left` gains `flex: 1 1 auto` so
 * it genuinely competes for the bar's surplus (closes (a)); the single
 * `.player-names` blob is split into two independently-ellipsizing
 * `.player-name` children (`--black` / `--white`), each `flex: 1 1 0`
 * so a constrained `.player-names` width is shared EVENLY between them
 * (closes (b)). Each `.player-name` stays a plain `display:
 * inline-block` (not flex) internally, for the same ellipsis-needs-
 * inline-flow reason Arc 1 established — just applied per-name now
 * instead of to the whole pairing. `:title` on the outer `.player-names`
 * still carries the untruncated "Black vs White" pairing.
 *
 * jsdom performs no real layout (no box metrics, per this test tree's
 * own established convention — see `status-bar-hint-no-reflow.test.ts`'s
 * header), so this guard cannot assert on rendered pixels or on whether
 * a literal "…" glyph paints, nor can it assert that names ACTUALLY grow
 * wider given free space (that needs a real layout engine — see the
 * live-rig witness in the build report). It asserts on the
 * computed-style declarations and DOM text content that make the CSS
 * shape sound: neither name's DOM text is truncated by JS (only CSS
 * ever elides, visually); both `.player-name` children carry identical,
 * symmetric ellipsis declarations (no name is structurally privileged
 * over the other); `.status-left` genuinely carries a non-zero
 * flex-grow (closing the "inert flex-grow" defect regardless of what a
 * particular renderer's max-content computation does); and the S4
 * anti-overlap/never-wrap invariants survive both arcs' worth of
 * change.
 *
 * Reads `StatusBar.vue`'s own `<style scoped>` block off disk (not a
 * hand-copied duplicate) so `getComputedStyle` reflects the real,
 * current CSS — same technique as `status-bar-hint-no-reflow.test.ts`.
 *
 * Addendum (statusbar-cards-completion-build, defects (a) and (f)
 * REOPENED a second/third time, both re-witnessed live at 1920px against
 * the reverted divider-mechanics base, 90b67af3): two more root causes
 * surfaced past Arc 2's fix above. (a) `flex: 1 1 0` on each
 * `.player-name` pinned its flex-BASIS to the literal `0`, which also
 * zeroed `.player-names`' own max-content contribution up the tree — both
 * names ellipsized immediately even at an enormous ample width; fixed by
 * `flex: 1 1 auto` (basis = each name's own natural content width). (f)
 * the active-turn ring (`.stone-chip.active`'s outline, painted OUTSIDE
 * the chip) was still clipped by `.player-name`'s `overflow: hidden`
 * needed for the ellipsis affordance — the prior left-padding band-aid
 * (below) only opened headroom on ONE edge and was live-refuted; the
 * root fix moves the ellipsis/clip declarations to a NEW inner
 * `.player-name-text` span, so `.player-name` itself never clips on any
 * edge. The tests below are updated in place to pin the CURRENT shape;
 * see `StatusBar-player-names-ample-width.test.ts` for the dedicated
 * ample-width companion suite.
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

  it('wide width: both full names are present verbatim in the DOM (no JS-level truncation) — contract (a)', () => {
    const { board, metadata } = boardWithMetadata('AlphaGo', 'Lee Sedol');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    // CSS ellipsis is a paint-time affordance jsdom cannot render; the
    // DOM's own text content must carry the FULL name either way — a
    // component that pre-truncated in JS would fail this even though
    // no CSS test could ever catch it.
    expect(wrapper.find('.player-name--black').text()).toContain('AlphaGo');
    expect(wrapper.find('.player-name--white').text()).toContain('Lee Sedol');
  });

  it('.status-left genuinely competes for the bar\'s surplus width (closes the "inert flex-grow" defect)', () => {
    const { board, metadata } = boardWithMetadata('Black', 'White');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    // Before the fix, `.status-left` had no `flex-grow` at all (the
    // shorthand default, `flex: 0 1 auto`) — `.player-names`' own
    // `flex: 1 1 auto` could never engage because its PARENT never had
    // any positive free space to redistribute. A non-zero flex-grow
    // here is the structural precondition for "both names render in
    // full whenever the bar's actual free width allows".
    const statusLeft = getComputedStyle(wrapper.find('.status-left').element);
    expect(statusLeft.flexGrow).not.toBe('0');
  });

  it('.player-names is a flex ROW of two independently-ellipsizing children, not one shared blob (closes first-takes-all tail elision) — contract (b)', () => {
    // Superseded shape, statusbar-cards-completion-build (defect f): the
    // ellipsis/nowrap/overflow clip boundary moved from `.player-name`
    // itself to a NEW inner `.player-name-text` span — `.player-name` is
    // now `inline-flex` (chip + text-span as independent flex children)
    // and carries NO overflow clipping, so the active-turn ring (painted
    // outside the chip's border box) is never clipped on any edge. See
    // `StatusBar.vue`'s own comment on `.player-name-text` for the full
    // derivation; this test's intent (symmetric, non-privileged
    // ellipsis) is preserved, just re-pinned against the current DOM
    // shape.
    const { board, metadata } = boardWithMetadata('AlphaGo', 'Lee Sedol');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const outer = getComputedStyle(wrapper.find('.player-names').element);
    expect(outer.display).toBe('flex');

    const blackName = wrapper.find('.player-name--black');
    const whiteName = wrapper.find('.player-name--white');
    expect(blackName.exists()).toBe(true);
    expect(whiteName.exists()).toBe(true);

    const blackComputed = getComputedStyle(blackName.element);
    const whiteComputed = getComputedStyle(whiteName.element);

    // `.player-name` is `inline-flex` now (chip + `.player-name-text` as
    // two independent flex children) — it is deliberately NOT the
    // ellipsizing box itself, so it carries no overflow clipping.
    expect(blackComputed.display).toBe('inline-flex');
    expect(whiteComputed.display).toBe('inline-flex');
    expect(blackComputed.overflow).not.toBe('hidden');
    expect(whiteComputed.overflow).not.toBe('hidden');

    // The ellipsizing box is the INNER `.player-name-text` span — a
    // plain inline-block leaf, never a flex container itself (Arc 1's
    // lesson, still true, applied one level deeper now).
    const blackNameText = wrapper.find('.player-name--black .player-name-text');
    const whiteNameText = wrapper.find('.player-name--white .player-name-text');
    expect(blackNameText.exists()).toBe(true);
    expect(whiteNameText.exists()).toBe(true);
    const blackTextComputed = getComputedStyle(blackNameText.element);
    const whiteTextComputed = getComputedStyle(whiteNameText.element);
    expect(blackTextComputed.display).not.toBe('flex');
    expect(blackTextComputed.display).not.toBe('inline-flex');
    expect(whiteTextComputed.display).not.toBe('flex');
    expect(whiteTextComputed.display).not.toBe('inline-flex');

    // Both names' text spans carry IDENTICAL ellipsis/nowrap/overflow
    // declarations AND identical flex-basis/flex-grow — the symmetry
    // itself is the assertion that neither player is structurally
    // privileged, unlike the old single-blob shape where Black (head of
    // the run) could never be the one elided.
    for (const computed of [blackTextComputed, whiteTextComputed]) {
      expect(computed.whiteSpace).toBe('nowrap');
      expect(computed.overflow).toBe('hidden');
      expect(computed.textOverflow).toBe('ellipsis');
    }
    expect(blackTextComputed.flexGrow).toBe(whiteTextComputed.flexGrow);
    expect(blackTextComputed.flexShrink).toBe(whiteTextComputed.flexShrink);
    expect(blackTextComputed.flexBasis).toBe(whiteTextComputed.flexBasis);
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

  it('defect (f) root fix: the active-turn ring has NO clipping ancestor at all — the left-padding band-aid is retired, not widened', () => {
    // Superseded shape, statusbar-cards-completion-build: the prior fix
    // (commit 87455822, "StatusBar active-turn ring no longer clipped")
    // opened 3px of left-edge headroom on `.player-name`'s own
    // `overflow: hidden` box — live-refuted TWICE: `.stone-chip`'s
    // `vertical-align: middle` leaves near-zero vertical slack, so the
    // ring's top/bottom arcs were still clipped by the same box the
    // left-padding never touched. Root fix: `.player-name` no longer
    // clips on ANY edge (asserted above) — there is no ring-bleed
    // headroom left to reserve, because there is no clipping box left
    // to reserve it against. This test pins the retirement, not a
    // successor magic number.
    const { board, metadata } = boardWithMetadata('Black', 'White');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const blackComputed = getComputedStyle(wrapper.find('.player-name--black').element);
    const whiteComputed = getComputedStyle(wrapper.find('.player-name--white').element);
    expect(blackComputed.overflow).not.toBe('hidden');
    expect(whiteComputed.overflow).not.toBe('hidden');
    // The chip and the (now-clipping) `.player-name-text` are SIBLINGS
    // under `.player-name` — the chip itself sits outside the only
    // element that still clips, on every edge, at any width.
    const blackChip = wrapper.find('.player-name--black .stone-chip').element;
    expect(blackChip.parentElement?.className).toContain('player-name--black');
  });

  it('narrow mode: symmetric degradation — a single shared ceiling on `.player-names` squeezes both names equally, not one first — contract (b)', () => {
    const { board, metadata } = boardWithMetadata('Black', 'White');
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    // jsdom has no ResizeObserver (per this file's own onMounted guard),
    // so `statusBarNarrow` never flips true here — this asserts the RULE
    // exists and targets `.player-names` (the shared ceiling both names
    // are constrained under) with the expected ceiling, mirroring this
    // test tree's stated posture of asserting on CSS shape rather than
    // on a layout jsdom cannot produce.
    const styleText = readStatusBarStyleBlock();
    const narrowRuleMatch = styleText.match(/\.status-bar--narrow \.player-names\s*{([^}]*)}/);
    expect(narrowRuleMatch).toBeTruthy();
    expect(narrowRuleMatch![1]).toContain('max-width: 90px');

    // Because `.player-names` is `display: flex` with two `.player-name`
    // children (each `flex: 1 1 auto`, basis = the name's OWN natural
    // width — statusbar-cards-completion-build, defect (a)'s second
    // reopening: `flex-basis: 0` silently zeroed each name's contribution
    // to `.player-names`' own max-content size up the tree, so `auto` is
    // the fix, not a shared literal), constraining `.player-names`' width
    // via this narrow-mode `max-width` still squeezes both names'
    // proportional to their own content — neither is asked to give up
    // more than a proportional share. The ellipsis affordance itself now
    // lives on the inner `.player-name-text` span (defect f). Confirmed
    // against the LIVE computed style of both text spans (not just the
    // rule text), so this assertion tracks the actual cascade.
    const blackTextComputed = getComputedStyle(wrapper!.find('.player-name--black .player-name-text').element);
    const whiteTextComputed = getComputedStyle(wrapper!.find('.player-name--white .player-name-text').element);
    expect(blackTextComputed.textOverflow).toBe('ellipsis');
    expect(whiteTextComputed.textOverflow).toBe('ellipsis');
    expect(blackTextComputed.flexGrow).toBe(whiteTextComputed.flexGrow);
    expect(blackTextComputed.flexBasis).toBe(whiteTextComputed.flexBasis);

    const blackComputed = getComputedStyle(wrapper!.find('.player-name--black').element);
    const whiteComputed = getComputedStyle(wrapper!.find('.player-name--white').element);
    expect(blackComputed.flexBasis).toBe('auto');
    expect(blackComputed.flexBasis).toBe(whiteComputed.flexBasis);
  });
});
