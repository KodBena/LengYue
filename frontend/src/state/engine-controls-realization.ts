/**
 * src/state/engine-controls-realization.ts
 *
 * Finish-pass wave B2 (F2 + W-B1's adjacent finding —
 * `.claude/dispatch-reports/lyt-finish-pass.md` §3 F2: "the Connect
 * button unreachable — rendered inside `.lyt-toolbar-strip` but outside
 * its clip rect"; `.claude/dispatch-reports/lyt-wB1-portrait-priority.md`
 * §STOP-and-report item 3: "`.engine-controls` measured 116px tall
 * against its own 80px reservation at 420px width"). Realizes the
 * ratified `lyt-capability-registry.ts` IR: `A_engine_controls`'s five
 * capabilities (mint-card, open-learn-path, open-play, toggle-match,
 * toggle-engine-connection) switch from the `button-cluster` realization
 * to the ratified SMALL-CLASS `menu-path` realization the moment the
 * measured column width would make the cluster's own wrap need exceed
 * the compiled program's own `80px` reservation.
 *
 * Pure logic only (ADR-0003 band 1 — no Go/engine/SGF vocabulary, no
 * DOM, no Vue reactivity); `composables/chrome/useEngineControlsRealization.ts`
 * is the Vue wiring that feeds this module live-measured facts.
 *
 * ── The compiled reservation ─────────────────────────────────────────
 * `A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX` mirrors the compiled LYT
 * program's own fixed track for the `H(A_engine_controls,
 * A_engine_eval, A_engine_health, A_engine_queue)` row:
 * `src/state/lyt-layout.gen.ts` path "2.0" and
 * `src/state/lyt-layout-portrait.gen.ts` path "4.0", both
 * `{ kind: "fixed", px: 80 }`. That `80` is itself grounded in
 * `research/lyt/encodings/lengyue_landscape.lyt`'s own "ENGINE-ROW
 * HEIGHT RE-GROUNDING" section (live-measured on an isolated rig: 3
 * rows x 24px `.toolbar-btn` min-height + 2 gaps x 4px `--space-tight`
 * = 80). It is duplicated here as a literal rather than imported
 * because reading it programmatically would need a generic
 * compiled-program path-lookup helper no other call site needs yet
 * (ADR-0004 minimal-touch) — if the compiled reservation ever changes,
 * this constant and the two `.gen.ts` sites must be kept in sync by
 * hand, the same as every other cited-but-duplicated compiled constant
 * already in this codebase.
 *
 * License: Public Domain (The Unlicense)
 */

export type EngineControlsRealizationForm = 'button-cluster' | 'menu-path';

/**
 * The compiled LYT program's own fixed reservation for the engine-row
 * split this leaf sits in — see this file's own header for the full
 * citation chain.
 */
export const A_ENGINE_CONTROLS_RESERVED_HEIGHT_PX = 80;

/**
 * Simulates CSS `flex-wrap: wrap`'s own sequential line-breaking:
 * items are placed into the current row in DOM order, using each
 * item's own (unshrunk) width; a new row starts the moment the running
 * row total plus the next item's width (plus one inter-item gap) would
 * exceed the container. This mirrors `.engine-controls`' real
 * line-assignment (CSS Flexbox §9.3, "collect flex items into flex
 * lines") for a set of items that neither grow nor shrink relative to
 * one another while a row is still being assembled — exactly this
 * cluster's own shape (`.toolbar-btn` sets no `flex-grow`; a lone item
 * wider than the container shrinks down to the container's own width
 * and its LABEL text-wraps instead, which changes that item's rendered
 * HEIGHT, not which row it lands on — live-measured worked case:
 * "Mint Card(s)" (105.625px natural) inside a 102px column at 420x880,
 * isolated rig, 2026-08-13; irrelevant to every column width this
 * module's own `resolveEngineControlsRealization` selects
 * `button-cluster` for, since the widest single button measured
 * (105.625px) is always well under this module's own computed
 * `button-cluster` threshold, ~184px).
 *
 * @param itemWidthsPx Each item's own natural (unclamped) rendered
 *   width, in DOM order.
 * @param gapPx        The flex row's own `gap` (used as both the
 *   within-row item gap and the between-row gap, matching
 *   `.engine-controls { gap: var(--space-tight) }`'s single value).
 * @param containerWidthPx The available row width items wrap within.
 */
export function computeWrappedRowCount(
  itemWidthsPx: readonly number[],
  gapPx: number,
  containerWidthPx: number,
): number {
  if (itemWidthsPx.length === 0) return 0;
  let rows = 1;
  let rowWidthPx = itemWidthsPx[0];
  for (let i = 1; i < itemWidthsPx.length; i++) {
    const w = itemWidthsPx[i];
    const needed = rowWidthPx + gapPx + w;
    if (needed > containerWidthPx) {
      rows += 1;
      rowWidthPx = w;
    } else {
      rowWidthPx = needed;
    }
  }
  return rows;
}

/**
 * The total height N wrapped rows of `.toolbar-btn`s need — N row
 * heights plus (N-1) row gaps, matching `.engine-controls`' own CSS
 * `gap` supplying BOTH axes (row-gap and column-gap share one value
 * here, so the same `rowGapPx` this function takes is what
 * `computeWrappedRowCount` above was given as `gapPx`).
 */
export function computeClusterNeededHeightPx(rowCount: number, rowHeightPx: number, rowGapPx: number): number {
  if (rowCount <= 0) return 0;
  return rowCount * rowHeightPx + (rowCount - 1) * rowGapPx;
}

/**
 * The realization decision itself: `menu-path` the moment the
 * cluster's own measured wrap need exceeds the compiled reservation,
 * `button-cluster` otherwise (including exactly-equal — the
 * reservation is not exceeded at equality).
 */
export function resolveEngineControlsRealization(
  neededHeightPx: number,
  reservedHeightPx: number,
): EngineControlsRealizationForm {
  return neededHeightPx > reservedHeightPx ? 'menu-path' : 'button-cluster';
}

/**
 * Live-measured (isolated rig, 2026-08-13), worst-case per-button
 * widths — the WIDER of the two label states each of `Match`/`Connect`
 * can render (`Stop Match` widens `Match`; `Disconnect` widens
 * `Connect`; both measured 90.015625px, coincidentally identical since
 * `.toolbar-btn` uses a monospace font and both alt labels are 10
 * characters).
 *
 * ── State-invariance correction (W-B2 review MAJOR finding, 2026-08-13) ──
 * This table used to be documentation-only: the runtime composable
 * (`useEngineControlsRealization`) measured the REAL, currently-
 * rendered buttons instead, so Connect→Disconnect and Match→Stop Match
 * each changed the measured height and could flip the realization form
 * MID-INTERACTION (witnessed: 1920x1080's 150.5px column fits the
 * cluster at idle — 3 rows/80px — but needs 4 rows/108px the instant a
 * match starts while connected, yanking the five-button cluster into a
 * menu under the user's pointer). The runtime composable now derives
 * the SAME worst-case-per-slot shape this table documents directly
 * from its own shadow-clone DOM (both label variants rendered
 * unconditionally, grouped by slot, max width per slot wins) — see
 * that composable's own header for the mechanism and its "own honest
 * consequence" paragraph. This table is no longer cited to justify
 * bypassing worst-case; it remains a pinned regression fixture so the
 * exact live-measured numbers and the derived threshold stay
 * unit-testable independent of a live DOM (jsdom has no real flex
 * layout).
 */
export const ENGINE_CONTROLS_WORST_CASE_BUTTON_WIDTHS_PX: readonly number[] = [
  105.625,   // "Mint Card(s)"
  90.015625, // "Learn Path"
  43.21875,  // "Play"
  90.015625, // "Match" / "Stop Match" (worse: Stop Match)
  90.015625, // "Connect" / "Disconnect" (worse: Disconnect)
];

/** Same `--space-tight` value `.engine-controls`' own CSS `gap` reads. */
export const ENGINE_CONTROLS_GAP_PX = 4;

/** `.toolbar-btn { min-height: 24px }`, live-confirmed as the actual
 *  rendered single-line height at every measured viewport. */
export const ENGINE_CONTROLS_ROW_HEIGHT_PX = 24;
