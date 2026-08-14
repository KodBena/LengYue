/**
 * tests/integration/ToolbarEngineMetrics-hover-grace.test.ts
 *
 * Space-owner cure, dispatch L5 (`.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §1.5/§3 step 5, ledger rows 2447/2484/2499)
 * — HOVER-GRACE, the commissioner's own named acceptance scenario
 * (item 3). Pins the actual defect `useHoverPopover.ts`'s own header
 * ("Space-owner cure, dispatch L5" section) names: pre-dispatch, the
 * `eval`/`health` popovers in `ToolbarEngineMetrics.vue` were DOM
 * SIBLINGS of their own trigger (not descendants of a shared hover
 * root), so a pointer that successfully crossed the visual gap and
 * landed on the popover never renewed the close-grace timer — the
 * popover could close out from under an actively-hovering pointer
 * before the model `<select>` inside it (`EngineModelSelect`) was
 * reachable/clickable. The fix wraps trigger + popover in one
 * `.metric-hover-root` (this component's own template comment).
 *
 * **jsdom honesty note.** jsdom performs no layout and no real pointer
 * hit-testing — it cannot arbitrate "which element is under the
 * pointer" the way a real browser's mouseenter/mouseleave dispatch
 * does. This test therefore dispatches the DOM events a real browser
 * WOULD dispatch at each step of a stepped pointer traversal (several
 * `mousemove` events walking the coordinate space from the trigger's
 * own measured rect to the popover's, per the SAME
 * `getBoundingClientRect` stub idiom
 * `ToolbarEngineMetrics-overlap-fix.test.ts` already uses) plus the
 * `mouseenter`/`mouseleave` pair on `.metric-hover-root` itself — since
 * both the trigger and the popover are descendants of that ONE shared
 * root, a real browser's DOM-ancestry-based dispatch never fires
 * `mouseleave` on the root while the pointer is transiting from one
 * descendant to the other (the root stays in the "entered" chain
 * throughout) — this is the semantic property the fix relies on, and
 * is asserted directly below (no leave/reopen cycle needed to survive
 * the corridor). The grace-timer half (a genuine momentary excursion
 * outside the root, then re-entry before the close delay elapses) is
 * exercised as a SEPARATE, second scenario, matching the composable's
 * own documented purpose ("forgives overshoot," not "never fires").
 * The real-browser witness (an actual mouse-driven Playwright rig
 * confirming the same DOM-ancestry dispatch a real browser performs)
 * is the follow-up rig's job — UNEXERCISED here.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { i18n } from '../../src/i18n';
import { store, resetWorkspace } from '../../src/store';
import ToolbarEngineMetrics from '../../src/components/chrome/ToolbarEngineMetrics.vue';
import { INTERACTION_DISMISS_DELAY_MS } from '../../src/lib/timing';
import type { EngineModelEntry } from '../../src/types';

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

// Trigger/popover rects, stubbed per the SAME idiom
// `ToolbarEngineMetrics-overlap-fix.test.ts` already uses — the trigger
// sits at a plausible toolbar position; the popover (position: fixed,
// `useFixedAnchoredPopover`-placed) sits below and to the left, a real
// visual GAP a pointer must cross to reach the model select inside it.
const TRIGGER_RECT = { top: 20, left: 1780, right: 1900, bottom: 40, width: 120, height: 20 };
const POPOVER_RECT = { top: 44, left: 1700, right: 1900, bottom: 200, width: 200, height: 156 };

let originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  vi.useFakeTimers();
  resetWorkspace();
  originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.classList.contains('eval-summary')) {
      return { ...TRIGGER_RECT, x: TRIGGER_RECT.left, y: TRIGGER_RECT.top, toJSON() { return {}; } } as DOMRect;
    }
    if (this.classList.contains('metrics-popover')) {
      return { ...POPOVER_RECT, x: POPOVER_RECT.left, y: POPOVER_RECT.top, toJSON() { return {}; } } as DOMRect;
    }
    return originalGetBoundingClientRect.call(this);
  };
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const MODELS: EngineModelEntry[] = [
  { label: '14', healthy: true },
  { label: '18', healthy: false },
];

function seedEngineIdentity(): void {
  store.engine.status = 'connected';
  store.engine.info = {
    version: '1.13.0',
    internalName: null,
    versionPayload: null,
    modelsPayload: null,
    availableModels: MODELS,
    capabilities: { selector: {} },
  };
  store.engine.selectedModel = '14';
  store.engine.metrics = {
    packetsPerSecond: 10,
    lastResponseId: null,
    lastWatchdogTimestamp: Date.now(),
    latencyMs: 12,
    pingPendingSince: null,
  };
}

function mountEval(): VueWrapper {
  return mount(ToolbarEngineMetrics, {
    props: { group: 'eval' },
    global: { plugins: [i18n] },
  });
}

/** Walk `steps` intermediate coordinates from `from` to `to`, dispatching
 *  a `mousemove` at each — "STEPPED pointer travel" per the dispatch
 *  brief's own instruction, not a single teleporting jump. Dispatched on
 *  `document` (a real browser's mousemove target regardless of which
 *  element is currently under the pointer); no handler in this
 *  component reads `mousemove` — see this file's own header for why the
 *  meaningful events are `mouseenter`/`mouseleave` on the shared root. */
function stepMouseMove(
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps: number,
): void {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const clientX = from.x + (to.x - from.x) * t;
    const clientY = from.y + (to.y - from.y) * t;
    document.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY, bubbles: true }));
  }
}

describe('ToolbarEngineMetrics.vue — HOVER-GRACE (dispatch L5, commissioner item 3)', () => {
  it('survives stepped pointer travel from trigger to popover; the model select inside stays reachable and clickable', async () => {
    seedEngineIdentity();
    const wrapper = mountEval();
    await nextTick();

    const root = wrapper.find('.metric-hover-root');
    expect(root.exists()).toBe(true);

    // Enter the trigger — popover opens.
    await root.trigger('mouseenter');
    await nextTick();
    expect(wrapper.find('.metrics-popover').exists()).toBe(true);

    // Stepped travel: several intermediate mousemove events walking from
    // the trigger's own centre toward the popover's own centre, crossing
    // the real visual gap between them (TRIGGER_RECT -> POPOVER_RECT).
    const triggerCentre = { x: (TRIGGER_RECT.left + TRIGGER_RECT.right) / 2, y: (TRIGGER_RECT.top + TRIGGER_RECT.bottom) / 2 };
    const popoverCentre = { x: (POPOVER_RECT.left + POPOVER_RECT.right) / 2, y: (POPOVER_RECT.top + POPOVER_RECT.bottom) / 2 };
    stepMouseMove(triggerCentre, popoverCentre, 6);

    // Per this file's own header: because the trigger AND the popover
    // are both descendants of `.metric-hover-root`, a real browser's
    // DOM-ancestry mouseenter/mouseleave dispatch never leaves the root
    // during this transition — no `mouseleave` on root is fired here,
    // and the popover must therefore still be open with no close timer
    // ever having been armed.
    vi.advanceTimersByTime(INTERACTION_DISMISS_DELAY_MS + 50);
    await nextTick();
    expect(wrapper.find('.metrics-popover').exists()).toBe(true);

    // The model select inside is reachable and genuinely interactive —
    // the commissioner's own named target, not merely "the popover div
    // still exists."
    const select = wrapper.find('select.engine-model-select');
    expect(select.exists()).toBe(true);
    expect((select.element as HTMLSelectElement).disabled).toBe(false);
    await select.setValue('18');
    await nextTick();
    expect((select.element as HTMLSelectElement).value).toBe('18');

    wrapper.unmount();
  });

  it('grace corridor: a genuine momentary excursion outside the hover root is forgiven if the pointer returns before the close delay elapses', async () => {
    seedEngineIdentity();
    const wrapper = mountEval();
    await nextTick();

    const root = wrapper.find('.metric-hover-root');
    await root.trigger('mouseenter');
    await nextTick();
    expect(wrapper.find('.metrics-popover').exists()).toBe(true);

    // Genuine excursion: the pointer leaves the root's own DOM subtree
    // entirely (e.g. a momentary real-world overshoot past the popover's
    // own edge) — arms the close timer, matching `useHoverPopover.ts`'s
    // own documented "forgives overshoot" contract.
    await root.trigger('mouseleave');
    // Re-enter BEFORE the close delay elapses — the corridor's grace
    // window doing its job.
    vi.advanceTimersByTime(INTERACTION_DISMISS_DELAY_MS / 2);
    await root.trigger('mouseenter');
    await nextTick();

    // Advance well past the ORIGINAL close delay — the re-entry must
    // have cancelled the pending close, not merely delayed it.
    vi.advanceTimersByTime(INTERACTION_DISMISS_DELAY_MS + 50);
    await nextTick();
    expect(wrapper.find('.metrics-popover').exists()).toBe(true);

    wrapper.unmount();
  });

  it('control: a leave with NO re-entry before the close delay genuinely closes the popover (the grace window is not infinite)', async () => {
    seedEngineIdentity();
    const wrapper = mountEval();
    await nextTick();

    const root = wrapper.find('.metric-hover-root');
    await root.trigger('mouseenter');
    await nextTick();
    expect(wrapper.find('.metrics-popover').exists()).toBe(true);

    await root.trigger('mouseleave');
    vi.advanceTimersByTime(INTERACTION_DISMISS_DELAY_MS + 50);
    await nextTick();
    expect(wrapper.find('.metrics-popover').exists()).toBe(false);

    wrapper.unmount();
  });

  it('Escape dismisses the popover (dispatch L5: the one dismissal channel added so this hover surface satisfies overlayContract()\'s own refusal)', async () => {
    seedEngineIdentity();
    const wrapper = mountEval();
    await nextTick();

    const root = wrapper.find('.metric-hover-root');
    await root.trigger('mouseenter');
    await nextTick();
    expect(wrapper.find('.metrics-popover').exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(wrapper.find('.metrics-popover').exists()).toBe(false);

    wrapper.unmount();
  });
});
