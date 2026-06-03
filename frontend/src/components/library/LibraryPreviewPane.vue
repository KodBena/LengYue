<script setup lang="ts">
/**
 * src/components/library/LibraryPreviewPane.vue
 *
 * The Library tab's right-hand pane: mini-board rendered from the
 * preview composable's parsed board + scrub slider + metadata
 * readout + action buttons (Open in board, Delete from library).
 *
 * The mini-board reuses the existing `renderBoardToSvg` engine
 * helper that the card-tree thumbnails use, so the visual style
 * is consistent across surfaces.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { renderBoardToSvg } from '../../engine/board-renderer';
import { getBoardSize } from '../../engine/util';
import type { LibraryPreview } from '../../composables/library/useLibraryPreview';

interface Props {
  preview: LibraryPreview;
}
interface Emits {
  (e: 'open-game'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const previewSvg = computed((): string => {
  const board = props.preview.parsedBoard.value;
  if (!board) return '';
  const currentNode = board.nodes[board.currentNodeId];
  const size = getBoardSize(board);
  return renderBoardToSvg({
    size,
    stones: board.stones,
    lastMove: currentNode?.move ?? null,
    showMarker: true,
    uid: `library-preview-${props.preview.selectedRow.value?.id ?? 'none'}`,
  });
});

const hasSelection = computed(() => props.preview.selectedRow.value !== null);
const hasGame = computed(() => props.preview.selectedGame.value !== null);

// Slider's max — scrubPosition's domain is [0, totalMoves].
const scrubMax = computed(() => props.preview.totalMoves.value);
</script>

<template>
  <div class="library-preview">
    <div v-if="!hasSelection" class="preview-empty">
      Select a game from the list to preview.
    </div>

    <div v-else-if="preview.loading.value && !hasGame" class="preview-empty">
      Loading…
    </div>

    <template v-else-if="hasGame">
      <div class="preview-meta">
        <div class="meta-players">
          <span class="meta-player-white">{{ preview.selectedGame.value?.playerWhite ?? '—' }}</span>
          <span class="meta-vs">vs</span>
          <span class="meta-player-black">{{ preview.selectedGame.value?.playerBlack ?? '—' }}</span>
        </div>
        <div class="meta-details">
          <span v-if="preview.selectedGame.value?.date">{{ preview.selectedGame.value.date }}</span>
          <span v-if="preview.selectedGame.value?.result"> · {{ preview.selectedGame.value.result }}</span>
          <span v-if="preview.selectedGame.value?.ruleset"> · {{ preview.selectedGame.value.ruleset }}</span>
          <span v-if="preview.selectedGame.value?.boardSize"> · {{ preview.selectedGame.value.boardSize }}×{{ preview.selectedGame.value.boardSize }}</span>
        </div>
      </div>

      <!-- eslint-disable-next-line vue/no-v-html -- deliberate board-SVG string projection from renderBoardToSvg (trusted, no user-authored HTML); see ADR-0010 string-vs-reactive board projection -->
      <div class="preview-board" v-html="previewSvg"></div>

      <div class="preview-scrub">
        <input
          type="range"
          :min="0"
          :max="scrubMax"
          v-model.number="preview.scrubPosition.value"
          class="scrub-slider"
          :disabled="scrubMax === 0"
        />
        <span class="scrub-position">
          {{ preview.scrubPosition.value }} / {{ scrubMax }}
        </span>
      </div>

      <div class="preview-actions">
        <button class="preview-btn primary" @click="emit('open-game')">
          Open in board
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.library-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-medium);
  padding: var(--space-medium);
  height: 100%;
  min-height: 0;
  background: var(--surface-2);
  overflow-y: auto;
}
.preview-empty {
  padding: var(--space-large);
  text-align: center;
  color: var(--text-muted);
}
.preview-meta { display: flex; flex-direction: column; gap: var(--space-tiny); }
.meta-players {
  display: flex;
  gap: var(--space-small);
  align-items: baseline;
  font-size: var(--text-body);
  font-weight: 600;
}
.meta-vs {
  font-size: var(--text-small);
  color: var(--text-muted);
  font-weight: normal;
}
.meta-details {
  font-size: var(--text-small);
  color: var(--text-muted);
}
.preview-board {
  /* Reserve a square so the SVG mini-board renders aspect-1:1 */
  aspect-ratio: 1 / 1;
  max-width: 360px;
  background: var(--surface-0);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-default);
}
.preview-board :deep(svg) { width: 100%; height: 100%; display: block; }
.preview-scrub {
  display: flex;
  gap: var(--space-small);
  align-items: center;
}
.scrub-slider { flex: 1 1 0; }
.scrub-position {
  font-size: var(--text-small);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  min-width: 5em;
  text-align: right;
}
.preview-actions {
  display: flex;
  gap: var(--space-small);
}
.preview-btn {
  padding: var(--space-tiny) var(--space-small);
  font-size: var(--text-body);
  background: var(--surface-0);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-default);
  color: var(--text-default);
  cursor: pointer;
}
.preview-btn:hover { border-color: var(--accent-primary); }
.preview-btn.primary { background: var(--accent-primary); color: var(--surface-1); border-color: var(--accent-primary); }
</style>
