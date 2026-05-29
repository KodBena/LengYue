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
import { ref, computed, watch } from 'vue';
import AnalysisChartPanel from './AnalysisChartPanel.vue';
import { globalLegendState } from './BaseChart.vue';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import { mutateBoard, store } from '../../store';
import { navigateTo } from '../../engine/navigator';
import { colorMoveToPly } from '../../composables/analysis/useTriangularHeatmap';
import { themeColor } from '../../utils/theme-color';
import { injectAnalysisContext } from '../../composables/analysis/useAnalysisContext';
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

const { getThumbnailSvg } = useThumbnailCache();
const preview = ref('');

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
  for (const s of blackSeries.value) {
    out.push({
      ...s,
      data: s.data.map(([k, v]) => [2 * k, v] as [number, number | null]),
    });
  }
  for (const s of whiteSeries.value) {
    out.push({
      ...s,
      data: s.data.map(([k, v]) => [2 * k + 1, v] as [number, number | null]),
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
function colorAt(moveIdx: number, _yClicked: number): 'B' | 'W' | null {
  const candidate: 'B' | 'W' = moveIdx % 2 === 0 ? 'B' : 'W';
  const k = colorLocalIndex(moveIdx, candidate);
  const series = candidate === 'B' ? blackSeries.value : whiteSeries.value;
  for (const s of series) {
    const pt = s.data.find(([j]) => j === k);
    if (pt && pt[1] != null) return candidate;
  }
  return null;
}

async function resetPreview() {
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
    preview.value = '';
    return;
  }
  const color: 'B' | 'W' = x % 2 === 0 ? 'B' : 'W';
  const k = colorLocalIndex(x, color);
  const nodeIdx = colorMoveToPly(k as ColorMoveIndex, color);
  const nodeId = variationPath.value[nodeIdx];
  if (nodeId) {
    preview.value = await getThumbnailSvg(nodeId, boardId, true);
  } else {
    preview.value = '';
  }
}

watch(activeMergedIndex, resetPreview, { immediate: true });

async function handleHover(rawIdx: number, yClicked?: number) {
  if (yClicked === undefined) return;
  const color = colorAt(rawIdx, yClicked);
  if (!color) return;
  const k = colorLocalIndex(rawIdx, color);
  const nodeIdx = colorMoveToPly(k as ColorMoveIndex, color);
  const nodeId = variationPath.value[nodeIdx];
  if (nodeId) {
    preview.value = await getThumbnailSvg(nodeId, boardId, true);
  }
}

function handleClick(rawIdx: number, yClicked?: number) {
  if (yClicked === undefined) return;
  const color = colorAt(rawIdx, yClicked);
  if (!color) return;
  const k = colorLocalIndex(rawIdx, color);
  const turnIdx = colorMoveToPly(k as ColorMoveIndex, color) - 1;
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
  <AnalysisChartPanel
    label="Per-Player Performance (Moves)"
    :series="mergedSeries"
    :active-index="activeMergedIndex"
    :zoom-range="zoomRange"
    :format-x-axis="formatXAxis"
    :format-x-tooltip="formatXTooltip"
    :on-index-click="handleClick"
    :on-index-hover="handleHover"
    :on-mouse-leave="resetPreview"
    :preview-html="preview"
  />
</template>
