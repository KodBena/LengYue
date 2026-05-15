<!--
  src/components/board/MoveSuggestions.vue
  Stateless Move Suggestion Overlay.
  Now supports real-time PV updates during pondering in 'instant' mode.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { BOARD_PX, LABEL_BAND, TOTAL_PX, STONE_RADIUS_RATIO } from '../../engine/constants';
import { useMoveSuggestions } from '../../composables/board/use-move-suggestions';
import { usePvAnimation, type PvConfig, type PvMove } from '../../composables/board/use-pv-animation';
import { useTransientHint } from '../../composables/useTransientHint';
import { isPasteClick, isMiddleButtonMousedown, pasteModifierLabel } from '../../utils/modifier-key';
import type { BoardId, NodeId } from '../../types';

// Branded-type signature discipline (Commit 5a): boardId and currentNodeId
// are tightened from `string` to BoardId/NodeId. The caller (BoardWidget)
// passes `state.id` and `state.currentNodeId` from BoardState — both
// already branded. The previous loose signature was a signature lie that
// forced a downstream type mismatch when getNodeId is passed to
// useMoveSuggestions (whose parameter was tightened in Commit 2a).
const props = defineProps<{
  boardId: BoardId;
  currentNodeId: NodeId;
  boardSize: number;
  pvConfig?: PvConfig;
  currentMoveNumber?: number;
  // Whether to render the solid colored ring around moves that
  // share a cluster (a transposition). Default true preserves
  // pre-toggle behaviour; the host (`BoardWidget`) threads the
  // `session.ui.showTranspositionRings` flag through here so the
  // setting can be flipped without remounting MoveSuggestions.
  showTranspositionRings?: boolean;
}>();

const hoveredClusterId = computed(() => {
  if (hoveredIndex.value === null) return undefined;
  return suggestions.value.find(s => s.moveIndex === hoveredIndex.value)?.clusterId;
});

const emit = defineEmits<{
  (e: 'move', x: number, y: number): void;
  // Paste the principal variation of a suggestion into the game
  // tree as a sequential branch. Triggered by modifier-click
  // (Ctrl on Win/Linux, Cmd on Mac) or middle-click on a
  // suggestion disc; the caller in App.vue loops applyGoMove over
  // the PV, inheriting the existing dedup-or-descend behaviour at
  // logic.ts:79–82, so moves that already exist as children of
  // the current node are descended into rather than duplicated.
  (e: 'paste-pv', pv: PvMove[]): void;
  // Fires `true` when the user starts hovering a suggestion (PV
  // preview becomes the user's mental context), `false` when they
  // leave it. Consumed by `BoardWidget` to suppress the game-tree
  // move-number annotation on actual played stones while the PV
  // preview is up — those numbers belong to the played sequence,
  // not to the hypothetical variation the user is reading. The
  // PV's own per-move numbering (driven by `currentMoveNumber` +
  // `cfg.annotation`) is rendered independently and is exactly
  // what the user wants to see in this context.
  (e: 'pv-preview-active', active: boolean): void;
}>();

const { t } = useI18n();
const { setHint, clearHint } = useTransientHint();

// ── Composables ───────────────────────────────────────────────────────────────

const { suggestions, packet, buildPvMoves } = useMoveSuggestions(() => props.currentNodeId);
// Pass the prop as a getter so registry changes to
// `session.ui.pvAnimation` (mode / timings / etc.) reach the live
// composable without requiring a remount of MoveSuggestions.
const { startPv, stopPv, displayStones, cfg: pvCfg } = usePvAnimation(
  () => props.pvConfig
);

const hoveredIndex = ref<number | null>(null);

// Surface "PV preview is up" to the parent so sibling overlays
// (specifically `BoardWidget`'s game-tree move-number annotation)
// can suppress themselves while the user is reading a hypothetical
// variation. The derived boolean fires only on the
// has-hover ↔ no-hover transition, not on every hover-target
// change within the cluster, so the parent's reactive gate
// toggles once per preview session rather than once per
// suggestion-mouseover.
watch(
  () => hoveredIndex.value !== null,
  (active) => emit('pv-preview-active', active),
);

// ── Logic ─────────────────────────────────────────────────────────────────────

/**
 * Transforms raw PV moves into UI-ready moves with correct move numbering.
 */
function getAnnotatedPv(moveIndex: number): PvMove[] {
  let pv = buildPvMoves(moveIndex);
  const ann = pvCfg.annotation; 
  
  if (ann === 'fromCurrent' && props.currentMoveNumber !== undefined) {
    pv = pv.map(m => ({
      ...m,
      moveNumber: props.currentMoveNumber! + m.moveNumber,
    }));
  }
  return pv;
}

/**
 * Handles the initial hover event.
 */
function onDiskEnter(moveIndex: number) {
  hoveredIndex.value = moveIndex;
  startPv(getAnnotatedPv(moveIndex));
  setHint(t('moveSuggestions.pasteHint', { key: pasteModifierLabel() }));
}

/**
 * Real-time Update Guard:
 * When pondering/analysis data arrives, update the displayed stones instantly
 * ONLY if the user is in 'instant' mode.
 */
watch(packet, () => {
  if (hoveredIndex.value !== null && pvCfg.mode === 'instant') {
    startPv(getAnnotatedPv(hoveredIndex.value));
  }
});

/**
 * Navigation Guard:
 * Kill the PV if the board state changes beneath the mouse.
 */
watch(() => props.currentNodeId, () => {
  onLeave();
});

function onLeave(): void {
  hoveredIndex.value = null;
  stopPv();
  clearHint();
}

/**
 * Dispatches the click to one of two affordances:
 *  - Modifier-held click (Ctrl on Win/Linux, Cmd on Mac) emits
 *    `paste-pv` with the suggestion's full PV.
 *  - Plain left-click emits `move` with the suggestion's
 *    coordinate, matching the historical behaviour.
 * Middle-click is handled separately on `mousedown` because
 * `click` events are unreliable for the middle button across
 * browsers — see `utils/modifier-key.ts`.
 */
function onSuggestionClick(event: MouseEvent, x: number, y: number, moveIndex: number) {
  if (isPasteClick(event)) {
    emit('paste-pv', getAnnotatedPv(moveIndex));
  } else {
    emit('move', x, y);
  }
  onLeave();
}

/**
 * Middle-button mousedown handler. Vue's `@click.middle` does not
 * reliably fire across browsers; binding on `mousedown` and
 * filtering on `button === 1` is the portable shape. The
 * `preventDefault()` suppresses the platform default (auto-scroll
 * cursor on Win/Linux).
 */
function onSuggestionMousedown(event: MouseEvent, moveIndex: number) {
  if (!isMiddleButtonMousedown(event)) return;
  event.preventDefault();
  emit('paste-pv', getAnnotatedPv(moveIndex));
  onLeave();
}

// ── SVG Geometry ──────────────────────────────────────────────────────────────

const pad    = computed(() => BOARD_PX / (props.boardSize + 1));
const cell   = computed(() => (BOARD_PX - 2 * pad.value) / (props.boardSize - 1));
const stoneR = computed(() => cell.value * STONE_RADIUS_RATIO);
const safeUid = computed(() => props.boardId.replace(/[^a-z0-9]/gi, ''));

function toSvg(x: number, y: number): { x: number; y: number } {
  return {
    x: pad.value + x * cell.value,
    y: pad.value + (props.boardSize - 1 - y) * cell.value,
  };
}

// Uniform opacity transition across all modes. Previously this was
// gated on window mode, leaving instant / sequential to snap stones
// in/out — see the composable's header comment for the rationale.
const pvTransition = computed(() => `opacity ${pvCfg.fadeDurationMs}ms ease`);
</script>

<template>
  <svg
    :viewBox="`0 0 ${TOTAL_PX} ${TOTAL_PX}`"
    class="suggestions-overlay"
    aria-hidden="true"
  >
    <defs>
      <radialGradient :id="`gb-${safeUid}`" cx="35%" cy="30%" r="50%">
        <stop offset="0%" stop-color="#666" />
        <stop offset="100%" stop-color="#111" />
      </radialGradient>
      <radialGradient :id="`gw-${safeUid}`" cx="35%" cy="30%" r="50%">
        <stop offset="0%" stop-color="#fff" />
        <stop offset="100%" stop-color="#d0d0d0" />
      </radialGradient>
    </defs>

    <!-- Translate into the inner playing area so the toSvg / stoneR
         formulas above stay BoardDisplay-aligned without carrying the
         LABEL_BAND offset. -->
    <g :transform="`translate(${LABEL_BAND}, ${LABEL_BAND})`">

    <!-- 1. Suggestion Disks (Interactions) -->
    <g
      v-for="s in suggestions"
      :key="`sugg-${s.x}-${s.y}`"
      class="suggestion-group"
      @mouseenter="onDiskEnter(s.moveIndex)"
      @mouseleave="onLeave"
      @click="(e) => onSuggestionClick(e, s.x, s.y, s.moveIndex)"
      @mousedown="(e) => onSuggestionMousedown(e, s.moveIndex)"
      :style="{ pointerEvents: (hoveredIndex !== null && s.moveIndex !== hoveredIndex) ? 'none' : 'all' }"
    >
      <!-- magic-literal: 60ms suggestion-ring/disk fade (transition values
           in :style below) — band-2 game-tree-coupled, intentionally
           faster than chrome's --duration-default (200ms). Likely
           co-tuned with the PV-overlay typography proportions; see
           deferred-items.md PV-overlay-typography-proportions entry. -->
      <circle
        v-if="s.clusterColor && (showTranspositionRings ?? true)"
        :cx="toSvg(s.x, s.y).x"
        :cy="toSvg(s.x, s.y).y"
        :r="stoneR * 1.01"
        fill="none"
        :stroke="s.clusterColor"
        stroke-width="2.5"
          :style="{
    opacity: (hoveredIndex === null || s.moveIndex === hoveredIndex || (s.clusterId !== undefined && s.clusterId === hoveredClusterId)) ? 0.8 : 0,
    transition: 'opacity 60ms ease'
  }"
      />
      
      <circle
        :cx="toSvg(s.x, s.y).x"
        :cy="toSvg(s.x, s.y).y"
        :r="stoneR"
        :fill="s.color"
        class="suggestion-disk"
        :style="{
          opacity: hoveredIndex !== null ? 0 : 1,
          transition: 'opacity 60ms ease'
        }"
      />
      <!--
        Labels hide on any hover (not just hovers of *other* suggestions):
        the hovered suggestion's disk fades to opacity 0 and is replaced
        by the PV preview stone at the same location, which renders its
        own move-number text. Showing both texts on one stone clutters
        the read.
      -->
      <text
        v-if="hoveredIndex === null"
        :x="toSvg(s.x, s.y).x"
        :y="toSvg(s.x, s.y).y + 1"
        class="suggestion-label"
        :font-size="stoneR * 0.59"
        dominant-baseline="middle"
        :fill="s.isBest ? '#003040' : '#000'"
      >{{ s.winrateLabel }}</text>
      <text
        v-if="s.isBest && hoveredIndex === null"
        :x="toSvg(s.x, s.y).x"
        :y="toSvg(s.x, s.y).y + stoneR * 0.62"
        class="suggestion-label"
        :font-size="stoneR * 0.58"
        dominant-baseline="middle"
        fill="#003040"
        opacity="0.75"
      >{{ s.scoreLabel }}</text>
    </g>

    <!-- 2. Animated PV Stones -->
    <g
      v-for="stone in displayStones"
      :key="`pv-${stone.moveNumber}`"
      class="pv-stone-group"
    >
      <circle
        :cx="toSvg(stone.x, stone.y).x"
        :cy="toSvg(stone.x, stone.y).y"
        :r="stoneR"
        :fill="stone.color === 'B' ? `url(#gb-${safeUid})` : `url(#gw-${safeUid})`"
        :stroke="stone.color === 'B' ? '#000' : '#aaa'"
        stroke-width="0.5"
        :style="{ opacity: stone.opacity, transition: pvTransition }"
      />
      <text
        v-if="pvCfg.annotation !== 'none'"
        :x="toSvg(stone.x, stone.y).x"
        :y="toSvg(stone.x, stone.y).y + 1"
        class="pv-label"
        :font-size="stoneR * 0.82"
        dominant-baseline="middle"
        :fill="stone.color === 'B' ? '#e8e8e8' : '#1a1a1a'"
        :style="{ opacity: stone.opacity, transition: pvTransition }"
      >{{ stone.moveNumber }}</text>
    </g>

    </g>
  </svg>
</template>

<style scoped>
.suggestions-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.suggestion-group { pointer-events: all; cursor: pointer; }
.suggestion-label, .pv-label { pointer-events: none; text-anchor: middle; font-family: monospace; font-weight: bold; user-select: none; }
.pv-stone-group { pointer-events: none; }
</style>
