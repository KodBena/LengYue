/**
 * src/composables/analysis/useDeltaViewMode.ts
 *
 * The three-mode view cycle for the delta-analysis panel
 * (`MergedDeltaPanel.vue`). Commissioned (ledger row 418) to resolve the
 * click-to-navigate ambiguity on the shared overlaid view: black's and
 * white's series occupy the same chart, and a click near where the two
 * visually overlap can read as either colour's move (the piecewise-linear
 * interpolation between a colour's sparse parity-interleaved points draws
 * a line segment through x-values that colour never actually played —
 * see `MergedDeltaPanel.vue`'s header comment). The per-colour modes make
 * click resolution unambiguous by removing the other colour's series from
 * the hit-testable data entirely, not by adding a tie-break rule.
 *
 * `DeltaViewMode` is a closed union (ADR-0000: mode as a type, not a pair
 * of booleans) with a fixed cycle order `shared → black → white → shared`.
 * `seriesForMode` is the pure projection both the chart-series build and
 * the click-dispatch path (`MergedDeltaPanel`'s `colorAt`) read through —
 * a single function, so "which colour is representable" can never drift
 * between what's drawn and what's clickable. In `black` mode `white` maps
 * to `[]`: the wrong-colour series isn't filtered post-hoc at the
 * navigation step, it is structurally absent from the data the click path
 * ever sees (per ADR-0000's "make the illegal state unrepresentable").
 *
 * Persistence follows the `qeuboToolbarView` idiom (`store/schema.ts`'s
 * `UISession`): an optional closed-union field on `session.ui`, seeded by
 * `defaults.ts`, backfilled by a migration for blobs predating the field,
 * and read through a `?? 'shared'` fallback here so an old blob missing
 * the key (pre-migration, or a future rollback scenario) degrades to the
 * documented default rather than throwing. Mode is user-owned UI state,
 * not derived data, so it lives on `session.ui` — the same shelf as every
 * other per-session display toggle (`analysisLayout`, `boardVariations`).
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, type WritableComputedRef } from 'vue';
import { store } from '../../store';
import type { EnrichedSeries } from './useEnrichedData';

/** Closed union — the panel's three view modes. Cycle order below. */
export type DeltaViewMode = 'shared' | 'black' | 'white';

/** Fixed cycle order: shared → black → white → shared. */
export const DELTA_VIEW_MODE_CYCLE: readonly DeltaViewMode[] = ['shared', 'black', 'white'];

/** Human-facing label for the mode-cycle button and its title/aria text. */
export const DELTA_VIEW_MODE_LABEL: Readonly<Record<DeltaViewMode, string>> = {
  shared: 'Shared',
  black: 'Black',
  white: 'White',
};

/** Advance `mode` one step along the fixed cycle order (wraps at the end). */
export function nextDeltaViewMode(mode: DeltaViewMode): DeltaViewMode {
  const idx = DELTA_VIEW_MODE_CYCLE.indexOf(mode);
  return DELTA_VIEW_MODE_CYCLE[(idx + 1) % DELTA_VIEW_MODE_CYCLE.length];
}

/**
 * Whether `color`'s series is representable under `mode`. `shared` shows
 * both; `black` / `white` show only their own colour. Exported alongside
 * `seriesForMode` because the click-dispatch path (`colorAt`'s candidate
 * check) and the series-build path both need the same yes/no answer —
 * `seriesForMode` is the data-shaped form of this same rule.
 */
export function isColorVisibleInMode(mode: DeltaViewMode, color: 'B' | 'W'): boolean {
  if (mode === 'shared') return true;
  return (mode === 'black' && color === 'B') || (mode === 'white' && color === 'W');
}

/**
 * Project a (black, white) series pair through the view mode. The colour
 * `mode` excludes maps to `[]` — an empty array, not a filtered copy of a
 * present array — so a consumer iterating the result structurally cannot
 * find a data point for the hidden colour. `shared` returns both inputs
 * BY REFERENCE (no copy), which is what makes the shared-mode regression
 * lock ("series config unchanged from today") a reference-equality check
 * rather than a deep-equality one.
 */
export function seriesForMode(
  black: readonly EnrichedSeries[],
  white: readonly EnrichedSeries[],
  mode: DeltaViewMode,
): { black: readonly EnrichedSeries[]; white: readonly EnrichedSeries[] } {
  return {
    black: mode === 'white' ? [] : black,
    white: mode === 'black' ? [] : white,
  };
}

/**
 * The panel's mode as a `WritableComputedRef` over `session.ui.deltaViewMode`
 * (get/set proxy, mirroring `useQeubo`'s `qeuboToolbarView` accessor), plus
 * a `cycle()` mutator that advances it one step. Reading/writing through
 * this accessor — never `store.session.ui.deltaViewMode` directly outside
 * this module — keeps the `?? 'shared'` fallback and the field's single
 * home (ADR-0012) in one place.
 */
export function useDeltaViewMode(): { mode: WritableComputedRef<DeltaViewMode>; cycle: () => void } {
  const mode = computed<DeltaViewMode>({
    get: () => store.session.ui.deltaViewMode ?? 'shared',
    set: (v) => { store.session.ui.deltaViewMode = v; },
  });
  function cycle(): void {
    mode.value = nextDeltaViewMode(mode.value);
  }
  return { mode, cycle };
}
