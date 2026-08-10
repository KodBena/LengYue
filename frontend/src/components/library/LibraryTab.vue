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
import { computed, onMounted } from 'vue';
import LibraryImportPanel from './LibraryImportPanel.vue';
import LibraryPlayerFilter from './LibraryPlayerFilter.vue';
import LibraryPreviewPane from './LibraryPreviewPane.vue';
import LibraryTable from './LibraryTable.vue';
import { useLibraryImport } from '../../composables/library/useLibraryImport';
import { useLibraryPlayerSuggest } from '../../composables/library/useLibraryPlayerSuggest';
import { useLibraryPreview } from '../../composables/library/useLibraryPreview';
import { useLibraryQuery } from '../../composables/library/useLibraryQuery';
import { PANEL_CONTENT_READING_MEASURE_CH } from '../../state/layout-model';
import type { LibraryGame, LibraryGameListItem } from '../../types';

// Phase 3 (resolution roadmap, audit finding R3): App.vue reads the
// declared measure/reflow policy once (getPanelContentPolicy, keyed by
// the workspace's own LayoutClass) and passes the single boolean this
// tab needs down as a prop, rather than every tab re-deriving its own
// LayoutClass. Defaults to `false` (today's single-stretched-column
// behaviour) so a standalone mount (a test, Storybook-alike) that
// doesn't pass the prop is unaffected.
const props = defineProps<{ twoColumnReflow?: boolean }>();

const emit = defineEmits<{
  (e: 'open-library-game', game: LibraryGame): void;
  // Middle-click or Ctrl/Cmd-click on a row: open in a new board
  // rather than the active one. Handled by App.vue's
  // `handleLoadLibraryGameInNewBoard` which bypasses the dirty-
  // board guard (no overwrite concern when creating a fresh tab).
  (e: 'open-library-game-new-tab', game: LibraryGame): void;
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

// Plain click on a row (ledger row 1106 — SELECT-PREVIEWS,
// EXPLICIT-OPEN, overruling the single-click-opens option explored
// earlier under this same ledger row 1015): select for preview
// ONLY. Nothing loads onto the board and no confirm-load modal can
// fire from this gesture — it just updates which row's preview the
// user is looking at.
function onSelect(row: LibraryGameListItem): void {
  preview.selectedRow.value = row;
}

// Double-click, or Enter on a selected row (LibraryTable's explicit
// open gesture, ledger row 1106): select for preview AND open on
// the board. The preview composable will fetch the full LibraryGame
// via its watcher on selectedRow; we also fetch here directly so
// the open-emit has a concrete game in hand without racing the
// watcher. Two GET requests for the same id is a benign duplicate
// at hobby scale; the alternative (await-the-watcher) requires
// plumbing a resolution signal back out of useLibraryPreview, and
// the existing "Open in board" button uses the watcher's
// selectedGame anyway — the explicit-open path and the button stay
// alignable that way.
async function onOpen(row: LibraryGameListItem): Promise<void> {
  preview.selectedRow.value = row;
  const game = await preview.fetchGame(row.id);
  if (game !== null) emit('open-library-game', game);
}

function onOpenFromPreview(): void {
  const game = preview.selectedGame.value;
  if (game !== null) emit('open-library-game', game);
}

// "Open in new tab" path from LibraryTable's middle-click /
// Ctrl-click. Don't touch the preview selection — the new-tab
// affordance is "open without disturbing the active context".
async function onOpenNewTab(row: LibraryGameListItem): Promise<void> {
  const game = await preview.fetchGame(row.id);
  if (game !== null) emit('open-library-game-new-tab', game);
}

// Click a player chip in the "All players" accordion → fill the
// any-color Player filter with that name and clear the per-color
// filters. "Show me X's games" is the natural intent, regardless
// of which color X played; the per-color inputs above remain for
// the explicit "X as White" / "X as Black" cases the user can
// reach by typing into them directly. Clearing prevents the chip
// click from silently composing with leftover per-color filters
// in ways the user doesn't expect. The disclosure stays open —
// the user folds it manually per their stated workflow.
function onPlayerChipClick(name: string): void {
  query.filter.playerLike = name;
  query.filter.playerWhiteLike = null;
  query.filter.playerBlackLike = null;
}

// R3's measure cap for `.library-split`'s TWO existing columns (list +
// preview — this split has always been two columns; the bug was that
// each stretched with no cap). Two reading measures, one per column,
// rather than a single-column figure — `library-split-list`'s and
// `library-split-preview`'s own `3fr`/`2fr` shares still divide this
// bounded total, unchanged. `v-bind` in the <style> block below keeps
// this in sync with `PANEL_CONTENT_READING_MEASURE_CH` — no second,
// hand-typed `ch` literal to drift against it.
const librarySplitMaxWidthCss = computed(() => `calc(2 * ${PANEL_CONTENT_READING_MEASURE_CH}ch)`);
</script>

<template>
  <div class="library-tab" :class="{ 'panel-content-two-col': props.twoColumnReflow }">
    <LibraryImportPanel :imp="importer" class="library-import-zone" />

    <div class="library-filters">
      <LibraryPlayerFilter
        :model-value="query.filter.playerLike"
        @update:model-value="query.filter.playerLike = $event"
        label="Player (any color)"
        placeholder="e.g. Cho"
        :suggest="suggest.suggest"
      />
      <!-- M27 (audit finding, ledger row 1251): this field and the
           any-color filter above shared the identical placeholder
           "e.g. Cho", defeating the point of a per-field example.
           Shin Jinseo fits this field the same way Cho/Lee fit
           theirs — a real player name, distinct from the other two
           filters' examples. -->
      <LibraryPlayerFilter
        :model-value="query.filter.playerWhiteLike"
        @update:model-value="query.filter.playerWhiteLike = $event"
        label="White"
        placeholder="e.g. Shin"
        :suggest="suggest.suggest"
      />
      <LibraryPlayerFilter
        :model-value="query.filter.playerBlackLike"
        @update:model-value="query.filter.playerBlackLike = $event"
        label="Black"
        placeholder="e.g. Lee"
        :suggest="suggest.suggest"
      />
    </div>

    <details class="library-players">
      <summary class="library-players-summary">
        All players ({{ suggest.players.value?.length ?? 0 }})
      </summary>
      <div v-if="suggest.players.value" class="library-players-list">
        <button
          v-for="p in suggest.players.value"
          :key="p.name"
          class="library-player-row"
          @click="onPlayerChipClick(p.name)"
        >
          <span class="library-player-name">{{ p.name }}</span>
          <span class="library-player-count">{{ p.count }}</span>
        </button>
      </div>
    </details>

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
          @open-new-tab="onOpenNewTab"
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
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--space-default);
  flex: 0 0 auto;
}

.library-players {
  flex: 0 0 auto;
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
}
.library-players-summary {
  cursor: pointer;
  padding: var(--space-tight) var(--space-default);
  font-size: var(--text-tiny);
  color: var(--text-0);
  list-style: none;
  user-select: none;
}
.library-players-summary::-webkit-details-marker { display: none; }
.library-players-summary::before {
  content: '▶';
  display: inline-block;
  margin-right: var(--space-default);
  font-size: var(--text-tiny);
}
.library-players[open] .library-players-summary::before {
  content: '▼';
}
.library-players-list {
  padding: var(--space-tight) var(--space-default) var(--space-default);
  display: flex;
  flex-direction: column;
  gap: var(--space-tight);
  /* magic-literal: 240px max-height — ~10 rows of name+count
     before the internal scrollbar kicks in. The accordion is a
     scan-and-pick tool; once the user finds a name they fold the
     disclosure, so the open-state vertical budget is bounded.
     Increase if a typical library grows past low hundreds of
     distinct names where 10 rows feels too small. */
  max-height: 240px;
  overflow-y: auto;
}
.library-player-row {
  display: grid;
  /* Name column grows; count column sized to content (right). */
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: var(--space-default);
  padding: 2px var(--space-default);
  font-size: var(--text-tiny);
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  color: var(--text-0);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.library-player-row:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.library-player-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.library-player-count {
  color: var(--text-0);
  font-variant-numeric: tabular-nums;
}
.library-player-row:hover .library-player-count {
  color: var(--accent-primary);
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
  border: 1px solid var(--border-1);
  border-radius: var(--radius-default);
  overflow: hidden;
}

/* Narrow-width stack — same pattern as the responsive arc.
   Rows 1525/1526 (commissioner screenshot ~/smallscreen.png): the
   list row was `minmax(0, 1fr)` against a preview row of
   `minmax(0, auto)` — an intrinsically-sized `auto` track takes its
   full content height even past the grid container's own size, so
   when the preview pane's board had no height cap of its own (now
   fixed in LibraryPreviewPane.vue's `.preview-board`), its content
   height regularly exceeded the available space and the `1fr` list
   track was squeezed to ~0px: only the single expanded preview card
   was visible, and the game LIST — the thing this tab exists to
   browse — had no room to render even one row. The list row now
   carries a floor (`minmax(160px, 1fr)`, ~5 rows at
   LibraryTable's own 32px ROW_HEIGHT_PX) so it always keeps a
   usable share regardless of what the preview pane's content does,
   and the preview row is capped (`minmax(0, 260px)`) so it can
   never again claim more than a modest share even if a future edit
   adds more content there — LibraryPreviewPane's own
   `overflow-y: auto` (`.library-preview`) handles any overflow
   inside that cap. Belt-and-suspenders with the preview pane's own
   fixed-size thumbnail fix; either alone would have been enough for
   TODAY's content, but only capping here is robust against
   tomorrow's. */
@container (max-width: 700px) {
  .library-split {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(160px, 1fr) minmax(0, 260px);
  }
}

/* Phase 3 (audit finding R3): at wide/vast LayoutWidthClass, cap the
   split's own two columns (list + preview — genre's "two columns", not
   a single one stretched to 1400px) at two reading measures total
   rather than letting `flex: 1 1 0` claim the panel's full width. See
   the `librarySplitMaxWidthCss` computed above — `v-bind` keeps the
   `ch` figure sourced from `PANEL_CONTENT_READING_MEASURE_CH`, not a
   second hand-typed literal. */
.library-tab.panel-content-two-col .library-split {
  max-width: v-bind(librarySplitMaxWidthCss);
}
</style>
