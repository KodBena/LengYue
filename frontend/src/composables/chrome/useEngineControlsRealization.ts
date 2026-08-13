/**
 * src/composables/chrome/useEngineControlsRealization.ts
 *
 * Finish-pass wave B2 (F2 + W-B1's adjacent 420px finding — see
 * `state/engine-controls-realization.ts`'s own header for the full
 * citation chain). Vue wiring around that module's pure decision:
 * measures the WORST-CASE engine-controls button widths and the REAL
 * column width live, and exposes the resulting realization form
 * (`button-cluster` | `menu-path`) as a reactive ref.
 *
 * ── State-invariance correction (W-B2 review MAJOR finding, 2026-08-13) ──
 * The first cut of this composable measured the REAL, currently-
 * rendered labels (Connect/Disconnect, Match/Stop Match) instead of a
 * worst-case, which meant the realization form was a function of
 * ENGINE STATE as well as column width: connecting, or starting a
 * match while connected, widened the measured content and could flip
 * `button-cluster` to `menu-path` mid-interaction. Traced by the
 * review: 1920x1080's 150.5px column fits the cluster at idle (3
 * rows/80px, exact), but connected+match-running needs 4 rows/108px —
 * so starting a match yanked the five-button cluster into a menu right
 * under the user's pointer
 * (`.claude/dispatch-reports/lyt-wB2-controls-menu-review.md` §1).
 *
 * The fix makes the measurement STATE-INVARIANT: the shadow clone
 * (below) renders BOTH label variants for every button whose label
 * can change with state (`toolbar.match`/`toolbar.stopMatch`,
 * `toolbar.connect`/`toolbar.disconnect`) unconditionally, each
 * tagged with a `data-slot` identifying which visible-cluster button
 * it stands in for. `measureShadow` groups by `data-slot` and keeps
 * the WIDER measured width per slot — the worst-case label the
 * component's OWN label logic can ever produce for that slot, derived
 * from the live DOM rather than a hand-maintained string table (so it
 * cannot drift out of sync with `toolbar.*` translations, and stays
 * honest under i18n: each locale's own longest variant is what gets
 * measured, because the shadow renders through the same `t()` calls
 * the visible buttons use). `itemWidthsPx` — and therefore `form` — is
 * now a pure function of column width and the ACTIVE LOCALE's worst-
 * case label set; no engine/match state reads flow into the
 * measurement at all, so a state change can no longer be the cause of
 * a form flip. Flipping becomes unrepresentable, not merely unlikely.
 *
 * **Consequence, stated honestly (not glossed over the way the
 * review's predecessor disclosure was faulted for):** the worst-case
 * arithmetic at 1920x1080's own 150.5px column needs 4 rows (108px),
 * which exceeds the compiled 80px reservation — so this fix selects
 * `menu-path` at 1920x1080 EVEN AT IDLE, not only once connected/
 * matching. That is the deliberate stable-form trade this correction
 * takes: a column width too narrow to hold the cluster's own worst
 * case can never show a cluster that later vanishes out from under an
 * active session — it simply never shows a cluster there at all,
 * until the column widens. A parallel model-side wave is authoring a
 * 184px controls floor for `A_engine_controls`'s own reservation/
 * column that would widen 1920x1080's column past the worst-case need
 * and restore `button-cluster` there; this composable requires no
 * coordination with that wave to compose correctly — `form` is a pure
 * function of measured column width vs. worst-case cluster need, so
 * the moment the column widens past the need, the cluster form
 * realizes on its own.
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
 *   2. The WORST-CASE button widths — a permanently-mounted, visually
 *      hidden "shadow" clone (`position: fixed; visibility: hidden`,
 *      off-screen, unconstrained width, `flex-wrap: nowrap` so it never
 *      itself wraps) carrying BOTH label variants for every
 *      state-varying button, each tagged `data-slot="..."` naming which
 *      visible-cluster slot it stands in for. `measureShadow` takes the
 *      max rendered width per slot, in first-appearance (= visible
 *      cluster DOM) order — see the state-invariance section above.
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
 * locale change — driven by this composable's own `labelsKey` watcher —
 * can ever change its size; engine/match STATE changes no longer touch
 * the shadow's measured content at all).
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
 * @param labelsKey A ref identifying the label set the shadow clone
 *   renders — the ACTIVE LOCALE alone is sufficient now (state-
 *   invariance correction, see this file's own header): every
 *   state-varying label pair (match/stop-match, connect/disconnect)
 *   is rendered unconditionally in the shadow, so no engine/match
 *   state feeds this key. Changing it re-measures the shadow on the
 *   next DOM flush.
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

  // Groups the shadow's own buttons by `data-slot` (one slot per
  // visible-cluster button; state-varying slots carry TWO shadow
  // buttons, one per label variant) and keeps the WIDER measured width
  // per slot — the worst case the component's own label logic can ever
  // produce for that slot, derived from the live DOM rather than a
  // hand-maintained constant table. Slot order follows first
  // appearance in the shadow's own DOM order, which matches the
  // visible cluster's DOM order (mint-card, learn-path, play, match,
  // engine) by construction (see the template below).
  function measureShadow(): void {
    if (!shadowEl) return;
    const buttons = Array.from(shadowEl.querySelectorAll<HTMLElement>('.toolbar-btn'));
    if (buttons.length === 0) return;
    const maxWidthBySlot = new Map<string, number>();
    const slotOrder: string[] = [];
    for (const b of buttons) {
      const slot = b.dataset.slot;
      if (!slot) continue; // defensive: every shadow button carries data-slot (see template)
      const w = b.getBoundingClientRect().width;
      const prevMax = maxWidthBySlot.get(slot);
      if (prevMax === undefined) slotOrder.push(slot);
      if (prevMax === undefined || w > prevMax) maxWidthBySlot.set(slot, w);
    }
    // `as number`: every entry in `slotOrder` was just pushed into
    // `maxWidthBySlot` in the loop above (the two are kept in lockstep),
    // so the lookup can never miss — `Map.get`'s own `| undefined`
    // return type is a general signature, not evidence of a real gap here.
    itemWidthsPx.value = slotOrder.map((slot) => maxWidthBySlot.get(slot) as number);
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
