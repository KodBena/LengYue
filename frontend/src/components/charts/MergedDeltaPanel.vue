<!--
  src/components/charts/MergedDeltaPanel.vue

  Combined per-move delta chart. Renders black's deltas and
  white's deltas on a single chart sharing a parity-interleaved
  x-axis: black's K-th colour-local move sits at x=2K, white's
  at x=2K+1. The x-resolution is twice the per-colour move
  count — the number of plies — exactly because moves
  alternate by colour. At any integer x only one of the two
  series has a data point; the other has no value there.
  ECharts draws piecewise-linear segments between consecutive
  same-colour data points, so each line visually passes
  through x-values where the other player wouldn't have a move
  (an interpolation artefact, not a semantic claim).

  Click and hover dispatch by **x-parity**. With the parity-
  interleaved layout, exactly one series has a data point at
  any integer x — even x is black's row, odd x is white's. The
  lookup verifies that the implied colour-local index has a
  non-null data point (guards against out-of-range x's at the
  start / end of the variation) and dispatches to that colour.
  Once the colour is known, navigation is
  `variationPath[colorMoveToPly(K, colour) - 1]` (the position
  the player faced when choosing that move); hover preview
  shows the position AFTER the move.

  Active marker sits on the series of the colour whose turn it
  is to make the next move, at the parity-interleaved x of
  their upcoming move. BaseChart's marker logic finds no data
  point on the OTHER series at that x (parity-interleaved
  sparsity) and naturally renders an empty markPoint there, so
  only one marker appears.

  Three-mode view cycle (ledger row 418): 'shared' (both
  colours overlaid — the only view that existed before this
  feature), 'black', 'white'. The dedicated header button
  (never a plot click — that overload is what the per-colour
  modes exist to remove) cycles shared → black → white → shared
  and persists the choice (`useDeltaViewMode`,
  `session.ui.deltaViewMode`). `seriesForMode` (same module) is
  the single projection both the series build below AND
  `colorAt`'s dispatch read through: in 'black' mode `white`
  maps to `[]`, so the white series is not merely hidden from
  render, it is structurally absent from the data `colorAt` ever
  scans — a click cannot resolve to white because there is no
  white data point anywhere in the click path, not because a
  check happens to reject it (ADR-0000). 'shared' mode passes
  both inputs through by reference, so its rendering and
  click-dispatch behaviour are unchanged from before this
  feature.

  Axis labels and tooltip header are formatted via two
  optional BaseChart props (`formatXAxis`, `formatXTooltip`):
  visible axis labels read `0, 1, 2, ...` at chart x =
  `0, 2, 4, ...` (odd-x labels suppressed) so the axis appears
  to "go up to the per-colour move count"; tooltip header
  names the colour and the per-colour move number explicitly
  ("Black move 3" / "White move 7") so the user doesn't have
  to read the per-series row to identify the colour.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, watch } from 'vue';
import AnalysisChartPanel from './AnalysisChartPanel.vue';
import { globalLegendState } from './BaseChart.vue';
import { usePreviewSnapshot } from '../../composables/cards/usePreviewSnapshot';
import { mutateBoard, store } from '../../store';
import { navigateTo } from '../../engine/navigator';
import { colorMoveToPly } from '../../composables/analysis/useTriangularHeatmap';
import { themeColor } from '../../utils/theme-color';
import { injectAnalysisContext } from '../../composables/analysis/useAnalysisContext';
import {
  useDeltaViewMode,
  seriesForMode,
  isColorVisibleInMode,
  DELTA_VIEW_MODE_LABEL,
} from '../../composables/analysis/useDeltaViewMode';
import type { ColorMoveIndex } from '../../types';

// Phase-0 projection seam: self-source from the injected AnalysisContext
// rather than prop-drilled slices. activeMergedIndex keeps its own
// per-colour computation (it is not the shared activeMainIndex); it sources
// boardId / variationPath from the context.
const ctx = injectAnalysisContext();
const blackSeries    = computed(() => ctx.enriched.value.deltaSeries.black);
const whiteSeries    = computed(() => ctx.enriched.value.deltaSeries.white);
const mistakes       = ctx.mistakes;
const boardId        = ctx.boardId;
const variationPath  = ctx.variationPath;
const selectionRange = ctx.selectionRange;

// Three-mode view cycle (see header comment). `effectiveBlackSeries` /
// `effectiveWhiteSeries` are the SAME projection `colorAt` reads for
// click dispatch (below) and `mergedSeries` reads for the chart build —
// one function, so "what's drawn" and "what's clickable" can never
// disagree about which colour is present under the current mode.
const { mode, cycle } = useDeltaViewMode();
const effectiveSeries = computed(() => seriesForMode(blackSeries.value, whiteSeries.value, mode.value));
const effectiveBlackSeries = computed(() => effectiveSeries.value.black);
const effectiveWhiteSeries = computed(() => effectiveSeries.value.white);
const modeLabel = computed(() => DELTA_VIEW_MODE_LABEL[mode.value]);
const modeTitle = computed(() =>
  mode.value === 'shared'
    ? 'Delta view: Shared (both colours). Click to show Black only.'
    : mode.value === 'black'
      ? 'Delta view: Black only (unambiguous click-to-navigate). Click to show White only.'
      : 'Delta view: White only (unambiguous click-to-navigate). Click to show both colours.',
);

// The cured hover-preview quartet, single-sourced in usePreviewSnapshot:
// a synchronously-written `previewNode` gate, a fire-and-forget cache warm,
// and a `getPreview` accessor over the synchronous cache read — so a late
// cache-miss resolve can fill a still-targeted thumbnail but can never
// resurrect a node the leave-time reset already cleared. The accessor is
// passed down (not the value) so the per-nav thumbnail update re-renders
// only the <ChartPreviewBox> leaf, not this panel or the chart host
// (render-coupling postmortem, 2026-05-29).
const { getPreview, showPreview, reset } = usePreviewSnapshot(boardId);

// Re-index each side's colour-local data onto a shared
// parity-interleaved x-axis: black move K → x=2K, white
// move K → x=2K+1. Mistake-finder dots ride on the same
// chart as a scatter series whose datums carry per-point
// itemStyle (severity-gradient hue / always-red for unpunished)
// and symbolSize (severity-scaled / fixed-larger for unpunished).
// `any[]` because the scatter series carries fields (type,
// showPoints, per-datum object datums) that don't fit
// EnrichedSeries's tighter line-only shape; BaseChart's prop
// is `any[]` anyway, so the loosening doesn't propagate.
const mergedSeries = computed<any[]>(() => {
  const out: any[] = [];
  // Colour is applied here (presentation), not in the data projection.
  // Reads through effectiveBlack/WhiteSeries (seriesForMode), not
  // blackSeries/whiteSeries directly: in a per-colour mode the hidden
  // colour's array is [] here, so its line is absent from the ECharts
  // option this chart renders — the same projection colorAt (below)
  // reads for click dispatch, per the header comment's ADR-0000 note.
  // In 'shared' mode effectiveBlack/WhiteSeries ARE blackSeries.value /
  // whiteSeries.value (reference-equal, per seriesForMode's contract),
  // so this loop's output is unchanged from before this feature.
  for (const s of effectiveBlackSeries.value) {
    out.push({
      ...s,
      color: themeColor('--player-black'),
      data: s.data.map(([k, v]) => [2 * k, v] as [number, number | null]), // fix the 2-element literal to ECharts' tuple-data shape
    });
  }
  for (const s of effectiveWhiteSeries.value) {
    out.push({
      ...s,
      color: themeColor('--player-white'),
      data: s.data.map(([k, v]) => [2 * k + 1, v] as [number, number | null]), // fix the 2-element literal to ECharts' tuple-data shape
    });
  }
  const visibleMistakes = mistakes.value.filter(m => {
    // Per-color filter: when the user hides "Black Delta" or
    // "White Delta" via the chart legend, the corresponding dots
    // disappear too. Pedagogy framing (per the project author's
    // 2026-05-28 clarification): a stronger player reviewing a
    // weaker student's game doesn't need their own mistakes
    // surfaced — but the un-punished-by-opponent class still
    // composes correctly because un-punished is a property of
    // the move at ply P (not its follow-up); hiding the
    // opponent's chart doesn't change which of *your* mistakes
    // they failed to punish, only the visual reminder of theirs.
    if (m.color === 'B' && globalLegendState['Black Delta'] === false) return false;
    if (m.color === 'W' && globalLegendState['White Delta'] === false) return false;
    // Per-colour view-mode filter: a hidden colour's mistake dots would
    // otherwise render with no click semantics under that colour (colorAt
    // never resolves them once effectiveBlack/WhiteSeries excludes the
    // colour), which reads as a broken dot rather than a deliberate view.
    // No-op in 'shared' mode (isColorVisibleInMode returns true for both
    // colours there), so shared-mode output is unaffected.
    if (!isColorVisibleInMode(mode.value, m.color)) return false;
    return true;
  });
  if (visibleMistakes.length > 0) {
    const blackRing = themeColor('--player-black');
    const whiteRing = themeColor('--player-white');
    out.push({
      name: 'Mistakes',
      type: 'scatter',
      // showPoints: true gives BaseChart's series mapping a 'circle'
      // symbol at series level — required because scatter series
      // would otherwise inherit the line-default `symbol: 'none'`
      // and render no dots. Per-datum symbolSize and itemStyle
      // override the series-level defaults below.
      showPoints: true,
      // z above the lines so dots aren't occluded by overlapping
      // segments.
      z: 10,
      data: visibleMistakes.map(m => ({
        value: [m.ply, m.deltaValue],
        itemStyle: {
          // Fill: severity-gradient warm orange/amber by default;
          // bright red when un-punished (the consecutive user-
          // mistake → opponent-mistake pattern the pedagogy note
          // demands surface with emphasis the user cannot
          // accidentally hide).
          color: m.unpunished
            ? '#ff2828'
            : `hsla(35, 95%, 55%, ${0.45 + 0.55 * m.severity})`,
          // Outer ring identifies the player whose mistake it is
          // (themeColor() reads the live --player-black / --player-white
          // tokens — they're tuned to be legible against the chart
          // background). Un-punished gets a thicker ring so the
          // player-identity signal stays visible alongside the
          // alert-red fill.
          borderColor: m.color === 'B' ? blackRing : whiteRing,
          borderWidth: m.unpunished ? 3 : 2,
        },
        symbolSize: m.unpunished ? 14 : 8 + 6 * m.severity,
      })),
    });
  }
  return out;
});

// Active marker = the next-to-play player's upcoming move,
// in parity-interleaved x. Mirrors the per-player panels'
// "marker on the not-just-played series" convention. Null at
// root (handled by the colour-local count starting at 0 for
// black, which is correct for "B's first upcoming move").
const activeMergedIndex = computed<number | null>(() => {
  const board = store.boards.find(b => b.id === boardId);
  if (!board) return null;
  const id = board.currentNodeId;
  const plyIdx = variationPath.value.indexOf(id);
  if (plyIdx === -1) return null;

  // Tally moves per colour up to and including the current
  // node. Each player's count IS the colour-local index of
  // their next upcoming move (since the counts are 1-indexed
  // and colour-local indices are 0-indexed).
  let blackCount = 0;
  let whiteCount = 0;
  for (let i = 0; i <= plyIdx; i++) {
    const n = board.nodes[variationPath.value[i]];
    if (n?.move?.type !== 'place') continue;
    if (n.move.color === 'B') blackCount++;
    else                       whiteCount++;
  }

  // Whose turn is next: opposite of current's colour, with
  // black as the default at the root (no current move).
  const currentNode = board.nodes[id];
  const currentColor =
    currentNode?.move?.type === 'place' ? currentNode.move.color : null;
  const nextColor: 'B' | 'W' = currentColor === 'B' ? 'W' : 'B';
  const nextColorLocalIdx = nextColor === 'B' ? blackCount : whiteCount;
  return nextColor === 'B'
    ? 2 * nextColorLocalIdx
    : 2 * nextColorLocalIdx + 1;
});

// Selection range is ply-indexed at the store. The merged
// chart's x is "chronological move index" (parity-interleaved
// plies, 0-indexed), so the conversion is a -1 shift if
// variationPath's index 0 is root; the existing store range
// uses the same 0-indexed-from-root convention as
// variationPath, so passing it through unchanged is correct.
const zoomRange = computed<[number, number]>(() => [
  Math.max(0, selectionRange.value[0] - 1),
  Math.max(0, selectionRange.value[1] - 1),
]);

// Convert the chart's parity-interleaved x to the colour-local
// move index for that colour. Black at x=2K → K=x/2; white at
// x=2K+1 → K=(x-1)/2. Math.floor handles the case where the
// click rounded to a non-matching parity (the rounded x is
// then "snapped down" to the nearest valid index for that
// colour).
function colorLocalIndex(rawIdx: number, color: 'B' | 'W'): number {
  return color === 'B'
    ? Math.floor(rawIdx / 2)
    : Math.floor((rawIdx - 1) / 2);
}

// With parity-interleaved data, x-parity unambiguously selects
// the colour at any integer x: even is black's slot, odd is
// white's. The lookup guards against out-of-range x's where
// the implied colour-local index has no data point (start /
// end of the variation, or unanalyzed plies in the middle).
// `yClicked` is preserved on the signature for a future
// extension to line-y-proximity dispatch — currently unused
// because the parity invariant already disambiguates.
//
// Reads effectiveBlack/WhiteSeries (seriesForMode), the SAME
// projection `mergedSeries` builds the chart from — never
// blackSeries/whiteSeries directly. In a per-colour mode the hidden
// colour's array is `[]`, so this loop finds nothing for it and
// returns null: the wrong-colour hit is unrepresentable because the
// data it would need doesn't exist here, not because a mode check
// happens to reject the candidate (ADR-0000). In 'shared' mode
// effectiveBlack/WhiteSeries are blackSeries.value / whiteSeries.value
// by reference, so this function's behaviour is unchanged from before
// this feature.
function colorAt(moveIdx: number, _yClicked: number): 'B' | 'W' | null {
  const candidate: 'B' | 'W' = moveIdx % 2 === 0 ? 'B' : 'W';
  const k = colorLocalIndex(moveIdx, candidate);
  const series = candidate === 'B' ? effectiveBlackSeries.value : effectiveWhiteSeries.value;
  for (const s of series) {
    const pt = s.data.find(([j]) => j === k);
    if (pt && pt[1] != null) return candidate;
  }
  return null;
}

function resetPreview(): void {
  // Rest preview mirrors `PlayerPanel`'s convention: the
  // thumbnail at `colorMoveToPly(K, color)` — the post-move
  // position of the next-to-play move — not the current
  // board-node's thumbnail. Reading the current board node
  // here would lag the post-move thumbnail by exactly one
  // ply, because a click first navigates the board to the
  // pre-move position (variationPath[colorMoveToPly(K, color)
  // - 1]) and the rest preview should land on the post-move
  // position (variationPath[colorMoveToPly(K, color)]) the
  // same way hover does. Same `(K, color)` derivation as
  // `handleHover`, sourced from `activeMergedIndex`.
  const x = activeMergedIndex.value;
  if (x === null) {
    reset();
    return;
  }
  const color: 'B' | 'W' = x % 2 === 0 ? 'B' : 'W';
  const k = colorLocalIndex(x, color);
  const nodeIdx = colorMoveToPly(k as ColorMoveIndex, color); // brand mint: colorLocalIndex returns a colour-local move index
  const nodeId = variationPath.value[nodeIdx];
  if (nodeId) {
    showPreview(nodeId);
  } else {
    reset();
  }
}

watch(activeMergedIndex, resetPreview, { immediate: true });
const getActiveMergedIndex = () => activeMergedIndex.value;

function handleHover(rawIdx: number, yClicked?: number): void {
  if (yClicked === undefined) return;
  const color = colorAt(rawIdx, yClicked);
  if (!color) return;
  const k = colorLocalIndex(rawIdx, color);
  const nodeIdx = colorMoveToPly(k as ColorMoveIndex, color); // brand mint: colorLocalIndex returns a colour-local move index
  const nodeId = variationPath.value[nodeIdx];
  if (nodeId) {
    showPreview(nodeId);
  }
}

function handleClick(rawIdx: number, yClicked?: number) {
  if (yClicked === undefined) return;
  const color = colorAt(rawIdx, yClicked);
  if (!color) return;
  const k = colorLocalIndex(rawIdx, color);
  const turnIdx = colorMoveToPly(k as ColorMoveIndex, color) - 1; // brand mint: colorLocalIndex returns a colour-local move index
  const nodeId = variationPath.value[turnIdx];
  if (nodeId) {
    mutateBoard(boardId, draft => navigateTo(draft, nodeId));
  }
}

// Map the chart's parity-interleaved x to the user-facing
// per-colour move number K. Black at x=2K, white at x=2K+1
// both reduce to K via `Math.floor(x / 2)`. The axis labeller
// suppresses odd x's so the visible axis reads 0, 1, 2, ...
// at chart x = 0, 2, 4, ... without every-other-tick
// duplicates. The tooltip header names the colour explicitly
// (x-parity determines colour): the per-series rows below
// the header still report the delta value, but the header
// reading "Black move 3" or "White move 7" stands alone
// without making the user infer colour from the row labels.
function formatXAxis(val: number): string {
  const rounded = Math.round(val);
  return rounded % 2 === 0 ? (rounded / 2).toString() : '';
}

function formatXTooltip(val: number): string {
  const rounded = Math.round(val);
  const k       = Math.floor(rounded / 2);
  const color   = rounded % 2 === 0 ? 'Black' : 'White';
  return `${color} move ${k}`;
}
</script>

<template>
  <div class="mode-chrome">
    <div class="mode-header">
      <span class="mode-header-title">Delta View</span>
      <!-- Dedicated chrome affordance (never a plot click — see the
           header comment): shows the CURRENT mode's label and cycles
           shared → black → white → shared on click. Native <button>
           is keyboard-reachable (Tab focus, Enter/Space activation)
           without extra wiring. -->
      <button
        type="button"
        class="mode-cycle-button"
        :class="`mode-${mode}`"
        :aria-label="`Delta view mode: ${modeLabel}. Activate to cycle to the next mode.`"
        :title="modeTitle"
        @click="cycle"
      >{{ modeLabel }}</button>
    </div>
    <AnalysisChartPanel
      label="Per-Player Performance (Moves)"
      :series="mergedSeries"
      :active-index-accessor="getActiveMergedIndex"
      :zoom-range="zoomRange"
      :format-x-axis="formatXAxis"
      :format-x-tooltip="formatXTooltip"
      :on-index-click="handleClick"
      :on-index-hover="handleHover"
      :on-mouse-leave="resetPreview"
      :preview-accessor="getPreview"
      :preview-show-marker="true"
    />
  </div>
</template>

<style scoped>
.mode-chrome {
  background: var(--surface-2);
  border: 1px solid var(--surface-3);
  border-radius: var(--radius-default);
  overflow: hidden;
  margin-bottom: var(--space-medium);
}
.mode-header {
  padding: var(--space-default) var(--space-medium);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-medium);
  background: var(--surface-3);
  border-bottom: 1px solid var(--surface-3);
}
.mode-header-title {
  font-size: var(--text-body);
  font-weight: bold;
  color: var(--text-0);
  text-transform: uppercase;
  letter-spacing: var(--tracking-default);
}
.mode-cycle-button {
  background: var(--surface-0);
  color: var(--text-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  padding: 4px 12px;
  font-size: var(--text-small);
  cursor: pointer;
  min-width: 64px;
}
.mode-cycle-button:hover { border-color: var(--accent-primary); }
.mode-cycle-button:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 1px; }
/* Colour-coded left border echoes the AnalysisChartPanel preview-box
   marker-b/marker-w convention (same file family, same colour tokens),
   so the button's own colour reads as "which colour is selected"
   without relying on text alone. 'shared' gets no colour accent. */
.mode-cycle-button.mode-black { border-left: 3px solid var(--player-black); }
.mode-cycle-button.mode-white { border-left: 3px solid var(--player-white); }
</style>
