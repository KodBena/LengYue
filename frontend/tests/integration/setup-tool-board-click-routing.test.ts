/**
 * tests/integration/setup-tool-board-click-routing.test.ts
 *
 * Two arcs live in this file.
 *
 * Arc 1 (setup-palette-defects, commission row 756, defect 1):
 * "clicking black/white/triangle then clicking the board places
 * NOTHING live." `tests/integration/useSetupTools.test.ts` covers the
 * composable's own state machine and `applyToolAt` in isolation —
 * driving `tools.applyToolAt(x, y)` directly — which is exactly why
 * the shipped feature had green tests AND a live no-op defect: the
 * actual break lived in the REAL DOM event sequence between two
 * sibling components (`SetupToolPalette`'s outside-click dismiss and
 * `BoardWidget`'s click handler), which a composable-only test never
 * exercises. The original fix threaded a `data-setup-tool-surface`
 * exemption marker through `BoardWidget.vue` that the palette's
 * dismiss check special-cased.
 *
 * Arc 2 (setup-tool-sticky-mode, commission row 914): the exemption
 * marker was itself the wrong shape — ADR-0019 (genre convention is
 * the default spec; cgoban/q5go) rules a selected setup tool a STICKY
 * MODE that persists until the user EXPLICITLY ends it, so an
 * outside-click dismiss of ANY kind (even one that exempts the board)
 * is a defect: clicking a tree node, a control-panel button, or any
 * other chrome must leave the tool armed and let that click perform
 * its own normal action. The document-level `pointerdown` dismiss and
 * the `data-setup-tool-surface` exemption machinery it needed are
 * both deleted; the only ends of the mode are the armed tool's own
 * toggle-off, switching to a different tool, closing the palette via
 * its own toolbar button, and Escape (deferring to an open modal's
 * own Escape-to-close priority).
 *
 * This suite mounts the real `SetupToolPalette` and `BoardWidget`
 * components side by side (mirroring how `Toolbar.vue` and
 * `BoardWidget.vue` are siblings under `App.vue`), attached to
 * `document.body` — load-bearing for the Escape assertions, which
 * exercise a real `document`/`window`-level keydown bubble chain that
 * a detached tree never reaches.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { resetWorkspace, store, addBoard, activeBoard } from '../../src/store';
import { createInitialBoard } from '../../src/store/board-factory';
import SetupToolPalette from '../../src/components/chrome/SetupToolPalette.vue';
import BoardWidget from '../../src/components/board/BoardWidget.vue';
import BoardDisplay from '../../src/components/board/BoardDisplay.vue';
import ResetAllKeybindingsModal from '../../src/components/modals/ResetAllKeybindingsModal.vue';
import { useSetupTools } from '../../src/composables/board/useSetupTools';
import { i18n } from '../../src/i18n';

type ModalInstance = { open: () => Promise<boolean> };

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
    // both the (now-removed) outside-click dismiss and the surviving
    // Escape dismiss listen at `document`/`window` scope. A default
    // `mount()` renders into a DETACHED tree that never bubbles to the
    // real `document` at all, so a test that dispatches events without
    // `attachTo` would pass regardless of whether the dismiss
    // machinery is present — false-negative-proofed by attaching every
    // component to the live document, the same tree App.vue mounts
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
   * handler — dispatched on the board's root so it reaches whatever
   * document-level listeners are installed exactly like a genuine user
   * click would. */
  function dispatchBoardPointerdown(): void {
    const boardEl = boardWrapper.find('.board-widget-container').element;
    boardEl.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  }

  async function armBlackTool(): Promise<void> {
    await paletteWrapper.find('.setup-trigger').trigger('click');
    const blackToolBtn = paletteWrapper.findAll('.tool-btn')[0];
    await blackToolBtn.trigger('click');
  }

  it('(d) a setup tool armed + a real board click applies the tool, NOT a routed move', async () => {
    await armBlackTool();

    // Sanity: the tool is actually armed before the click under test —
    // otherwise this test would trivially pass for the wrong reason.
    expect(paletteWrapper.find('.setup-trigger').classes()).toContain('tool-armed');

    dispatchBoardPointerdown();
    await boardWrapper.findComponent(BoardDisplay).vm.$emit('click', 4, 4);

    expect(activeBoard.value?.stones['4,4']).toBe('B'); // applySetup's effect
    expect(boardWrapper.emitted('move')).toBeUndefined(); // NOT applyGoMove's routed path
  });

  it('(d) reverse: with the palette closed, the same click routes as an ordinary move, not a setup stone', async () => {
    // Palette never opened this time — activeTool stays null by
    // construction (module-scope state reset via resetWorkspace in
    // beforeEach).
    dispatchBoardPointerdown();
    await boardWrapper.findComponent(BoardDisplay).vm.$emit('click', 4, 4);

    expect(boardWrapper.emitted('move')).toEqual([[4, 4]]); // routed as a normal move
    expect(activeBoard.value?.stones['4,4']).toBeUndefined(); // no setup stone written directly
  });

  describe('sticky mode (setup-tool-sticky-mode, commission row 914)', () => {
    // A DOM stand-in for "any chrome that isn't the board or the
    // palette" — a tree node or a control-panel button. A plain
    // attached element (not a mounted component) is enough: the
    // property under test is that NOTHING outside the palette's own
    // controls reacts to a click by disarming the tool, so the
    // element's own identity doesn't matter, only that it is outside
    // both `SetupToolPalette` and `BoardWidget`'s DOM and that its own
    // click handler still fires normally.
    let outsideEl: HTMLButtonElement;
    let outsideClicks: number;

    beforeEach(() => {
      outsideClicks = 0;
      outsideEl = document.createElement('button');
      outsideEl.id = 'outside-chrome-stand-in';
      outsideEl.addEventListener('click', () => { outsideClicks += 1; });
      document.body.appendChild(outsideEl);
    });

    afterEach(() => {
      outsideEl.remove();
    });

    it('(a) a click outside the board (tree/panel stand-in) leaves the tool armed AND performs its own normal action', async () => {
      await armBlackTool();
      const { activeTool, paletteOpen } = useSetupTools();
      expect(activeTool.value).toBe('stone-black');

      // The real event order a browser produces: pointerdown, then
      // click, on the outside element — not the palette, not the
      // board.
      outsideEl.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      outsideEl.dispatchEvent(new Event('click', { bubbles: true }));
      await flushPromises();

      // The outside element's own handler ran — its normal action was
      // not intercepted or suppressed.
      expect(outsideClicks).toBe(1);

      // The tool is STILL armed and the palette is STILL open — this
      // is the ADR-0019 sticky-mode contract the outside-click dismiss
      // used to violate.
      expect(activeTool.value).toBe('stone-black');
      expect(paletteOpen.value).toBe(true);
      expect(paletteWrapper.find('.setup-trigger').classes()).toContain('tool-armed');
    });

    it('(b) Escape disarms the tool when no modal has priority', async () => {
      await armBlackTool();
      const { activeTool, paletteOpen } = useSetupTools();
      expect(activeTool.value).toBe('stone-black');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await flushPromises();

      expect(activeTool.value).toBeNull();
      expect(paletteOpen.value).toBe(false);
    });

    it('(b) modal-open case: Escape closes the modal and leaves the tool armed (modal wins)', async () => {
      await armBlackTool();
      const { activeTool, paletteOpen } = useSetupTools();
      expect(activeTool.value).toBe('stone-black');

      const modalWrapper = mount(ResetAllKeybindingsModal, { attachTo: document.body, global: { plugins: [i18n] } });
      const vm = modalWrapper.vm as unknown as ModalInstance;
      const resultPromise = vm.open();
      await flushPromises();
      expect(modalWrapper.find('.modal-backdrop').exists()).toBe(true);

      // Dispatched on `document` so the event bubbles through both
      // `SetupToolPalette`'s document-scoped listener and
      // `useModalKeyboard`'s window-scoped listener, in that order —
      // exactly the real bubble chain a genuine keypress produces.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await flushPromises();

      // The modal's own Escape-to-close path won.
      await expect(resultPromise).resolves.toBe(false);
      expect(modalWrapper.find('.modal-backdrop').exists()).toBe(false);

      // The setup tool was NOT disarmed by the same keypress.
      expect(activeTool.value).toBe('stone-black');
      expect(paletteOpen.value).toBe(true);

      modalWrapper.unmount();
    });

    it('(c) re-clicking the armed tool toggles it off (mode ends)', async () => {
      await armBlackTool();
      const { activeTool } = useSetupTools();
      expect(activeTool.value).toBe('stone-black');

      const blackToolBtn = paletteWrapper.findAll('.tool-btn')[0];
      await blackToolBtn.trigger('click');

      expect(activeTool.value).toBeNull();
    });

    it('(c) selecting a different tool switches the armed tool (does not require an explicit end first)', async () => {
      await armBlackTool();
      const { activeTool } = useSetupTools();
      expect(activeTool.value).toBe('stone-black');

      const whiteToolBtn = paletteWrapper.findAll('.tool-btn')[1];
      await whiteToolBtn.trigger('click');

      expect(activeTool.value).toBe('stone-white');
    });

    it('(c) closing the palette via its own toolbar button ends the mode', async () => {
      await armBlackTool();
      const { activeTool, paletteOpen } = useSetupTools();
      expect(activeTool.value).toBe('stone-black');

      await paletteWrapper.find('.setup-trigger').trigger('click');

      expect(paletteOpen.value).toBe(false);
      expect(activeTool.value).toBeNull();
    });
  });
});
