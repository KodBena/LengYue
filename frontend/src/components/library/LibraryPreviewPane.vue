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
          <span class="meta-player-black">{{ preview.selectedGame.value?.playerBlack ?? '—' }}</span>
          <span class="meta-vs">{{ $t('cards.browse.versus') }}</span>
          <span class="meta-player-white">{{ preview.selectedGame.value?.playerWhite ?? '—' }}</span>
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
  padding: var(--space-loose);
  text-align: center;
  color: var(--text-2);
}
.preview-meta { display: flex; flex-direction: column; gap: var(--space-tight); }
.meta-players {
  display: flex;
  gap: var(--space-default);
  align-items: baseline;
  font-size: var(--text-body);
  font-weight: 600;
}
.meta-vs {
  font-size: var(--text-tiny);
  color: var(--text-2);
  font-weight: normal;
}
.meta-details {
  font-size: var(--text-tiny);
  color: var(--text-2);
}
.preview-board {
  /* Reserve a square so the SVG mini-board renders aspect-1:1 */
  aspect-ratio: 1 / 1;
  max-width: 360px;
  background: var(--surface-0);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-default);
}
.preview-board :deep(svg) { width: 100%; height: 100%; display: block; }
.preview-scrub {
  display: flex;
  gap: var(--space-default);
  align-items: center;
}
.scrub-slider { flex: 1 1 0; }
.scrub-position {
  font-size: var(--text-tiny);
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
  min-width: 5em;
  text-align: right;
}
.preview-actions {
  display: flex;
  gap: var(--space-default);
}
.preview-btn {
  padding: var(--space-tight) var(--space-default);
  font-size: var(--text-body);
  background: var(--surface-0);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-default);
  color: var(--text-1);
  cursor: pointer;
}
.preview-btn:hover { border-color: var(--accent-primary); }
/* Audit L10 / ledger row 1018: `color: var(--surface-1)` was a surface
 * token used as a foreground — the named category-inversion defect
 * (CLAUDE.md TOKEN LAW, rows 681/742). It happened to read fine in the
 * `dark` theme (--surface-1 resolves to #111, near-black, ~7.74:1
 * against this button's --accent-primary background) but measured
 * 1.84:1 in `cluster` (--surface-1 there is taupe, --cluster-12-6) —
 * illegible, well under the 4.5:1 floor.
 *
 * `--text-0` is the established token for a primary-button label on an
 * --accent-primary fill elsewhere in the app (LoginModal .btn-primary,
 * shared-chrome.css .action-btn-large) and clears cluster's floor
 * (~7.74:1, cluster-12-4 purple text on cluster-12-2 sky-blue accent).
 * But `--text-0` in `dark` is #fff, and #fff on this theme's
 * --accent-primary (#4aaef0) is ~2.44:1 — the SAME failure this fix
 * exists to remove, just relocated to the other theme. No token in
 * the `text-*` (or `surface-*`/`border-*`) tier is both (a) not a
 * category inversion and (b) dark enough to clear 4.5:1 against
 * #4aaef0 — the tier only holds three anchors (#fff/#aaa/#666), all
 * too light; the only anchors dark enough are surface-0/1 (banned:
 * same defect class) or border-1/2 (banned by the general rule, though
 * --border-3 is already an established de-facto muted-text color
 * elsewhere in this app — SystemLogPanel, PaletteEditor, StatusBar,
 * etc.). `--border-2` (#333) is the closest of those that still
 * clears the floor with margin (~5.18:1; --border-3 does not, ~3.05:1)
 * and is the deliberate, narrowly-scoped choice here — same
 * dark-theme-only-override technique as TreeWidget.vue's
 * `--tree-node-black-fill` (grep it), because the `text-*` tier
 * genuinely has no anchor built for "dark text on a light accent
 * chip" in this theme. See the unscoped <style> block below for the
 * override; every other/future theme falls through to `--text-0`. */
.preview-btn.primary {
  background: var(--accent-primary);
  color: var(--library-open-btn-text, var(--text-0));
  border-color: var(--accent-primary);
}
</style>

<!--
  Plain (unscoped) style block, deliberately separate from the scoped
  block above — same reason and technique as TreeWidget.vue's
  `--tree-node-black-fill`: `[data-theme="dark"]` lives on <html>, an
  ancestor outside this component's own scope-id boundary, so a scoped
  rule cannot key off it. `.preview-btn.primary` is unique in the
  codebase (grep-checked), so the global selector is safely specific.
  See the `.preview-btn.primary` rule's own comment above for the
  contrast-math derivation (ledger row 1018 / audit L10).
-->
<style>
[data-theme="dark"] .preview-btn.primary {
  --library-open-btn-text: var(--border-2);
}
</style>
