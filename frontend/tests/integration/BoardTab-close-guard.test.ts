/**
 * tests/integration/BoardTab-close-guard.test.ts
 *
 * Pins the ADR-0019 audit S6 / S11 BoardTab fixes:
 *
 *   - S6: board selection is a real <button> (standard keyboard
 *     traversal + Enter/Space activation, not a bare `<div @click>`),
 *     close moved to a sibling 'request-close' emit (so the parent can
 *     gate it behind a confirm guard — see useCloseBoardGuard.test.ts —
 *     rather than a direct-to-store close), and the close button carries
 *     an accessible name.
 *   - S11: the tab carries a real accessible name (`aria-label`) derived
 *     from the board's resolved game name, not just the positional "Board
 *     N" CSS-counter ordinal a screen reader/find-in-page/copy-paste
 *     cannot distinguish across tabs.
 *
 * The close button's 24×24 hit-area and `:focus-visible` override of the
 * hover-only reveal are CSS declarations `jsdom` cannot lay out or
 * compute pseudo-classes for (no real layout engine) — those two are
 * pinned as source-text assertions against the component's own `<style>`
 * block below, the same "read the artifact, not a simulation of it"
 * approach `i18n-messages-compile.test.ts` uses for message compilation.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
// @ts-expect-error — @sabaki/sgf has no published types declaration.
import sgf from '@sabaki/sgf';

import { loadSgf } from '../../src/engine/sgf-loader';
import { addBoard, resetWorkspace, store } from '../../src/store';
import { i18n } from '../../src/i18n';
import BoardTab from '../../src/components/board/BoardTab.vue';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';
import type { BoardState } from '../../src/types';

const NAMED_GAME_SGF = '(;FF[4]GM[1]SZ[19]GN[Kobayashi vs Cho];B[pd])';
const BLANK_SGF = '(;FF[4]GM[1]SZ[19])';

// process.cwd() is the `frontend/` package root under Vitest's default
// config — see shared-chrome-css.test.ts's note on why not
// `import.meta.url`-based resolution.
const BOARD_TAB_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/board/BoardTab.vue'),
  'utf-8',
);

function loadBoardIntoStore(source: string): BoardState {
  const board = loadSgf(sgf.parse(source));
  addBoard(board);
  return store.boards[store.boards.length - 1];
}

describe('BoardTab — keyboard-operable selection + accessible naming (ADR-0019 audit S6/S11)', () => {
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    installRenderEnvStubs();
    resetWorkspace();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    removeRenderEnvStubs();
  });

  it('renders the tab-selection surface as a real <button>, not a bare clickable div', async () => {
    const board = loadBoardIntoStore(BLANK_SGF);
    wrapper = mount(BoardTab, {
      props: { state: board, isActive: false },
      global: { plugins: [i18n] },
    });
    await nextTick();

    const selectBtn = wrapper.find('.tab-thumb');
    expect(selectBtn.exists()).toBe(true);
    expect(selectBtn.element.tagName).toBe('BUTTON');
    expect((selectBtn.element as HTMLButtonElement).disabled).toBe(false);
  });

  it('emits activate on a click of the selection button', async () => {
    const board = loadBoardIntoStore(BLANK_SGF);
    wrapper = mount(BoardTab, {
      props: { state: board, isActive: false },
      global: { plugins: [i18n] },
    });
    await nextTick();

    await wrapper.find('.tab-thumb').trigger('click');

    expect(wrapper.emitted('activate')).toBeTruthy();
    expect(wrapper.emitted('activate')![0]).toEqual([board.id]);
  });

  it('emits request-close (not close) from the close button, carrying the board id', async () => {
    const board = loadBoardIntoStore(BLANK_SGF);
    wrapper = mount(BoardTab, {
      props: { state: board, isActive: false },
      global: { plugins: [i18n] },
    });
    await nextTick();

    const closeBtn = wrapper.find('.close-board-btn');
    expect(closeBtn.exists()).toBe(true);
    expect(closeBtn.element.tagName).toBe('BUTTON');

    await closeBtn.trigger('click');

    expect(wrapper.emitted('request-close')).toBeTruthy();
    expect(wrapper.emitted('request-close')![0]).toEqual([board.id]);
    // The old direct-close event name must not still be emitted — the
    // whole point of the rename is that nothing can silently wire back
    // to a direct store.closeBoard call.
    expect(wrapper.emitted('close')).toBeFalsy();
  });

  it('carries the resolved game name as the tab\'s accessible name (aria-label), not just "Board N"', async () => {
    const board = loadBoardIntoStore(NAMED_GAME_SGF);
    wrapper = mount(BoardTab, {
      props: { state: board, isActive: false },
      global: { plugins: [i18n] },
    });
    await nextTick();

    const selectBtn = wrapper.find('.tab-thumb');
    expect(selectBtn.attributes('aria-label')).toBe('Kobayashi vs Cho');

    // The visible ordinal span stays present (the CSS-counter perf
    // choice is unchanged) but is excluded from the accessible name.
    const counterSpan = wrapper.find('.tab-label-num');
    expect(counterSpan.exists()).toBe(true);
    expect(wrapper.find('.tab-label').attributes('aria-hidden')).toBe('true');
  });

  it('falls back to resolveGameName\'s stable ladder (not the bare word "Board") when no SGF metadata is set', async () => {
    const board = loadBoardIntoStore(BLANK_SGF);
    wrapper = mount(BoardTab, {
      props: { state: board, isActive: false },
      global: { plugins: [i18n] },
    });
    await nextTick();

    const ariaLabel = wrapper.find('.tab-thumb').attributes('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel).toMatch(/Free play/);
  });

  it('gives the close button an aria-label naming which board it closes', async () => {
    const board = loadBoardIntoStore(NAMED_GAME_SGF);
    wrapper = mount(BoardTab, {
      props: { state: board, isActive: false },
      global: { plugins: [i18n] },
    });
    await nextTick();

    expect(wrapper.find('.close-board-btn').attributes('aria-label')).toContain('Kobayashi vs Cho');
  });
});

describe('BoardTab — close-button hit-area and focus-visibility (source-pinned; jsdom cannot lay these out)', () => {
  it('close-board-btn\'s hit area is 24x24 (C21 floor), independent of the smaller visible icon', () => {
    const rule = BOARD_TAB_SOURCE.match(/\.close-board-btn\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/width:\s*24px/);
    expect(rule![0]).toMatch(/height:\s*24px/);
  });

  it('close-icon (the visible circle) stays at the pre-audit 16x16 visual size', () => {
    const rule = BOARD_TAB_SOURCE.match(/\.close-icon\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/width:\s*16px/);
    expect(rule![0]).toMatch(/height:\s*16px/);
  });

  it(':focus-visible overrides the opacity:0 hover-reveal on the close button', () => {
    expect(BOARD_TAB_SOURCE).toMatch(/\.close-board-btn:focus-visible\s*\{\s*opacity:\s*1;\s*\}/);
  });

  it('the tab-selection button has its own visible :focus-visible ring', () => {
    const rule = BOARD_TAB_SOURCE.match(/\.tab-thumb:focus-visible\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/outline:/);
  });
});
