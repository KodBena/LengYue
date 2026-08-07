/**
 * tests/integration/status-bar-hint-no-reflow.test.ts
 *
 * Geometry-stability regression guard for ledger row 811 / commission
 * row 837. `StatusBar.vue`'s "Ctrl+click to paste PV" hint
 * (`useTransientHint`) went through two defective mechanisms before
 * this one:
 *
 *   1. An ordinary `v-if`-inserted flex sibling in `.status-right` —
 *      mounting it widened the row, squeezed `.caps` into wrapping
 *      onto two lines, grew the bar's `min-height`, and because the
 *      board square derives its size from the bar's remaining height
 *      budget, the ENTIRE BOARD resized on every hover-enter/leave.
 *   2. `position: absolute; bottom: 100%` (anchored on `.status-right
 *      { position: relative }`) stopped the reflow by taking the hint
 *      out of flow entirely — but then floated it OVER the board's
 *      bottom-right corner, occluding board content, and let an
 *      ancestor clip long text mid-word into an illegible
 *      "Ctrl+cli…" box.
 *
 * The current mechanism is a PERMANENTLY-PRESENT in-flow flex slot:
 * always rendered (no `v-if`), with empty text when no hint is
 * active, `flex: 1 1 0; min-width: 0; overflow: hidden; text-
 * overflow: ellipsis; white-space: nowrap`. Because the element never
 * mounts/unmounts, the bar's geometry cannot change between
 * hint-active and hint-inactive states — reflow is impossible by
 * construction. Being in-flow (never `position: absolute`) also makes
 * occlusion of the board impossible: the slot can only ever displace
 * its own flex siblings inside the bar. And ellipsis-on-overflow means
 * a long hint is clipped at a whole-line boundary, never mid-word.
 *
 * This test pins the NEW invariant, not the old (superseded)
 * `position: absolute` one:
 *
 *   - `.transient-hint` exists in the DOM in BOTH the hint-active and
 *     hint-inactive states — i.e. it is structurally always rendered,
 *     not conditionally inserted/removed by `v-if`.
 *   - It carries the flex/overflow/ellipsis declarations that make
 *     reflow and mid-word clipping impossible.
 *   - It is never `position: absolute` (regression guard against the
 *     second defective mechanism recurring).
 *
 * jsdom performs no real layout (no box metrics), so this guard
 * cannot assert on pixels; it asserts on the computed-style
 * declarations that make the geometry argument sound. Vitest's jsdom
 * environment runs with `css: false` (`vite.config.ts`), so component
 * `<style>` blocks are not auto-injected into the test DOM; this test
 * reads `StatusBar.vue`'s own `<style scoped>` block off disk and
 * installs it as a real stylesheet before mounting, so
 * `getComputedStyle` reflects the project's actual, current CSS — not
 * a hand-copied duplicate that could drift from the source of truth.
 *
 * Verified red-without-fix / green-with-fix against a scratch revert
 * of the CSS (not `git stash`, which is banned) — see the dispatch
 * report, `.claude/dispatch-reports/pv-hint-in-flow-slot.md`, for the
 * exact failure observed.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import StatusBar from '../../src/components/board/StatusBar.vue';
import { createInitialBoard } from '../../src/store/board-factory';
import { useTransientHint } from '../../src/composables/useTransientHint';
import { i18n } from '../../src/i18n';
import type { BoardState } from '../../src/types';

const STATUS_BAR_SFC_PATH = join(__dirname, '..', '..', 'src', 'components', 'board', 'StatusBar.vue');

/**
 * Extracts the `<style scoped>...</style>` body from the SFC source and
 * returns it as plain CSS text. Deliberately reads the *current* file on
 * disk (not a copy pasted into this test) so the assertion tracks the
 * real component style, including any future edit to it.
 */
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
  return {
    board: createInitialBoard(),
    metadata: { blackName: 'Black', whiteName: 'White', komi: 6.5, rules: 'Chinese' },
  };
}

describe('StatusBar — PV-paste hint is a permanent in-flow slot (ledger row 811 / commission row 837)', () => {
  let wrapper: VueWrapper | null = null;
  const { setHint, clearHint } = useTransientHint();

  beforeEach(() => {
    clearHint();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    clearHint();
  });

  it('renders .transient-hint even when no hint is published — it is NOT v-if-inserted', () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    // The structural invariant: the element exists whether or not a
    // hint is active. The pre-this-fix mechanisms (`v-if="hint"`) would
    // fail this assertion — that is the exact regression this guards.
    const hintEl = wrapper.find('.transient-hint');
    expect(hintEl.exists()).toBe(true);
    expect(hintEl.text()).toBe('');
  });

  it('renders the same .transient-hint element (with text) once a hint is published', async () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const beforeCount = wrapper.findAll('.transient-hint').length;
    expect(beforeCount).toBe(1);

    setHint('Ctrl+click to paste PV');
    await nextTick();

    const hintEl = wrapper.find('.transient-hint');
    expect(hintEl.exists()).toBe(true);
    expect(hintEl.text()).toBe('Ctrl+click to paste PV');
    // Still exactly one — mounting a hint never inserts/removes the
    // element, it only changes its text content.
    expect(wrapper.findAll('.transient-hint').length).toBe(1);
  });

  it('is an in-flow flexible slot: flex 1 1 0, min-width 0, ellipsis overflow, never absolutely positioned', async () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    setHint('Ctrl+click to paste PV');
    await nextTick();

    const hintEl = wrapper.find('.transient-hint');
    const computed = getComputedStyle(hintEl.element);

    // In-flow, not the out-of-flow escape hatch the second defective
    // mechanism used (which is what let it float over the board).
    expect(computed.position).not.toBe('absolute');

    // The flex/overflow declarations that make reflow-on-mount and
    // mid-word clipping impossible.
    expect(computed.flexGrow).toBe('1');
    expect(computed.flexShrink).toBe('1');
    expect(computed.minWidth).toBe('0px');
    expect(computed.overflow).toBe('hidden');
    expect(computed.textOverflow).toBe('ellipsis');
    expect(computed.whiteSpace).toBe('nowrap');
  });

  it('.caps cannot wrap in either state (white-space: nowrap)', () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const caps = wrapper.find('.caps');
    expect(caps.exists()).toBe(true);
    expect(getComputedStyle(caps.element).whiteSpace).toBe('nowrap');
  });
});
