<script setup lang="ts">
/**
 * src/components/library/LibraryPreviewPane.vue
 *
 * The Library tab's right-hand pane: mini-board rendered from the
 * preview composable's parsed board + scrub slider + metadata
 * readout + action buttons (Open in board, Delete from library).
 *
 * The mini-board reuses the shared `MiniBoard` component (the same
 * canvas/SVG-dispatching thumbnail idiom the board-tab rail's docked
 * hover preview and ChartPreviewBox use — see MiniBoard.vue) rather
 * than an ad hoc SVG-string projection, so this is ONE HOME for
 * "small board thumbnail" rendering, not a second bespoke one
 * (commissioner directive, library-preview-density dispatch,
 * ledger rows 1525/1526: "we should just reuse the thumbnail in
 * the lower left in the sidebar-widget"). This stays a SINGLE
 * instance — the master-detail pane's one selected-game preview —
 * so none of MiniBoardCanvas's ADR-0010 per-instance cost
 * multiplies with list length; see LibraryTable.vue's own header
 * comment for why the per-ROW list does NOT also get one.
 *
 * Ledger rows 1525/1526 (commissioner screenshot ~/smallscreen.png):
 * this pane's board previously sized via `max-width: 360px` with no
 * matching height cap (aspect-ratio alone, inside an `auto`-sized
 * CSS Grid row in LibraryTab's narrow/stacked layout) — an
 * intrinsically-sized auto grid track can grow past its container,
 * and here it did: the board's height demand starved the sibling
 * `1fr` list row down to ~0px, so only this single expanded preview
 * card was visible and the actual multi-row game LIST (LibraryTable)
 * had no room left to render. `.preview-board` below is now a fixed
 * 160×160 box (both dimensions capped, not just width) — modest,
 * fixed-size, matching the sidebar rail's own established 150px
 * docked-preview convention — so its content-box height is bounded
 * regardless of an `auto` grid track. LibraryTab.vue's own narrow-
 * stack row template is ALSO capped defensively (see its comment) —
 * belt and suspenders, since a future content addition to this pane
 * (more meta lines, etc.) must not be able to re-trigger the same
 * collapse via the grid track alone.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import MiniBoard from '../board/MiniBoard.vue';
import { getBoardSize } from '../../engine/util';
import type { LibraryPreview } from '../../composables/library/useLibraryPreview';
import type { BoardSnapshot } from '../../engine/board-geometry';

interface Props {
  preview: LibraryPreview;
}
interface Emits {
  (e: 'open-game'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const boardSnapshot = computed((): BoardSnapshot | null => {
  const board = props.preview.parsedBoard.value;
  if (!board) return null;
  const currentNode = board.nodes[board.currentNodeId];
  return {
    size: getBoardSize(board),
    stones: board.stones,
    lastMove: currentNode?.move ?? null,
  };
});

const hasSelection = computed(() => props.preview.selectedRow.value !== null);
const hasGame = computed(() => props.preview.selectedGame.value !== null);

// Slider's max — scrubPosition's domain is [0, totalMoves].
const scrubMax = computed(() => props.preview.totalMoves.value);

// Ledger rows 1544/1545 (commissioner screenshot
// ~/scroller_location_mismatch.png): switching from a SHORTER game to
// a LONGER one left the native `<input type="range">`'s thumb stuck
// near its old position — e.g. label "99 / 99" with the handle
// sitting at ~1/3 of the track — even though `preview.scrubPosition`
// and `preview.totalMoves` (the label's source) were already correct
// for the newly-selected game. Root cause, confirmed by direct
// instrumentation of `@vue/runtime-core`'s `patchElement`: on an
// UPDATE (not a fresh mount), the `v-model` directive's `beforeUpdate`
// hook — which sets the DOM `.value` PROPERTY — runs BEFORE Vue's own
// prop patch that raises the `max` ATTRIBUTE. If the new target value
// exceeds the element's still-stale (smaller, previous game's) `max`
// at that instant, the browser silently CLAMPS `.value` down to the
// stale max; raising `max` a moment later does not retroactively
// re-expand it, so the thumb is left at the wrong, clamped position
// while every purely-reactive read (this component's label
// interpolation, `boardSnapshot`, etc.) already reflects the new
// game correctly. `@vue/runtime-dom`'s own `vModelText.mounted` hook
// carries the inverse comment ("set value on mounted so it's after
// min/max for type=range") — the mount path already gets this order
// right; only the in-place UPDATE path does not, and Vue has no public
// hook to reorder it.
//
// Fix at the class (not the pixel): force Vue onto the MOUNT path,
// never the patch-in-place UPDATE path, for this element, by keying
// it to the selected game's identity. A key change tears the old
// `<input>` down and builds a fresh one — min/max land before value
// by construction — so the slider's value/max/handle can never
// diverge from the just-selected game's state, matching the "atomic,
// single-homed, no pane-scoped survival" policy for this control.
const scrubKey = computed(() => props.preview.selectedGame.value?.id ?? undefined);
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

      <div class="preview-board">
        <MiniBoard v-if="boardSnapshot" :snapshot="boardSnapshot" :show-marker="true" />
      </div>

      <div class="preview-scrub">
        <input
          :key="scrubKey"
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
  color: var(--text-0);
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
  color: var(--text-0);
  font-weight: normal;
}
.meta-details {
  font-size: var(--text-tiny);
  color: var(--text-0);
}
/* Fixed, modest, BOTH-dimensions-capped box (rows 1525/1526 fix — see
   the script-block comment above for the collapse this replaces).
   160px sits inside the genre's established modest-thumbnail range
   (120-180px) and close to the sidebar rail's own 150px docked-
   preview box, so the two surfaces read as the same idiom at a
   glance. Deliberately NOT `max-width` + `aspect-ratio` alone —
   that combination has no height ceiling of its own when the
   parent's height is intrinsic (an `auto` CSS Grid row), which is
   exactly how it grew unbounded and starved the sibling list. */
.preview-board {
  width: 160px;
  height: 160px;
  flex: 0 0 auto;
  background: var(--surface-0);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-default);
  overflow: hidden;
}
.preview-scrub {
  display: flex;
  gap: var(--space-default);
  align-items: center;
}
.scrub-slider { flex: 1 1 0; }
.scrub-position {
  font-size: var(--text-tiny);
  color: var(--text-0);
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
  color: var(--text-0);
  cursor: pointer;
}
.preview-btn:hover { border-color: var(--accent-primary); }
/* Audit L10 / ledger row 1018 (amended row 1144): `color:
 * var(--surface-1)` was a surface token used as a foreground — the
 * named category-inversion defect (CLAUDE.md TOKEN LAW, rows 681/742)
 * — measuring 1.84:1 in `cluster` (--surface-1 resolves to taupe
 * there). `--text-on-accent` (theme.css) is a purpose-built,
 * theme-aware role-alias token for exactly this role — text sitting
 * directly on an --accent-primary fill — with its own category-correct
 * value in each palette (dark: 5.18:1; cluster: 7.74:1; see theme.css's
 * definition for the full derivation). No per-theme override needed
 * here: the token itself already resolves correctly per theme. */
.preview-btn.primary {
  background: var(--accent-primary);
  color: var(--text-on-accent);
  border-color: var(--accent-primary);
}
</style>
