<script setup lang="ts">
/**
 * src/components/library/LibraryTab.vue
 *
 * The Library tab's surface. Holds the four composable instances
 * (useLibraryQuery, useLibraryPlayerSuggest, useLibraryPreview,
 * useLibraryImport) and arranges them into a master-detail
 * layout with the import panel above.
 *
 * The dirty-board guard (the modal + actionOnDirtyBoard
 * preference) is held by App.vue per the existing pattern; this
 * tab emits `open-library-game` up to App.vue when the preview's
 * "Open in board" button is clicked. App.vue's handler calls
 * `useDirtyBoardGuard.handleLoadLibraryGame`.
 *
 * License: Public Domain (The Unlicense)
 */
import { onMounted } from 'vue';
import LibraryImportPanel from './LibraryImportPanel.vue';
import LibraryPlayerFilter from './LibraryPlayerFilter.vue';
import LibraryPreviewPane from './LibraryPreviewPane.vue';
import LibraryTable from './LibraryTable.vue';
import { useLibraryImport } from '../../composables/library/useLibraryImport';
import { useLibraryPlayerSuggest } from '../../composables/library/useLibraryPlayerSuggest';
import { useLibraryPreview } from '../../composables/library/useLibraryPreview';
import { useLibraryQuery } from '../../composables/library/useLibraryQuery';
import { libraryService } from '../../services/library-service';
import type { GameSourceId, LibraryGame, LibraryGameListItem } from '../../types';

const emit = defineEmits<{
  (e: 'open-library-game', game: LibraryGame): void;
}>();

const query = useLibraryQuery();
const suggest = useLibraryPlayerSuggest();
const preview = useLibraryPreview();

// onImportComplete fires the two refreshes the SPA needs to
// reflect a just-completed import: new rows in the table, new
// names in the autocomplete cache.
const importer = useLibraryImport(() => {
  void query.refresh();
  void suggest.refresh();
});

onMounted(() => {
  void query.refresh();
  void suggest.refresh();
});

function onSelect(row: LibraryGameListItem): void {
  preview.selectedRow.value = row;
}

// Double-click on a row: select for preview AND open on the board.
// The preview composable will fetch the full LibraryGame via its
// watcher on selectedRow; we also fetch here directly so the
// open-emit has a concrete game in hand without racing the watcher.
// Two GET requests for the same id is a benign duplicate at hobby
// scale; the alternative (await-the-watcher) requires plumbing a
// resolution signal back out of useLibraryPreview, and the existing
// "Open in board" button uses the watcher's selectedGame anyway —
// the double-click and the button stay alignable that way.
async function onOpen(row: LibraryGameListItem): Promise<void> {
  preview.selectedRow.value = row;
  const game = await libraryService.getGame(row.id as GameSourceId);
  if (game !== null) emit('open-library-game', game);
}

function onOpenFromPreview(): void {
  const game = preview.selectedGame.value;
  if (game !== null) emit('open-library-game', game);
}

</script>

<template>
  <div class="library-tab">
    <LibraryImportPanel :imp="importer" class="library-import-zone" />

    <div class="library-filters">
      <LibraryPlayerFilter
        :model-value="query.filter.playerWhiteLike"
        @update:model-value="query.filter.playerWhiteLike = $event"
        label="White player"
        placeholder="e.g. Cho"
        :suggest="suggest.suggest"
      />
      <LibraryPlayerFilter
        :model-value="query.filter.playerBlackLike"
        @update:model-value="query.filter.playerBlackLike = $event"
        label="Black player"
        placeholder="e.g. Lee"
        :suggest="suggest.suggest"
      />
    </div>

    <div class="library-split">
      <div class="library-split-list">
        <LibraryTable
          :total-count="query.totalCount.value"
          :row-at="query.rowAt"
          :is-row-loading="query.isRowLoading"
          :sort="query.sort.value"
          :direction="query.direction.value"
          :selected-id="preview.selectedRow.value?.id ?? null"
          @update:sort="query.sort.value = $event"
          @update:direction="query.direction.value = $event"
          @select="onSelect"
          @open="onOpen"
          @visible-range="(s, e) => query.ensureRange(s, e)"
        />
      </div>
      <div class="library-split-preview">
        <LibraryPreviewPane
          :preview="preview"
          @open-game="onOpenFromPreview"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.library-tab {
  display: flex;
  flex-direction: column;
  /* The slot wrapper in App.vue is `display: flex` row-direction;
     without `flex: 1` the tab sizes to intrinsic content width and
     collapses to its padding. ForestDirectory's wrapper is the
     established pattern. */
  flex: 1;
  gap: var(--space-medium);
  height: 100%;
  min-height: 0;
  padding: var(--space-medium);
  /* Container queries are the responsive-arc convention — at
     narrow widths, the master-detail collapses to a stack. */
  container-type: inline-size;
}
.library-import-zone { flex: 0 0 auto; }
.library-filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-small);
  flex: 0 0 auto;
}
.library-split {
  flex: 1 1 0;
  min-height: 0;
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: var(--space-medium);
}
.library-split-list, .library-split-preview {
  min-height: 0;
  min-width: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-default);
  overflow: hidden;
}

/* Narrow-width stack — same pattern as the responsive arc. */
@container (max-width: 700px) {
  .library-split {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr) minmax(0, auto);
  }
}
</style>
