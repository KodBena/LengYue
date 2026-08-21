/**
 * tests/integration/lyt-root-split-live.test.ts
 *
 * GAP A (`.claude/dispatch-reports/lyt-cure-final-repair.md`, ledger rows
 * 2502/2503): end-to-end proof that App.vue's own root-split live solve
 * (`rootSplitLayout`, `App.vue`, consuming `resolveRootSplitLiveLayout`,
 * `src/state/feasible-layout.ts`) reaches the ACTUAL rendered CSS Grid
 * track — not just the pure function in isolation
 * (`tests/unit/state/feasible-layout.test.ts` covers that). Mounts the
 * FULL `App.vue` tree (same preamble as `App-boot.test.ts`, read in full
 * before authoring this file) and reads `#split-workspace`'s own
 * `grid-template-columns` inline style directly, asserting the side
 * column's (root child "2") own resolved track literal matches the
 * pure-function acceptance arithmetic exactly.
 *
 * jsdom performs no real CSS Grid layout — `#tree-control-wrapper`'s own
 * rendered `getBoundingClientRect()` therefore stays at jsdom's default
 * (all-zero) regardless of what the grid track SAYS, which is why this
 * suite reads the TRACK LITERAL (the string App.vue computed and wrote
 * into the style attribute) rather than a post-layout measurement — the
 * same limitation `App-boot.test.ts`'s own existing 1920x1080 test lives
 * with (its own `#control-panel [role="tablist"]` presence assertion is
 * driven by `resolveSideColumnLiveLayout`'s "not yet measured" branch,
 * never by a genuine live wrapper-width reading, since jsdom never
 * measures `#tree-control-wrapper` for real either). Disclosed here
 * rather than silently assumed: this suite proves the ROOT split's own
 * value reaches the grid style correctly; it does NOT re-prove the
 * INTERIOR (tree/controlPanel) resolution downstream of it, which
 * `App-boot.test.ts` and the `feasible-layout` unit suites already cover
 * on their own terms.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';

vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});
vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});
vi.mock('../../src/services/backend-service', async () => {
  const { fakeBackendService } = await import('../fakes/backend-service');
  return { backendService: fakeBackendService };
});
vi.mock('../../src/composables/cards/useCardThumbnail', () => ({
  clearCardThumbnailCache: vi.fn(),
  getCardThumbnailSync: vi.fn(() => ''),
}));
vi.mock('../../src/composables/cards/useThumbnailCache', () => ({
  useThumbnailCache: () => ({ warmPath: vi.fn() }),
}));
vi.mock('../../src/composables/cards/thumbnail-render-resources', () => ({
  purgeBoardThumbnails: vi.fn(),
  purgeAllThumbnails: vi.fn(),
}));
vi.mock('../../src/composables/cards/board-card-trees', () => ({
  removeBoardCardTree: vi.fn(),
  clearAllBoardCardTrees: vi.fn(),
  getOrCreateBoardCardTree: vi.fn(),
  getBoardCardTree: vi.fn(() => null),
}));

import App from '../../src/App.vue';
import { i18n } from '../../src/i18n';
import { store, resetWorkspace } from '../../src/store';
import { fakeBackendService, resetFakeBackendService } from '../fakes/backend-service';
import { installRenderEnvStubs, removeRenderEnvStubs } from './render-count/jsdom-stubs';
import { withSetup } from './with-setup';
import { useResizablePanel } from '../../src/composables/chrome/useResizablePanel';

class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function stubSplitWorkspaceRect(widthPx: number, heightPx: number): void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this.id === 'split-workspace') {
      return {
        width: widthPx, height: heightPx, top: 0, left: 0,
        right: widthPx, bottom: heightPx, x: 0, y: 0, toJSON() {},
      } as DOMRect;
    }
    return original.call(this);
  };
}

let restoreGBCR: typeof Element.prototype.getBoundingClientRect;
let restoreFetch: typeof globalThis.fetch;

beforeEach(() => {
  resetWorkspace();
  resetFakeBackendService();
  fakeBackendService.getTags.mockResolvedValue([]);
  installRenderEnvStubs();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = NoopResizeObserver;
  restoreGBCR = Element.prototype.getBoundingClientRect;
  restoreFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('network disabled in lyt-root-split-live test'))) as typeof fetch;
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = restoreGBCR;
  globalThis.fetch = restoreFetch;
  removeRenderEnvStubs();
});

describe('App.vue — root-split live track (GAP A: rootSplitLayout reaches the rendered grid-template-columns)', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
  });

  // Ledger row 2511 allocation repair (UI shoddiness audit S1/S2/S3/S10):
  // the compiled `sideColumn.maxPx` (820) no longer clamps the side
  // column's natural yield — see `feasible-layout.test.ts`'s own updated
  // acceptance table for the full rationale. 880 is the new natural
  // yield at 1920x1080 (1908 available - 1028 board useful).
  it('1920x1080, default content: root child "2" (the side column) resolves to 880px in the rendered grid track — its own natural yield, no longer clamped at the compiled 820 ceiling', async () => {
    stubSplitWorkspaceRect(1920, 1080);
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('.reb-overlay').exists()).toBe(false);
    const style = wrapper.find('#split-workspace').attributes('style') ?? '';
    expect(style).toContain('880px');
  });

  // Row 2511 allocation repair (S1, the UI shoddiness audit's own
  // central/CRITICAL case, `.claude/dispatch-reports/
  // ui-shoddiness-audit-2026-08-21.md`): the side column's own NATURAL
  // yield at 1366x768 is 638px (below controlPanel's 778px docking
  // demand — see `feasible-layout.test.ts`'s own pure-function pin of
  // that raw fact). Pre-repair, that undocked the ENTIRE control panel
  // into the summon overlay — covering the board — at exactly this,
  // the most common laptop resolution. The board can honestly spare the
  // remaining 140px and stay far above its own floor (300, vs.
  // 716-140=576 remaining useful), so it now yields them: the panel
  // DOCKS at 1366x768.
  it('1366x768, default content: root child "2" resolves to 778px — the board yields the gap between its natural yield (638) and the panel-docking demand, so the panel DOCKS instead of undocking into the summon overlay (S1 repair)', async () => {
    stubSplitWorkspaceRect(1366, 768);
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('.reb-overlay').exists()).toBe(false);
    const style = wrapper.find('#split-workspace').attributes('style') ?? '';
    expect(style).toContain('778px');
    // The docked panel, not the summon overlay: the audit's own central
    // acceptance bar.
    expect(wrapper.find('#control-panel-summon-btn').exists()).toBe(false);
    expect(wrapper.find('#control-panel [role="tablist"]').exists()).toBe(true);
  });

  it('2560x1080, default content: root child "2" again resolves to its own natural yield, 1520px — genuine extra width at a wider monitor is no longer converted to void past the old 820 cap (S10)', async () => {
    stubSplitWorkspaceRect(2560, 1080);
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('.reb-overlay').exists()).toBe(false);
    const style = wrapper.find('#split-workspace').attributes('style') ?? '';
    expect(style).toContain('1520px');
  });

  it('sovereign: a dragged treeControlRegionWidthPx still wins verbatim in the rendered track, unaffected by the root-split live solve', async () => {
    stubSplitWorkspaceRect(1920, 1080);
    store.session.ui.treeControlRegionWidthPx = 500;
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('.reb-overlay').exists()).toBe(false);
    const style = wrapper.find('#split-workspace').attributes('style') ?? '';
    expect(style).toContain('500px');
    expect(style).not.toContain('880px');
  });

  it('portrait: no root-split override applies (landscape-only, disclosed narrowing) — mounts cleanly, no throw from rootSplitLayout\'s own guard', async () => {
    stubSplitWorkspaceRect(400, 900);
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('.reb-overlay').exists()).toBe(false);
  });

  // Final re-witness finding 1 (`.claude/dispatch-reports/
  // lyt-cure-live-witness.md`, item A1): a real session with `boardRail`
  // genuinely visible (a real, if unusual, persisted preference — NOT the
  // compiled default) used to resolve the side column to 700px with a
  // STALE, separately-measured interior wrapper width, rendering
  // controlPanel un-demoted (664px) inside a 700px box — 808px of
  // content silently clipped. That half of the fix ("resolved ==
  // rendered": the outer track literal equals the resolver's own
  // output, and the interior solve is fed the SAME number) is UNCHANGED
  // and still pinned below.
  //
  // Row 2511 allocation repair (S1, the audit's own central case): 700
  // is the side column's own NATURAL yield at this geometry (after
  // boardRail's 180px reservation) — 22px short of `controlPanel`'s own
  // 778px docking demand. Pre-repair, that 22px shortfall demoted the
  // panel into the summon overlay even though the board could honestly
  // spare those 22px and stay far above its own floor. Post-repair, the
  // board yields exactly that much: the side column now resolves to
  // 778, the panel DOCKS, and no content is clipped OR forced into the
  // overlay — this test now pins the FIXED outcome, not the demoted one.
  it('boardRail visible (a real, non-default sibling): the board yields the last 22px so controlPanel DOCKS instead of demoting or overflowing (S1 repair)', async () => {
    stubSplitWorkspaceRect(1920, 1080);
    store.session.ui.lytPresence = { ...store.session.ui.lytPresence, boardRail: true };
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('.reb-overlay').exists()).toBe(false);

    // Resolved == rendered: boardUsefulPx (1028) unchanged; boardRail's
    // own reservation (168px fixed + 12px gap = 180) subtracts from
    // availableForSplitPx (1920-180-12=1728), whose natural yield
    // (1728-1028=700) is then floored up to controlPanel's own 778px
    // docking demand — the board yielding the last 22px rather than the
    // panel demoting for want of them.
    const outerStyle = wrapper.find('#split-workspace').attributes('style') ?? '';
    expect(outerStyle).toContain('168px'); // boardRail's own fixed track, genuinely present
    expect(outerStyle).toContain('778px'); // the side column, resolved AND rendered — floored to the docking demand

    // The interior solve, fed the SAME 778px: controlPanel's own
    // compiled demote threshold is exactly 778px (tree 110 + gap 4 +
    // panel 664) — 778 >= 778 docks it, per the compiled program's own
    // >= semantics.
    expect(wrapper.find('#resizer-inner').exists()).toBe(true);
    expect(wrapper.find('#control-panel-summon-btn').exists()).toBe(false);
    expect(wrapper.find('#control-panel [role="tablist"]').exists()).toBe(true);

    // No content wider than the resolved box: the wrapper's own inline
    // track list must sum (plus its own row gaps) to AT MOST 778px —
    // the direct, DOM-level proof that nothing overflows its own cell.
    const wrapperStyle = wrapper.find('#tree-control-wrapper').attributes('style') ?? '';
    const trackMatch = wrapperStyle.match(/grid-template-columns:\s*([^;]+);/);
    expect(trackMatch).not.toBeNull();
    const trackPxValues = [...(trackMatch?.[1] ?? '').matchAll(/(\d+)px/g)].map((m) => Number(m[1]));
    const gapMatch = wrapperStyle.match(/column-gap:\s*(\d+)px/);
    const gapPx = gapMatch ? Number(gapMatch[1]) : 0;
    const gapsCount = Math.max(0, trackPxValues.length - 1);
    const totalPx = trackPxValues.reduce((a, b) => a + b, 0) + gapsCount * gapPx;
    expect(totalPx).toBeLessThanOrEqual(778);
  });
});

// ── Final re-witness finding 2 (`.claude/dispatch-reports/
//    lyt-cure-live-witness.md`, item A2b): resizing a MOUNTED landscape
//    session down to portrait dimensions, without a reload, left
//    `#split-workspace`'s own inline `grid-template-columns` FROZEN at
//    landscape's shape — a fresh portrait boot was fine, but the SAME
//    page crossing the landscape/portrait threshold live was not. A
//    controllable `ResizeObserver` fake (mirrors
//    `useDeferredContainerBreakpoint.test.ts`'s own established pattern
//    — jsdom's stub never invokes its callback, useless for driving a
//    live-resize scenario) simulates the real ResizeObserver firing
//    `useResizablePanel.ts`'s own row-dimension callback after the DOM
//    rect changes, the same two-step (rect stub update, then observer
//    fire) a real browser's layout-then-notify sequence performs.
describe('App.vue — live resize across the landscape/portrait threshold (no reload)', () => {
  class ControllableResizeObserver {
    static instances: ControllableResizeObserver[] = [];
    callback: ResizeObserverCallback;
    observed: Element[] = [];
    constructor(cb: ResizeObserverCallback) {
      this.callback = cb;
      ControllableResizeObserver.instances.push(this);
    }
    observe(el: Element): void {
      this.observed.push(el);
    }
    unobserve(): void {}
    disconnect(): void {}
    fire(): void {
      this.callback([] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
    }
  }

  function fireObserverFor(id: string): void {
    const inst = ControllableResizeObserver.instances.find((o) => o.observed.some((el) => (el as HTMLElement).id === id));
    if (!inst) throw new Error(`no ResizeObserver observes #${id}`);
    inst.fire();
  }

  let wrapper: VueWrapper | null = null;
  let restoreRO: unknown;

  beforeEach(() => {
    restoreRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    ControllableResizeObserver.instances = [];
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ControllableResizeObserver;
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = restoreRO;
  });

  it('resizing a mounted, docked 1920x1080 session down to 480x900 (no reload) reactively swaps to the portrait grid shape — landscape\'s column tracks and grid-auto-flow are gone', async () => {
    stubSplitWorkspaceRect(1920, 1080);
    wrapper = mount(App, { attachTo: document.body, global: { plugins: [i18n] } });
    await flushPromises();

    const landscapeStyle = wrapper.find('#split-workspace').attributes('style') ?? '';
    expect(landscapeStyle).toContain('grid-auto-flow: column');
    expect(landscapeStyle).toContain('880px'); // the docked side-column track's natural yield (row 2511 repair — see the file's own header)

    // Live resize, no reload: update the stubbed rect, then fire the SAME
    // ResizeObserver callback `useResizablePanel.ts`'s own `attachRowObserver`
    // registered — the real browser's own notify-after-layout sequence.
    stubSplitWorkspaceRect(480, 900);
    fireObserverFor('split-workspace');
    await flushPromises();
    await nextTick();

    const portraitStyle = wrapper.find('#split-workspace').attributes('style') ?? '';
    expect(portraitStyle).toContain('grid-auto-flow: row');
    expect(portraitStyle).not.toContain('grid-auto-flow: column');
    expect(portraitStyle).not.toContain('880px');
    // The docked-panel affordance (#resizer-inner, only rendered when
    // genuinely docked) must be gone too — portrait's own program demotes
    // controlPanel by default (repetition-first).
    expect(wrapper.find('#resizer-inner').exists()).toBe(false);
    expect(wrapper.find('#control-panel-summon-btn').exists()).toBe(true);
  });
});

// ── reattachObservers() — the composable-level unit of finding 2 ────────
//
// `useResizablePanel.ts`'s own doc for `attachRowObserver`/
// `attachWrapperObserver` names the precise mechanism: a screen-class
// swap replaces `#tree-control-wrapper`'s own underlying DOM element
// (the RECURSIVE `<LytNode>` structure along that path is torn down and
// rebuilt with a different shape), orphaning a `ResizeObserver` still
// watching the OLD, now-detached node. This suite drives the composable
// directly (mirrors `resizer-restore-clamp.test.ts`'s own established
// `withSetup` idiom, read in full before authoring this block) with a
// CONTROLLABLE `ResizeObserver` fake and a literal element SWAP —
// jsdom's real DOM replacement, not a simulation of one — proving
// `reattachObservers()` recovers a correct reading from the NEW element
// rather than staying frozen on the orphaned one.
describe('useResizablePanel — reattachObservers() recovers from a DOM element identity change (row 2502/2503 review repair, finding 2)', () => {
  class ControllableResizeObserver {
    static instances: ControllableResizeObserver[] = [];
    callback: ResizeObserverCallback;
    observed: Element[] = [];
    disconnected = false;
    constructor(cb: ResizeObserverCallback) {
      this.callback = cb;
      ControllableResizeObserver.instances.push(this);
    }
    observe(el: Element): void {
      this.observed.push(el);
    }
    unobserve(): void {}
    disconnect(): void {
      this.disconnected = true;
    }
  }

  function mountRect(id: string, widthPx: number, heightPx: number): HTMLDivElement {
    const el = document.createElement('div');
    el.id = id;
    el.getBoundingClientRect = () =>
      ({ width: widthPx, height: heightPx, top: 0, left: 0, right: widthPx, bottom: heightPx, x: 0, y: 0, toJSON() {} }) as DOMRect;
    document.body.appendChild(el);
    return el;
  }

  let restoreRO: unknown;

  beforeEach(() => {
    resetWorkspace();
    restoreRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    ControllableResizeObserver.instances = [];
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ControllableResizeObserver;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = restoreRO;
  });

  it('a fresh #tree-control-wrapper element (same id, new node — what a screen-class swap produces) is picked up by reattachObservers(), not left stuck on the detached original', () => {
    mountRect('split-workspace', 1920, 1080);
    const originalWrapper = mountRect('tree-control-wrapper', 820, 300);
    const panel = withSetup(() => useResizablePanel());

    expect(panel.sideColumnWidthPx.value).toBe(820);
    const [rowObs, wrapperObs] = ControllableResizeObserver.instances;
    expect(wrapperObs.observed).toEqual([originalWrapper]);

    // Simulate the class-swap DOM replacement: the OLD wrapper detaches,
    // a NEW one (same id, a genuinely different node, a DIFFERENT width —
    // portrait's own tree-row shape) takes its place.
    originalWrapper.remove();
    const newWrapper = mountRect('tree-control-wrapper', 345, 900);

    // Before reattaching: the stale observer never fires again (nothing
    // in this fake calls its callback), so the reading would otherwise
    // stay frozen at the detached element's own last value.
    expect(panel.sideColumnWidthPx.value).toBe(820);

    panel.reattachObservers();

    expect(panel.sideColumnWidthPx.value).toBe(345); // recovered, from the NEW live element
    expect(wrapperObs.disconnected).toBe(true); // the stale observer was torn down, not merely abandoned
    const newWrapperObs = ControllableResizeObserver.instances.at(-1)!;
    expect(newWrapperObs.observed).toEqual([newWrapper]);

    // The row observer's own element (#split-workspace) never changed
    // identity in this scenario — reattachObservers() is a genuine no-op
    // for it (no new instance constructed, no disconnect).
    expect(rowObs.disconnected).toBe(false);
    expect(ControllableResizeObserver.instances.filter((o) => o.observed.includes(rowObs.observed[0]))).toHaveLength(1);
  });

  it('idempotent when nothing moved: calling reattachObservers() with no DOM change constructs no new observer and disconnects nothing', () => {
    mountRect('split-workspace', 1920, 1080);
    mountRect('tree-control-wrapper', 820, 300);
    const panel = withSetup(() => useResizablePanel());

    const countBefore = ControllableResizeObserver.instances.length;
    panel.reattachObservers();
    const countAfter = ControllableResizeObserver.instances.length;

    expect(countAfter).toBe(countBefore);
    expect(ControllableResizeObserver.instances.some((o) => o.disconnected)).toBe(false);
    expect(panel.sideColumnWidthPx.value).toBe(820);
    expect(panel.rowWidthPx.value).toBe(1920);
  });
});

// ── window 'resize' fallback — row 2504's A2b re-witness (live-rig-only
//    root cause, jsdom-inexpressible; the FIX's own wiring, pinned) ──────
//
// Rig evidence (this dispatch, live browser, three convergent
// reproductions): the PRODUCTION `rowObserver` — a genuine, correctly-
// identified `ResizeObserver` still watching the live `#split-workspace`
// element (verified: same element reference before/after, per a
// `sameElement` DOM-identity check) — stopped delivering resize
// notifications entirely after its initial settle, while a FRESH
// `ResizeObserver` attached to the SAME live element moments before the
// SAME resize event fired normally. `reattachObservers()` (the row
// 2502/2503 fix, tested above) cannot recover from this: it is triggered
// BY `activeScreenClassId` changing, which itself depends on `rowWidthPx`
// — a value only `measureRowDims` (the stuck observer's own callback)
// updates. A catch-22 independent of WHY the specific ResizeObserver
// instance went silent in that browser session — a mechanism jsdom
// cannot reproduce at all (jsdom's `ResizeObserver` never delivers real
// box-size notifications for anything; every suite in this file already
// drives it with a hand-fired fake, per this file's own header).
//
// What IS jsdom-expressible, and pinned here: the FIX's own wiring — a
// plain `window` 'resize' listener that force-remeasures BOTH dimensions
// directly, decoupled from ResizeObserver delivery entirely. This suite
// uses a ResizeObserver fake that NEVER fires (mirrors the live
// regression's own symptom — an attached-but-silent observer) and proves
// only the `window` 'resize' event, not any ResizeObserver activity,
// recovers a correct reading.
describe('useResizablePanel — window "resize" fallback recovers when ResizeObserver goes silent (row 2504 A2b live-rig finding)', () => {
  class SilentResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  function mountRect(id: string, widthPx: number, heightPx: number): HTMLDivElement {
    const el = document.createElement('div');
    el.id = id;
    el.getBoundingClientRect = () =>
      ({ width: widthPx, height: heightPx, top: 0, left: 0, right: widthPx, bottom: heightPx, x: 0, y: 0, toJSON() {} }) as DOMRect;
    document.body.appendChild(el);
    return el;
  }

  let restoreRO: unknown;

  beforeEach(() => {
    resetWorkspace();
    restoreRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = SilentResizeObserver;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = restoreRO;
  });

  it('a window "resize" event re-measures #split-workspace and #tree-control-wrapper even though the (silent) ResizeObserver never calls back', () => {
    mountRect('split-workspace', 1920, 1080);
    const wrapperEl = mountRect('tree-control-wrapper', 820, 300);
    const panel = withSetup(() => useResizablePanel());

    expect(panel.rowWidthPx.value).toBe(1920);
    expect(panel.sideColumnWidthPx.value).toBe(820);

    // Live resize, no reload: the DOM box changes (as it genuinely did in
    // the rig — #split-workspace's own getBoundingClientRect().width read
    // 480 directly), but the SilentResizeObserver never invokes its
    // callback — exactly the witnessed live-browser symptom.
    (document.getElementById('split-workspace') as HTMLDivElement).getBoundingClientRect = () =>
      ({ width: 480, height: 900, top: 0, left: 0, right: 480, bottom: 900, x: 0, y: 0, toJSON() {} }) as DOMRect;
    wrapperEl.getBoundingClientRect = () =>
      ({ width: 345, height: 900, top: 0, left: 0, right: 345, bottom: 900, x: 0, y: 0, toJSON() {} }) as DOMRect;

    // Without the fallback, nothing would ever re-measure — pinned
    // negatively first, so this test cannot pass by accident.
    expect(panel.rowWidthPx.value).toBe(1920);

    window.dispatchEvent(new Event('resize'));

    expect(panel.rowWidthPx.value).toBe(480);
    expect(panel.sideColumnWidthPx.value).toBe(345);
  });
});
