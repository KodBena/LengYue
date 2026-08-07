/**
 * tests/integration/setup-tool-board-click-routing.test.ts
 *
 * Routing-level regression guard for setup-palette-defects (commission
 * row 756, defect 1: "clicking black/white/triangle then clicking the
 * board places NOTHING live"). `tests/integration/useSetupTools.test.ts`
 * covers the composable's own state machine and `applyToolAt` in
 * isolation — driving `tools.applyToolAt(x, y)` directly — which is
 * exactly why the shipped feature had green tests AND a live no-op
 * defect: the actual break lived in the REAL DOM event sequence between
 * two sibling components (`SetupToolPalette`'s document-level outside-
 * click dismiss and `BoardWidget`'s click handler), which a composable-
 * only test never exercises.
 *
 * Root cause: `SetupToolPalette`'s outside-click dismiss listens on
 * `pointerdown` in the CAPTURE phase (so it can beat an in-palette click
 * handler). A real click on the board is, from the palette's DOM
 * perspective, "outside" — so the capture-phase `pointerdown` closed the
 * palette and deselected the armed tool BEFORE the board's own `click`
 * handler ever ran `applyToolAt`, which by then always saw no tool
 * armed and fell through to a normal (and usually illegal/no-op) move.
 * The fix threads a `data-setup-tool-surface` marker through
 * `BoardWidget.vue`'s root that the palette's dismiss check exempts.
 *
 * This suite mounts the real `SetupToolPalette` and `BoardWidget`
 * components side by side (mirroring how `Toolbar.vue` and
 * `BoardWidget.vue` are siblings under `App.vue`), drives the palette
 * open/tool-armed via real clicks, dispatches a REAL `pointerdown` on
 * the board element (the event the browser fires before `click`, which
 * is exactly what the composable-only test cannot reach), and then
 * exercises the board's click routing. Both directions are asserted:
 * tool-armed → `applySetup`'s effect (a setup stone), never a routed
 * 'move' emit; palette-closed → the ordinary 'move' emit, never a setup
 * stone.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { resetWorkspace, store, addBoard, activeBoard } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import SetupToolPalette from '../../src/components/chrome/SetupToolPalette.vue';
import BoardWidget from '../../src/components/board/BoardWidget.vue';
import BoardDisplay from '../../src/components/board/BoardDisplay.vue';
import { i18n } from '../../src/i18n';

describe('setup-tool board-click routing — real DOM event sequence', () => {
  let paletteWrapper: VueWrapper;
  let boardWrapper: VueWrapper;

  beforeEach(() => {
    resetWorkspace();
    addBoard(createInitialBoard());
    // Overlays unrelated to this defect (variation rings, PV
    // suggestions) are gated off so BoardWidget mounts without needing
    // the theme/ResizeObserver env stubs `render-count/jsdom-stubs.ts`
    // provides for THOSE components' own suites — this suite's subject
    // is click routing, not rendering.
    store.session.ui.showMoveSuggestions = false;
    store.session.ui.boardVariations = 'off';
    store.session.ui.showActiveNextMove = false;

    // `attachTo: document.body` is load-bearing here, NOT cosmetic:
    // `SetupToolPalette`'s outside-click dismiss listens on
    // `document.addEventListener('pointerdown', ..., true)`. A default
    // `mount()` renders into a DETACHED tree that never bubbles to the
    // real `document` at all, so a test that dispatches `pointerdown`
    // without `attachTo` would pass regardless of whether the dismiss
    // bug is present — false-negative-proofed by attaching both
    // components to the live document, the same tree App.vue mounts
    // them into.
    paletteWrapper = mount(SetupToolPalette, {
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    boardWrapper = mount(BoardWidget, {
      attachTo: document.body,
      props: { state: activeBoard.value! },
      global: { plugins: [i18n] },
    });
  });

  afterEach(() => {
    paletteWrapper.unmount();
    boardWrapper.unmount();
  });

  /** The real event a browser fires on the board BEFORE its own 'click'
   * handler — dispatched on the board's root so it reaches the
   * palette's document-level capture-phase listener exactly like a
   * genuine user click would. */
  function dispatchBoardPointerdown(): void {
    const boardEl = boardWrapper.find('.board-widget-container').element;
    boardEl.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  }

  it('a setup tool armed + a real board click applies the tool, NOT a routed move', async () => {
    await paletteWrapper.find('.setup-trigger').trigger('click');
    const blackToolBtn = paletteWrapper.findAll('.tool-btn')[0];
    await blackToolBtn.trigger('click');

    // Sanity: the tool is actually armed before the click under test —
    // otherwise this test would trivially pass for the wrong reason.
    expect(paletteWrapper.find('.setup-trigger').classes()).toContain('tool-armed');

    dispatchBoardPointerdown();
    await boardWrapper.findComponent(BoardDisplay).vm.$emit('click', 4, 4);

    expect(activeBoard.value?.stones['4,4']).toBe('B'); // applySetup's effect
    expect(boardWrapper.emitted('move')).toBeUndefined(); // NOT applyGoMove's routed path
  });

  it('reverse: with the palette closed, the same click routes as an ordinary move, not a setup stone', async () => {
    // Palette never opened this time — activeTool stays null by
    // construction (module-scope state reset via resetWorkspace in
    // beforeEach).
    dispatchBoardPointerdown();
    await boardWrapper.findComponent(BoardDisplay).vm.$emit('click', 4, 4);

    expect(boardWrapper.emitted('move')).toEqual([[4, 4]]); // routed as a normal move
    expect(activeBoard.value?.stones['4,4']).toBeUndefined(); // no setup stone written directly
  });
});
