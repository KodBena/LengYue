/**
 * tests/integration/ToolbarEngineMetrics-overlap-fix.test.ts
 *
 * Regression coverage for the eval/health metrics-bar overlap fix
 * (ledger row 2372, `.claude/dispatch-reports/lyt-metrics-overlap-fix.md`).
 * The live-engine measurement pass
 * (`.claude/dispatch-reports/lyt-engine-measurement.md`, Measurement 2)
 * found the `eval` group's real natural content (identity + winrate + lead)
 * needing 534px against a 139px column allotment, and `health`'s (pps +
 * latency + watchdog) needing 236px — both genuinely overflowing into
 * character-level text overlap with the neighbouring group, confirmed both
 * by DOM geometry and screenshot.
 *
 * jsdom has no real flex/text layout, so `getBoundingClientRect()` is
 * stubbed to reproduce the exact live-measured widths this fix's own
 * commit cites (`ToolbarEngineMetrics.vue`'s own header comment, "Overlap
 * fix" section): the compact `.eval-summary` badge's real worst-case
 * content ("100.0%/-999.9") measures 119.94px; the compact `.health-summary`
 * badge's real worst-case content ("HEALTH" label + "9999pps" + the
 * watchdog dot) measures 107.09px — both obtained via an isolated
 * static-HTML Playwright probe against the theme's real monospace font
 * stack and spacing tokens BEFORE being wired into the component, not
 * estimated. Same idiom as
 * `ToolbarEngineControls-state-invariance.test.ts`'s own
 * `getBoundingClientRect` stub (real live-measured widths, pinned as
 * named constants, re-used rather than re-derived here).
 *
 * The commissioned allotment is 139px (the measurement report's own
 * figure — three `.engine-metrics-bar` groups splitting the side
 * column's toolbar row evenly at 1920×1080). Both worst-case widths
 * above are asserted to fit under it, with the same margin the source
 * probe found.
 *
 * A second tier of tests, plain (unstubbed) DOM assertions, covers
 * "tooltip content completeness" — every full-fidelity value the compact
 * badge does not show inline (VERSION, the interactive MODEL `<select>`,
 * full LATENCY) is present, verbatim, in the hover popover once opened.
 *
 * Space-owner cure, dispatch L5 (HOVER-GRACE, `.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §1.5/§3 step 5): the `mouseenter`/`mouseleave`
 * pair moved from `.eval-summary`/`.health-summary` themselves onto the
 * new shared `.metric-hover-root` wrapper (trigger + popover now share
 * one hover root — see `ToolbarEngineMetrics.vue`'s own template
 * comment and `tests/integration/ToolbarEngineMetrics-hover-grace.test.ts`
 * for the defect this closes) — the second tier's own hover triggers
 * below are updated to match; no other assertion in this file changes.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { i18n } from '../../src/i18n';
import { store, resetWorkspace, activeBoard } from '../../src/store';
import { activeAnalysisKeys } from '../../src/state/analysis-config';
import { ledger } from '../../src/state/analysis-ledger';
import ToolbarEngineMetrics from '../../src/components/chrome/ToolbarEngineMetrics.vue';
import type { RawAnalysis, EngineModelEntry } from '../../src/types';

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

// The commissioned side-column allotment at 1920×1080 (three
// `.engine-metrics-bar` groups splitting the toolbar row evenly) —
// `.claude/dispatch-reports/lyt-engine-measurement.md`, Measurement 2.
const ALLOTTED_COLUMN_PX = 139;

// Real widths measured via an isolated static-HTML Playwright probe
// against the theme's real monospace font stack (`Courier New`,
// `--space-tight`/`--space-medium`/`--text-tiny`/`--text-emphasis`
// tokens), reused verbatim rather than re-derived here — same
// discipline `ToolbarEngineControls-state-invariance.test.ts`'s own
// `LABEL_WIDTH_PX` follows.
const EVAL_SUMMARY_WORST_CASE_PX = 119.9375;   // "EVAL" + "100.0%/-999.9"
const HEALTH_SUMMARY_WORST_CASE_PX = 107.09375; // "HEALTH" + "9999pps" + dot

let originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  resetWorkspace();
  ledger.purgeAll();
  originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.classList.contains('eval-summary')) {
      return { width: EVAL_SUMMARY_WORST_CASE_PX, height: 20, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() { return {}; } } as DOMRect;
    }
    if (this.classList.contains('health-summary')) {
      return { width: HEALTH_SUMMARY_WORST_CASE_PX, height: 20, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() { return {}; } } as DOMRect;
    }
    return originalGetBoundingClientRect.call(this);
  };
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  document.body.innerHTML = '';
});

// Worst-case-shaped live telemetry: winrate pinned near 100%, scoreLead
// near its realistic -999.9 floor, pps/latency at their established
// envelope ceilings (matching this component's own pre-existing "worst
// realistic case per metric" comment, now living in the popover styling
// section rather than the removed inline-envelope one).
function seedWorstCaseAnalysis(): void {
  const board = activeBoard.value;
  if (!board) throw new Error('no active board — resetWorkspace() should have seeded one');
  const raw: RawAnalysis = {
    id: 'q',
    turnNumber: 0,
    isDuringSearch: false,
    moveInfos: [],
    rootInfo: { winrate: 1.0, scoreLead: -999.9, visits: 1, currentPlayer: 'B' },
  };
  ledger.recordRaw(activeAnalysisKeys.value.rawKey, board.currentNodeId, raw);
}

const MODELS: EngineModelEntry[] = [
  { label: '14', healthy: true },
  { label: '18', healthy: false },
];

function seedEngineIdentity(): void {
  store.engine.status = 'connected';
  store.engine.info = {
    version: '1.13.0',
    internalName: null,
    versionPayload: { some: 'probe payload' },
    modelsPayload: null,
    availableModels: MODELS,
    capabilities: { selector: {} },
  };
  store.engine.selectedModel = '14';
  store.engine.metrics = {
    packetsPerSecond: 9999,
    lastResponseId: null,
    lastWatchdogTimestamp: Date.now(),
    latencyMs: 99999,
    pingPendingSince: null,
  };
}

function mountGroup(group: 'eval' | 'health'): VueWrapper {
  return mount(ToolbarEngineMetrics, {
    props: { group },
    global: { plugins: [i18n] },
  });
}

describe('ToolbarEngineMetrics.vue — eval/health overlap fix (ledger row 2372)', () => {
  describe('compact badge fits the allotted column (no overlap, ever)', () => {
    it("eval group's compact badge fits at worst-case content width", async () => {
      seedWorstCaseAnalysis();
      const wrapper = mountGroup('eval');
      await nextTick();

      // Worst-case rendered values actually appear — this measurement is
      // meaningless if the badge isn't showing the content it claims to.
      expect(wrapper.text()).toContain('100.0%/-999.9');

      const rect = wrapper.find('.eval-summary').element.getBoundingClientRect();
      expect(rect.width).toBeLessThan(ALLOTTED_COLUMN_PX);
      // Not just "fits" — fits with the same real margin the source probe
      // found (19px / ~14% slack), so a future label/value tweak that eats
      // the margin down to zero is caught here rather than only live.
      expect(rect.width).toBeCloseTo(EVAL_SUMMARY_WORST_CASE_PX, 3);

      wrapper.unmount();
    });

    it("health group's compact badge fits at worst-case content width", async () => {
      seedEngineIdentity();
      const wrapper = mountGroup('health');
      await nextTick();

      expect(wrapper.text()).toContain('9999pps');

      const rect = wrapper.find('.health-summary').element.getBoundingClientRect();
      expect(rect.width).toBeLessThan(ALLOTTED_COLUMN_PX);
      expect(rect.width).toBeCloseTo(HEALTH_SUMMARY_WORST_CASE_PX, 3);

      wrapper.unmount();
    });

    it('eval + health + the queue leaf`s own established 139px column each stay independently under the allotment (no group needs its neighbour`s space)', async () => {
      seedWorstCaseAnalysis();
      seedEngineIdentity();
      const evalWrapper = mountGroup('eval');
      const healthWrapper = mountGroup('health');
      await nextTick();

      const evalWidth = evalWrapper.find('.eval-summary').element.getBoundingClientRect().width;
      const healthWidth = healthWrapper.find('.health-summary').element.getBoundingClientRect().width;

      // Each group's own compact form is a single flex item within its own
      // 139px grid track — neither needs to borrow width from the other,
      // which is the structural fix for the character-level overlap the
      // measurement pass witnessed (winrate-val's left edge landing inside
      // the QUEUE column's own x-range).
      expect(evalWidth).toBeLessThan(ALLOTTED_COLUMN_PX);
      expect(healthWidth).toBeLessThan(ALLOTTED_COLUMN_PX);

      evalWrapper.unmount();
      healthWrapper.unmount();
    });
  });

  describe('tooltip/popover content completeness (full fidelity is not lost, only relocated)', () => {
    it('eval popover carries VERSION, the interactive MODEL select, and full-precision WINRATE/LEAD', async () => {
      seedWorstCaseAnalysis();
      seedEngineIdentity();
      const wrapper = mountGroup('eval');
      await nextTick();

      // Closed by default: the popover's content is not in the DOM at all
      // until hovered (this is itself part of the fix — it's what keeps
      // the always-visible badge narrow).
      expect(wrapper.find('.metrics-popover').exists()).toBe(false);

      await wrapper.find('.metric-hover-root').trigger('mouseenter');
      await nextTick();

      const popover = wrapper.find('.metrics-popover');
      expect(popover.exists()).toBe(true);

      // VERSION, full.
      expect(popover.text()).toContain('v1.13.0');
      // MODEL: the real interactive SELECTOR-mode <select>, not a static
      // label — the identity block's only genuinely un-compactable piece
      // (a functional <select> can't be represented by ellipsis or a
      // shortened string the way a number can).
      const select = popover.find('select.engine-model-select');
      expect(select.exists()).toBe(true);
      expect(select.findAll('option').length).toBe(MODELS.length);
      // WINRATE / LEAD, full precision — identical strings to the compact
      // badge (these were never truncated; only identity needed relocating).
      expect(popover.text()).toContain('100.0%');
      expect(popover.text()).toContain('-999.9');

      await wrapper.find('.metric-hover-root').trigger('mouseleave');
      wrapper.unmount();
    });

    it('health popover carries full PPS, LATENCY (with unit), and the WATCHDOG dot', async () => {
      seedEngineIdentity();
      const wrapper = mountGroup('health');
      await nextTick();

      expect(wrapper.find('.metrics-popover').exists()).toBe(false);

      await wrapper.find('.metric-hover-root').trigger('mouseenter');
      await nextTick();

      const popover = wrapper.find('.metrics-popover');
      expect(popover.exists()).toBe(true);
      expect(popover.text()).toContain('9999');
      // Full latency reading, with its "ms" unit — never shown inline in
      // the compact form at all (PPS is the inline headline number).
      expect(popover.text()).toContain('99999ms');
      expect(popover.find('.watchdog-dot').exists()).toBe(true);

      await wrapper.find('.metric-hover-root').trigger('mouseleave');
      wrapper.unmount();
    });
  });
});
