/**
 * tests/integration/ToolbarEngineControls-state-invariance.test.ts
 *
 * W-B2 review MAJOR finding — regression coverage
 * (`.claude/dispatch-reports/lyt-wB2-controls-menu-review.md` §1): the
 * pre-fix `useEngineControlsRealization` measured the CURRENT,
 * state-dependent labels, so the realization form could flip
 * (`button-cluster` → `menu-path`) purely from an engine-state change —
 * traced concretely at 1920x1080's own 150.5px column, connecting then
 * starting a match.
 *
 * This test drives the REAL live-measurement path (not `forceForm` —
 * `ToolbarEngineControls-menu-capabilities.test.ts` already covers the
 * forced-form markup/capability surface) through the exact four
 * label-state combinations the review's own table enumerated, at the
 * review's own 1920x1080 column width, and asserts `form` is IDENTICAL
 * across all four. State (`isConnected` via `store.engine.status`,
 * `isMatchRunning` via the component's own prop) is driven directly, as
 * disclosed in the commission (no live engine in this tier).
 *
 * jsdom has no real flex/text layout, so `getBoundingClientRect()` and
 * `getComputedStyle()` are stubbed to reproduce the exact live-measured
 * widths this codebase already cites elsewhere (this file's own header
 * comments in `state/engine-controls-realization.ts` and
 * `useEngineControlsRealization.ts`): Mint Card(s) 105.625, Learn Path
 * 90.015625, Play 43.21875, Match 51.015625, Stop Match 90.015625,
 * Connect 66.609375, Disconnect 90.015625 — plus the compiled
 * `--space-tight` gap (4px) and `.toolbar-btn`'s 24px row height. The
 * component's own root (`.engine-controls`) is stubbed to 1920x1080's
 * own live-measured 150.5px column.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import { store, resetWorkspace } from '../../src/store';
import ToolbarEngineControls from '../../src/components/chrome/ToolbarEngineControls.vue';

// Same no-op stand-in `ToolbarEngineControls-menu-capabilities.test.ts`
// already uses: jsdom ships no `ResizeObserver`, and `useElementWidth`
// constructs one on mount regardless of measurement path.
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
beforeAll(() => {
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = NoopResizeObserver;
  }
});

// The exact live-measured widths cited throughout this feature's own
// source comments (isolated rig, 2026-08-13) — not re-derived here,
// reused verbatim so this test pins the same numbers the production
// code's own documentation already commits to.
const LABEL_WIDTH_PX: Record<string, number> = {
  'Mint Card(s)': 105.625,
  'Learn Path': 90.015625,
  'Play': 43.21875,
  'Match': 51.015625,
  'Stop Match': 90.015625,
  'Connect': 66.609375,
  'Disconnect': 90.015625,
};
const ROW_HEIGHT_PX = 24;
const COLUMN_1920_PX = 150.5;

let originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect;
let originalGetComputedStyle: typeof window.getComputedStyle;

beforeEach(() => {
  resetWorkspace();
  originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  originalGetComputedStyle = window.getComputedStyle;

  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.classList.contains('engine-controls') && this.classList.contains('toolbar-cluster')) {
      // The component's own root — the live-measured 1920x1080 column
      // `useElementWidth` reads synchronously at `observe()` time.
      return { width: COLUMN_1920_PX, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() { return {}; } } as DOMRect;
    }
    if (this.classList.contains('toolbar-btn')) {
      const label = (this.textContent ?? '').trim();
      const width = LABEL_WIDTH_PX[label] ?? 0;
      return { width, height: ROW_HEIGHT_PX, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() { return {}; } } as DOMRect;
    }
    return originalGetBoundingClientRect.call(this);
  };

  // jsdom does not resolve `gap: var(--space-tight)` to a pixel value —
  // stub only the shadow container's own `columnGap` read (the sole
  // computed-style fact `measureShadow` consults) to the compiled
  // `--space-tight` value (4px), passing every other element through to
  // the real implementation so padding/border reads elsewhere (e.g.
  // `useElementWidth`'s inset calculation) stay accurate (0, in jsdom's
  // default stylesheet-less state). Returns a plain object rather than
  // wrapping the real `CSSStyleDeclaration` in a `Proxy` — that class's
  // native getters throw "Illegal invocation" when read through a proxy
  // receiver, and `measureShadow` reads only `columnGap`.
  window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
    if (el instanceof HTMLElement && el.classList.contains('engine-controls-shadow')) {
      return { columnGap: '4px' } as unknown as CSSStyleDeclaration;
    }
    return originalGetComputedStyle.call(window, el, pseudo);
  }) as typeof window.getComputedStyle;
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  window.getComputedStyle = originalGetComputedStyle;
  document.body.innerHTML = '';
});

function mountReal(isMatchRunning: boolean): VueWrapper {
  return mount(ToolbarEngineControls, {
    props: { isMatchRunning },
    global: { plugins: [i18n] },
  });
}

function realizedForm(wrapper: VueWrapper): 'button-cluster' | 'menu-path' {
  return wrapper.find('.engine-controls-trigger').exists() ? 'menu-path' : 'button-cluster';
}

describe('ToolbarEngineControls.vue — realization form is state-invariant at a fixed column width (W-B2 review MAJOR finding)', () => {
  it('idle (disconnected, no match) resolves to menu-path at the 1920x1080 column — the worst-case-driven baseline', async () => {
    store.engine.status = 'disconnected';
    const wrapper = mountReal(false);
    await wrapper.vm.$nextTick();
    expect(realizedForm(wrapper)).toBe('menu-path');
    wrapper.unmount();
  });

  it('connected-only resolves to the SAME form as idle', async () => {
    store.engine.status = 'connected';
    const wrapper = mountReal(false);
    await wrapper.vm.$nextTick();
    expect(realizedForm(wrapper)).toBe('menu-path');
    wrapper.unmount();
  });

  it('match-running-only resolves to the SAME form as idle', async () => {
    store.engine.status = 'disconnected';
    const wrapper = mountReal(true);
    await wrapper.vm.$nextTick();
    expect(realizedForm(wrapper)).toBe('menu-path');
    wrapper.unmount();
  });

  it("connected + match running (the review's exact traced case) resolves to the SAME form as idle — this is the regression the fix closes", async () => {
    store.engine.status = 'connected';
    const wrapper = mountReal(true);
    await wrapper.vm.$nextTick();
    expect(realizedForm(wrapper)).toBe('menu-path');
    wrapper.unmount();
  });

  it("a single session transitioning idle -> connected -> match-running never changes form (the exact mid-interaction flip the review witnessed)", async () => {
    store.engine.status = 'disconnected';
    const wrapper = mountReal(false);
    await wrapper.vm.$nextTick();
    const idleForm = realizedForm(wrapper);

    // Connect, in place — mirrors clicking Connect mid-session.
    store.engine.status = 'connected';
    await wrapper.vm.$nextTick();
    expect(realizedForm(wrapper)).toBe(idleForm);

    // Start a match, in place — mirrors clicking Match mid-session; this
    // exact transition is what flipped the form pre-fix.
    await wrapper.setProps({ isMatchRunning: true });
    await wrapper.vm.$nextTick();
    expect(realizedForm(wrapper)).toBe(idleForm);

    wrapper.unmount();
  });
});
