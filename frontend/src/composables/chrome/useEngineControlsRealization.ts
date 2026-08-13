/**
 * src/composables/chrome/useEngineControlsRealization.ts
 *
 * Finish-pass wave B2 (F2 + W-B1's adjacent 420px finding — see
 * `state/engine-controls-realization.ts`'s own header for the full
 * citation chain). Vue wiring around that module's pure decision:
 * measures the REAL, currently-rendered engine-controls buttons and the
 * REAL column width live, and exposes the resulting realization form
 * (`button-cluster` | `menu-path`) as a reactive ref.
 *
 * ── Measurement strategy ──────────────────────────────────────────────
 * Two live facts feed the pure decision:
 *
 *   1. The REAL column width — `useElementWidth` (ADR-0012 P1: one home
 *      per fact; no second `ResizeObserver` written here) observing the
 *      component's own root element, which fills 100% of its LYT leaf
 *      cell exactly like `.engine-controls` itself always has (live-
 *      measured, isolated rig, 2026-08-13: `.engine-controls`'s own
 *      `getBoundingClientRect().width` equalled `.lyt-toolbar-strip`'s
 *      at every viewport tested — 150.5px @1920, 201.75px @2560,
 *      107.25px @1280, 102px @420).
 *
 *   2. The REAL button widths — a permanently-mounted, visually hidden
 *      "shadow" clone of the five buttons (`position: fixed; visibility:
 *      hidden`, off-screen, unconstrained width, `flex-wrap: nowrap` so
 *      it never itself wraps), carrying the SAME reactive labels the
 *      visible cluster/menu would show. Measuring the REAL rendered
 *      buttons — rather than the hand-cited worst-case constant table in
 *      `state/engine-controls-realization.ts`
 *      (`ENGINE_CONTROLS_WORST_CASE_BUTTON_WIDTHS_PX`) — keeps the
 *      decision honest under the CURRENT label state specifically:
 *      1920x1080's own idle/disconnected default fits the cluster in its
 *      live 150.5px column (measured 3 rows / 80px, exact fit), but the
 *      worst-case table's own ~184px threshold would force `menu-path`
 *      at 1920x1080 UNCONDITIONALLY — contradicting the commission's own
 *      "1920x1080 and 2560x1440 — cluster form, byte-comparable
 *      rendering to today" requirement. Measuring the real buttons
 *      instead means the decision degrades gracefully if the user later
 *      connects and/or starts a match (wider `Disconnect`/`Stop Match`
 *      labels) at ANY column width, including landscape ones no prior
 *      LYT screenshot witness ever exercised (the engine was dead-pinned
 *      throughout every prior pass) — disclosed as engine-gated/
 *      unjudged in this wave's own report, not screenshot-witnessed,
 *      but structurally covered by this measurement choice.
 *
 * Row height and row gap are ALSO measured live off the shadow clone (a
 * single button's own rendered height; the shadow container's own
 * `getComputedStyle().columnGap`) rather than hardcoded — only the
 * compiled program's own `80px` reservation
 * (`A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX`) is a cited literal, because no
 * DOM fact expresses "the row's OWN reserved track height" independent
 * of this composable's own decision.
 *
 * ── Resource ownership (frontend/CLAUDE.md) ──────────────────────────
 * The only registered resource is `useElementWidth`'s own
 * `ResizeObserver`, released via that composable's own `stop()` — this
 * file just forwards it to `onUnmounted`, mirroring every other
 * `useElementWidth` consumer. The shadow-clone measurement itself uses
 * no observer (its container is unconstrained-width, so nothing but a
 * label change — driven by this composable's own `labelsKey` watcher —
 * can ever change its size).
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance, type Ref } from 'vue';
import { useElementWidth } from './useElementWidth';
import {
  computeClusterNeededHeightPx,
  computeWrappedRowCount,
  resolveEngineControlsRealization,
  A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX,
  type EngineControlsRealizationForm,
} from '../../state/engine-controls-realization';

export interface UseEngineControlsRealizationHandle {
  readonly form: Ref<EngineControlsRealizationForm>;
  /** Bind to the component's own root element: `<div :ref="setRegionEl">`. */
  readonly setRegionEl: (el: Element | ComponentPublicInstance | null) => void;
  /** Bind to the hidden shadow clone's root: `<div :ref="setShadowEl">`. */
  readonly setShadowEl: (el: Element | ComponentPublicInstance | null) => void;
}

/**
 * @param labelsKey A ref combining every reactive button label the
 *   shadow clone renders (locale-driven statics plus the
 *   connect/disconnect and match/stop-match state-driven labels) —
 *   changing it re-measures the shadow on the next DOM flush. Callers
 *   concatenate with a separator the labels themselves cannot contain.
 */
export function useEngineControlsRealization(labelsKey: Ref<string>): UseEngineControlsRealizationHandle {
  const { widthPx: containerWidthPx, observe, stop } = useElementWidth();
  const itemWidthsPx = ref<number[]>([]);
  const rowHeightPx = ref(0);
  const rowGapPx = ref(0);
  let shadowEl: HTMLElement | null = null;

  function setRegionEl(el: Element | ComponentPublicInstance | null): void {
    if (el) observe(el as Element); // DOM: bound only to a plain <div> in this component's template
  }

  function measureShadow(): void {
    if (!shadowEl) return;
    const buttons = Array.from(shadowEl.querySelectorAll<HTMLElement>('.toolbar-btn'));
    if (buttons.length === 0) return;
    itemWidthsPx.value = buttons.map((b) => b.getBoundingClientRect().width);
    rowHeightPx.value = buttons[0].getBoundingClientRect().height;
    rowGapPx.value = parseFloat(getComputedStyle(shadowEl).columnGap) || 0;
  }

  function setShadowEl(el: Element | ComponentPublicInstance | null): void {
    shadowEl = (el as HTMLElement) ?? null; // DOM: bound only to a plain <div> in this component's template
    // The shadow's own children are already patched into the DOM by the
    // time a function-ref fires (Vue sets refs after inserting a node's
    // children) — measure synchronously so the FIRST render already
    // reflects a real decision instead of a one-tick "always cluster"
    // flash (mirrors `useElementWidth`'s own synchronous first read).
    if (shadowEl) measureShadow();
  }

  // `flush: 'post'` — labelsKey changing means a label is about to (or
  // has just) reflow the shadow clone's own DOM; running after the
  // patch reads the UPDATED text, not the stale pre-change one.
  watch(labelsKey, measureShadow, { flush: 'post' });

  onMounted(measureShadow);
  onUnmounted(stop);

  const form = computed<EngineControlsRealizationForm>(() => {
    const rows = computeWrappedRowCount(itemWidthsPx.value, rowGapPx.value, containerWidthPx.value);
    const neededHeightPx = computeClusterNeededHeightPx(rows, rowHeightPx.value, rowGapPx.value);
    return resolveEngineControlsRealization(neededHeightPx, A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX);
  });

  return { form, setRegionEl, setShadowEl };
}
