/**
 * tests/integration/status-bar-hint-no-reflow.test.ts
 *
 * Geometry-stability regression guard for ledger row 811: hovering a
 * move suggestion publishes a "Ctrl+click to paste PV" hint
 * (`useTransientHint`) that `StatusBar.vue` renders. Before the fix,
 * that hint was an ordinary flex-flow sibling in `.status-right`
 * (`v-if="hint"` with no special positioning) — mounting it widened
 * the row, squeezed `.caps` (no `white-space: nowrap`) into wrapping
 * onto two lines, grew the bar's `min-height`, and because the board
 * square derives its size from the bar's remaining height budget, the
 * ENTIRE BOARD visibly resized on hover-enter and snapped back on
 * hover-leave.
 *
 * jsdom performs no real layout (no box metrics), so this guard can't
 * assert on pixels. It pins the structural invariant that makes reflow
 * impossible instead: `.transient-hint` is `position: absolute`, which
 * removes it from `.status-right`'s flex-width computation regardless
 * of its content or presence. Vitest's jsdom environment runs with
 * `css: false` (`vite.config.ts`), so component `<style>` blocks are
 * not auto-injected into the test DOM; this test reads `StatusBar.vue`'s
 * own `<style scoped>` block off disk and installs it as a real
 * stylesheet before mounting, so `getComputedStyle` reflects the
 * project's actual, current CSS — not a hand-copied duplicate that
 * could drift from the source of truth.
 *
 * Verified red-without-fix / green-with-fix (see the dispatch report,
 * `.claude/dispatch-reports/pv-hint-no-reflow.md`): reverting the
 * `.transient-hint` rule to its pre-fix form (no `position`) makes the
 * `position === 'absolute'` assertion below fail; the current source
 * passes it.
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

describe('StatusBar — PV-paste hint does not reflow the bar (ledger row 811)', () => {
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

  it('renders no .transient-hint element when no hint is published', () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('.transient-hint').exists()).toBe(false);
  });

  it('positions the hint out of flow (position: absolute) so mounting it cannot widen .status-right', async () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    setHint('Ctrl+click to paste PV');
    await nextTick();

    const hintEl = wrapper.find('.transient-hint');
    expect(hintEl.exists()).toBe(true);

    // The load-bearing assertion: `position: absolute` takes the hint
    // out of `.status-right`'s flex-flow entirely, so its presence
    // cannot change the row's own width — the mechanism that produced
    // the .caps wrap-and-board-resize bug this guard exists to prevent.
    const computed = getComputedStyle(hintEl.element);
    expect(computed.position).toBe('absolute');
  });

  it('.status-right establishes the positioning context the hint anchors against', () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });

    const statusRight = wrapper.find('.status-right');
    expect(statusRight.exists()).toBe(true);
    const computed = getComputedStyle(statusRight.element);
    expect(computed.position).toBe('relative');
  });
});
