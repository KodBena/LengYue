/**
 * tests/integration/useUserIORegistry.test.ts
 *
 * Tier-3 (composable integration) tests for `useUserIORegistry`
 * — the registry-driven keyboard dispatcher (Phase 2 of the
 * archived plan, `docs/archive/notes/design/keybindings-plan.md`)
 * with the Phase 4 captureMode early-return.
 *
 * The composable installs a window-level `keydown` listener in
 * `onMounted` and removes it in `onUnmounted`, so each test
 * mounts a tiny harness component whose setup calls the
 * composable; teardown unmounts the harness via `afterEach` so
 * the next test starts with a clean listener slate.
 *
 * Coverage:
 *
 *   - Immediate-mode dispatch fires synchronously on keydown.
 *   - Coalesced-mode dispatch schedules an rAF; rapid presses
 *     cancel-and-reschedule (5 presses → 5 rAFs scheduled, 4
 *     cancellations → 1 callback effectively fires per frame).
 *   - Letter-case normalization (uppercase `M` triggers an
 *     action bound to lowercase `m`).
 *   - `enabledWhen` gating: disabled actions don't fire, but
 *     `preventDefault` STILL fires (the SPA stays the key
 *     authority for any registry-bound key).
 *   - Form-control context guards (HTMLInputElement /
 *     HTMLTextAreaElement / HTMLSelectElement / contenteditable).
 *   - Phase-4 captureMode early-return: no actions fire, no
 *     preventDefault, when a row is mid-capture.
 *   - User-overridden bindings dispatch the new action;
 *     explicit-null bindings block the dispatch.
 *   - Lifecycle: after unmount the listener is gone, no
 *     dispatch happens.
 *
 * Boundaries replaced: `analysisService` (the registry's
 * ponderToggle handler reads it; the fake's spies let the test
 * assert "handler did not fire" without instantiating real
 * WebSocket plumbing). Everything else — the store, the
 * registry, the navigator — runs for real.
 *
 * License: Public Domain (The Unlicense)
 */

import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

import { useUserIORegistry } from '../../src/composables/useUserIORegistry';
import { store, resetWorkspace, updateBoardState, mutateBoard } from '../../src/store';
import { applyGoMove } from '../../src/logic';
import { ACTIONS } from '../../src/composables/keybindings-catalog';
import {
  cancelCapture,
  setBinding,
  startCapture,
} from '../../src/lib/keybindings-capture';
import {
  fakeAnalysisService,
  resetFakeAnalysisService,
} from '../fakes/analysis-service';

// Tiny harness component: a setup-only SFC whose entire purpose
// is to call useUserIORegistry inside a Vue setup context so the
// onMounted/onUnmounted listener install/remove fires naturally.
const Harness = defineComponent({
  setup() {
    useUserIORegistry();
    return () => null;
  },
});

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  resetWorkspace();
  resetFakeAnalysisService();
  cancelCapture();
  wrapper = mount(Harness);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

// ── Immediate dispatch ────────────────────────────────────

describe('useUserIORegistry — immediate dispatch', () => {
  it('fires synchronously on keydown of an immediate-mode key', () => {
    const before = store.session.ui.showMoveSuggestions;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(store.session.ui.showMoveSuggestions).toBe(!before);
  });

  it('does NOT schedule an rAF for an immediate-mode key', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(rafSpy).not.toHaveBeenCalled();
    rafSpy.mockRestore();
  });

  it('letter case normalisation: uppercase M fires the action bound to lowercase m', () => {
    const before = store.session.ui.showMoveSuggestions;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'M' }));
    expect(store.session.ui.showMoveSuggestions).toBe(!before);
  });

  it('toggles the right boolean per action — n flips showStoneMoveNumbers, not showMoveSuggestions', () => {
    const beforeNumbers = store.session.ui.showStoneMoveNumbers;
    const beforeSuggestions = store.session.ui.showMoveSuggestions;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    expect(store.session.ui.showStoneMoveNumbers).toBe(!beforeNumbers);
    expect(store.session.ui.showMoveSuggestions).toBe(beforeSuggestions);
  });
});

// ── Coalesced dispatch ───────────────────────────────────
//
// 2026-08-10 G25/G26/G27 fix: coalescing keys off `KeyboardEvent.repeat`,
// not off "this action's dispatchMode is coalesced" — see
// `useUserIORegistry.ts`'s `handleKeyDown` for the full rationale. A
// discrete (non-repeat) keydown of a coalesced-mode action now fires
// synchronously, exactly like an immediate-mode action: "one keypress,
// one move," and no rAF is scheduled at all. Only OS auto-repeat
// (`repeat: true`, the real "key held down" signal) still rAF-coalesces,
// preserving perf Fix #1's original back-pressure protection for a
// sustained hold.

describe('useUserIORegistry — coalesced dispatch', () => {
  it('a discrete (non-repeat) keydown of a coalesced-mode key fires synchronously — no rAF scheduled', () => {
    // A move to navigate to, so the handler's synchronous fire is
    // observable, not just "no rAF was scheduled."
    const board = store.boards[0];
    const next = applyGoMove(board, 3, 3);
    if (!next) throw new Error('illegal move in fixture');
    updateBoardState(0, next);
    mutateBoard(next.id, draft => { draft.currentNodeId = draft.rootNodeId; });

    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', repeat: false }));
    expect(rafSpy).not.toHaveBeenCalled();
    expect(store.boards.find(b => b.id === next.id)?.currentNodeId).not.toBe(next.rootNodeId);
    rafSpy.mockRestore();
  });

  it('5 discrete presses produce 5 navigations — none dropped (G25: the "1,2,2,3,3" defect)', () => {
    // Build a short mainline so 5 successive ArrowDown presses have
    // somewhere to go.
    let board = store.boards[0];
    for (let i = 0; i < 5; i++) {
      const next = applyGoMove(board, i, 0);
      if (!next) throw new Error('illegal move in fixture');
      board = next;
    }
    updateBoardState(0, board);
    mutateBoard(board.id, draft => { draft.currentNodeId = draft.rootNodeId; });

    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', repeat: false }));
    }

    // Root + 5 place moves along the mainline: 5 discrete presses
    // must land exactly 5 steps deep, not fewer.
    const live = store.boards.find(b => b.id === board.id)!;
    let depth = 0;
    let currId = live.currentNodeId;
    while (live.nodes[currId]?.parent) {
      depth++;
      currId = live.nodes[currId]!.parent!;
    }
    expect(depth).toBe(5);
  });

  it('OS auto-repeat (repeat: true) rAF-coalesces: schedules on the first repeat keydown', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
    // First keydown of a hold is repeat:false (fires synchronously,
    // no rAF); the browser's auto-repeat stream that follows is
    // repeat:true.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', repeat: false }));
    expect(rafSpy).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', repeat: true }));
    expect(rafSpy).toHaveBeenCalledTimes(1);
    rafSpy.mockRestore();
  });

  it('rapid REPEAT presses cancel-and-reschedule the rAF (5 repeats → 5 rAFs / 4 cancellations)', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
    const cafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', repeat: true }));
    }
    expect(rafSpy).toHaveBeenCalledTimes(5);
    expect(cafSpy).toHaveBeenCalledTimes(4);
    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });
});

// ── enabledWhen gating ───────────────────────────────────

describe('useUserIORegistry — enabledWhen gating', () => {
  it("does NOT fire 'engineConnected' action (ponderToggle) when engine is disconnected", () => {
    store.engine.status = 'disconnected';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(fakeAnalysisService.isPondering).not.toHaveBeenCalled();
    expect(fakeAnalysisService.analyzeActiveNode).not.toHaveBeenCalled();
  });

  it("fires 'engineConnected' action (ponderToggle) when engine is connected", () => {
    store.engine.status = 'connected';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(fakeAnalysisService.isPondering).toHaveBeenCalledTimes(1);
    expect(fakeAnalysisService.analyzeActiveNode).toHaveBeenCalledTimes(1);
  });

  it('STILL calls preventDefault for a registry-bound key even when the action is disabled (SPA stays the key authority)', () => {
    store.engine.status = 'disconnected';
    const event = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire 'activeBoardExists' action when no boards", () => {
    store.boards = [];
    const before = store.session.ui.showMoveSuggestions;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(store.session.ui.showMoveSuggestions).toBe(before);
  });
});

// ── Context guards ───────────────────────────────────────

describe('useUserIORegistry — context guards', () => {
  it('skips dispatch when keydown target is HTMLInputElement', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    try {
      const before = store.session.ui.showMoveSuggestions;
      const event = new KeyboardEvent('keydown', { key: 'm' });
      Object.defineProperty(event, 'target', { value: input });
      window.dispatchEvent(event);
      expect(store.session.ui.showMoveSuggestions).toBe(before);
    } finally {
      document.body.removeChild(input);
    }
  });

  it('skips dispatch when keydown target is HTMLTextAreaElement', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    try {
      const before = store.session.ui.showMoveSuggestions;
      const event = new KeyboardEvent('keydown', { key: 'm' });
      Object.defineProperty(event, 'target', { value: ta });
      window.dispatchEvent(event);
      expect(store.session.ui.showMoveSuggestions).toBe(before);
    } finally {
      document.body.removeChild(ta);
    }
  });

  it('skips dispatch when keydown target is a contenteditable element (e.g. CodeMirror)', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    // jsdom's `isContentEditable` getter does not always reflect the
    // `contenteditable` attribute reliably (HTMLContentEditable in
    // node-jsdom is incomplete). Override the getter directly so the
    // dispatcher's `target.isContentEditable` check sees true — the
    // production code path it gates is the same one CodeMirror's
    // `.cm-content` div triggers in a real browser.
    Object.defineProperty(div, 'isContentEditable', { value: true });
    document.body.appendChild(div);
    try {
      const before = store.session.ui.showMoveSuggestions;
      const event = new KeyboardEvent('keydown', { key: 'm' });
      Object.defineProperty(event, 'target', { value: div });
      window.dispatchEvent(event);
      expect(store.session.ui.showMoveSuggestions).toBe(before);
    } finally {
      document.body.removeChild(div);
    }
  });
});

// ── Workspace-load guard (ADR-0019 audit S1 review, nit 1) ─
//
// App.vue's render gate withholds the board/tree/control-panel
// surfaces while `workspaceLoadState.kind !== 'loaded'`, but this
// listener is global (`window`) and independent of the render
// tree — the per-action `enabledWhen` predicates are satisfied by
// the store's DEFAULT board during 'loading', so without this
// guard a nav/display-toggle hotkey (or the Space ponder-toggle,
// a real WebSocket query) would still fire against a phantom
// workspace about to be replaced wholesale by hydrate(). Pins the
// early return added to `handleKeyDown` in `useUserIORegistry.ts`.

describe('useUserIORegistry — workspace-load guard', () => {
  it("does NOT fire an immediate-mode action while workspaceLoadState is 'loading'", () => {
    store.workspaceLoadState = { kind: 'loading' };
    const before = store.session.ui.showMoveSuggestions;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(store.session.ui.showMoveSuggestions).toBe(before);
  });

  it("does NOT fire the ponder-toggle (a real analysisService WebSocket query) while workspaceLoadState is 'loading', even with the engine connected", () => {
    store.workspaceLoadState = { kind: 'loading' };
    store.engine.status = 'connected';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(fakeAnalysisService.isPondering).not.toHaveBeenCalled();
    expect(fakeAnalysisService.analyzeActiveNode).not.toHaveBeenCalled();
  });

  it("does NOT fire a coalesced-mode nav action (no rAF scheduled) while workspaceLoadState is 'loading'", () => {
    store.workspaceLoadState = { kind: 'loading' };
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(rafSpy).not.toHaveBeenCalled();
    rafSpy.mockRestore();
  });

  it("does NOT call preventDefault while workspaceLoadState is 'loading' (no key is claimed before the workspace is real)", () => {
    store.workspaceLoadState = { kind: 'loading' };
    const event = new KeyboardEvent('keydown', { key: 'm', cancelable: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventSpy).not.toHaveBeenCalled();
  });

  it("resumes normal dispatch once workspaceLoadState becomes 'loaded'", () => {
    store.workspaceLoadState = { kind: 'loading' };
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    const before = store.session.ui.showMoveSuggestions;

    store.workspaceLoadState = { kind: 'loaded' };
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(store.session.ui.showMoveSuggestions).toBe(!before);
  });

  it("does NOT fire while workspaceLoadState is 'error' either (not just 'loading')", () => {
    store.workspaceLoadState = { kind: 'error', message: 'boom' };
    const before = store.session.ui.showMoveSuggestions;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(store.session.ui.showMoveSuggestions).toBe(before);
  });
});

// ── captureMode early-return (Phase 4) ──────────────────

describe('useUserIORegistry — captureMode early-return', () => {
  it('does NOT fire any action while captureMode is set', () => {
    const before = store.session.ui.showMoveSuggestions;
    startCapture(ACTIONS.displayToggleMoveNumbers);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(store.session.ui.showMoveSuggestions).toBe(before);
  });

  it('does NOT call preventDefault while captureMode is set (the capturing row owns the event)', () => {
    startCapture(ACTIONS.displayToggleMoveNumbers);
    const event = new KeyboardEvent('keydown', { key: 'm', cancelable: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventSpy).not.toHaveBeenCalled();
  });

  it('resumes normal dispatch after captureMode is cleared', () => {
    const before = store.session.ui.showMoveSuggestions;
    startCapture(ACTIONS.displayToggleMoveNumbers);
    cancelCapture();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(store.session.ui.showMoveSuggestions).toBe(!before);
  });
});

// ── preventDefault for bound keys ───────────────────────

describe('useUserIORegistry — preventDefault', () => {
  it('calls preventDefault on a registry-bound key', () => {
    const event = new KeyboardEvent('keydown', { key: 'm', cancelable: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT call preventDefault on an unbound key', () => {
    const event = new KeyboardEvent('keydown', { key: 'z', cancelable: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventSpy).not.toHaveBeenCalled();
  });
});

// ── User overrides ──────────────────────────────────────

describe('useUserIORegistry — user overrides', () => {
  it('user-overridden key dispatches the action', () => {
    setBinding(ACTIONS.displayToggleMoveNumbers, 'z');
    const before = store.session.ui.showStoneMoveNumbers;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' }));
    expect(store.session.ui.showStoneMoveNumbers).toBe(!before);
  });

  it('after override, the default key no longer triggers that action', () => {
    setBinding(ACTIONS.displayToggleMoveNumbers, 'z');
    const before = store.session.ui.showStoneMoveNumbers;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    expect(store.session.ui.showStoneMoveNumbers).toBe(before);
  });

  it('explicit-null override blocks dispatch entirely (the action is unreachable)', () => {
    setBinding(ACTIONS.displayToggleMoveNumbers, null);
    const before = store.session.ui.showStoneMoveNumbers;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    expect(store.session.ui.showStoneMoveNumbers).toBe(before);
  });
});

// ── Listener lifecycle ─────────────────────────────────

describe('useUserIORegistry — lifecycle', () => {
  it('stops dispatching after the harness component is unmounted', () => {
    wrapper?.unmount();
    wrapper = null;
    const before = store.session.ui.showMoveSuggestions;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(store.session.ui.showMoveSuggestions).toBe(before);
  });
});
