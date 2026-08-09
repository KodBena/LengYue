<script setup lang="ts">
/**
 * src/components/library/LibraryTable.vue
 *
 * Virtual-scrolled library list. Sortable column headers,
 * fixed-row-height rendering via `useVirtualRowList`. Emits
 * `open` on a plain row click and `visible-range` whenever the
 * rendered window changes so the parent can call `ensureRange` on
 * its `useLibraryQuery`.
 *
 * Row-opening interaction (ledger row 1015, audit L7): single
 * click opens. Chosen over the prior double-click-to-open model
 * per genre convention — OGS's game archive and web-list
 * convention generally (mail clients, file managers, GitHub's PR
 * list) open on a single click; desktop double-click-to-open is
 * the minority idiom, and reserving it here bought nothing but the
 * native browser word-selection artifact double-click carries by
 * default (L7's "text smear"). There is no more separate
 * "select-without-opening" gesture from the mouse: the prior
 * single-click-selects-for-preview behavior is subsumed by open
 * (the parent's `open` handler sets the preview selection as its
 * first step before fetching/emitting), so clicking a row both
 * previews AND opens it, in one coherent action — matching how the
 * genre's own list-to-detail navigation works elsewhere (there is
 * no separate "arm the preview, then commit" step in OGS or a mail
 * client either). `user-select: none` on `.library-row` (below)
 * kills the text-selection artifact unconditionally, independent
 * of this choice.
 *
 * Thin renderer. Data flow:
 *   parent (LibraryTab)
 *     → owns useLibraryQuery
 *     → passes totalCount, rowAt, isRowLoading, sort, direction in
 *     → listens for visible-range to call ensureRange on the
 *       composable
 *     → listens for sort changes to update the query
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { useVirtualRowList } from '../../composables/library/useVirtualRowList';
import { useElementWidth } from '../../composables/chrome/useElementWidth';
import { fitColumns } from '../../state/table-column-fit';
import {
  LIBRARY_TABLE_COLUMNS,
  LIBRARY_TABLE_GAP_PX,
  LIBRARY_TABLE_INDICATOR_WIDTH_PX,
  type LibraryColumnKey,
  type LibraryColumnSpec,
} from './library-table-columns';
import { isPasteClick, isMiddleButtonMousedown } from '../../utils/modifier-key';
import type {
  GameSourceId,
  LibraryGameListItem,
  LibrarySortColumn,
  LibrarySortDirection,
} from '../../types';

interface Props {
  totalCount: number | null;
  rowAt: (i: number) => LibraryGameListItem | null;
  isRowLoading: (i: number) => boolean;
  sort: LibrarySortColumn;
  direction: LibrarySortDirection;
  selectedId: GameSourceId | null;
}
interface Emits {
  (e: 'update:sort', col: LibrarySortColumn): void;
  (e: 'update:direction', dir: LibrarySortDirection): void;
  // Single click on a row: opens (and, via the parent's handler,
  // becomes the preview selection too — see the header comment).
  (e: 'open', row: LibraryGameListItem): void;
  // Modifier-click (Ctrl/Cmd) or middle-click on a row: open the
  // game in a NEW board rather than the active one (browser-link
  // "open in new tab" convention; same modifier semantics as the
  // MoveSuggestions PV-paste affordance).
  (e: 'open-new-tab', row: LibraryGameListItem): void;
  (e: 'visible-range', start: number, end: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Magic-literal: 32 px row height. Matches the body-text line
// height (~16 px) plus 8 px vertical padding × 2; calibrated by
// eye against the existing table-like surfaces (CardSet editor,
// ForestDirectory rows). If body text size changes globally,
// retune. Substrate token candidate if a second consumer needs
// the same height.
const ROW_HEIGHT_PX = 32;

const scrollContainer = ref<HTMLDivElement | null>(null);
const headerEl = ref<HTMLDivElement | null>(null);
const scrollTop = ref(0);
const containerHeight = ref(0);

// Resolution roadmap Phase 2 (audit L2): available width for the
// column-fit decision, measured live off the header row itself — its
// content-box width (see useElementWidth's header) already excludes
// its own padding, so this is exactly the track space the grid has
// to divide among columns, no separate padding subtraction needed.
const headerWidth = useElementWidth();

const columnFit = computed(() =>
  fitColumns(headerWidth.widthPx.value, LIBRARY_TABLE_COLUMNS, LIBRARY_TABLE_GAP_PX, LIBRARY_TABLE_INDICATOR_WIDTH_PX),
);

// One grid-template-columns string, shared by the header and every
// row (they must always agree pixel-for-pixel). A dropped column
// simply isn't in `columnFit.visible`, so it isn't in this template
// either — this is what makes "0px-but-present" (L2) unrepresentable:
// a column is either a real track at >= its minWidth, or it has no
// track at all.
const gridTemplateColumns = computed(() => {
  const tracks = columnFit.value.visible.map((col: LibraryColumnSpec) =>
    col.grow ? `minmax(${col.minWidth}px, 1fr)` : `${col.minWidth}px`,
  );
  if (columnFit.value.dropped.length > 0) {
    tracks.push(`${LIBRARY_TABLE_INDICATOR_WIDTH_PX}px`);
  }
  return tracks.join(' ');
});

// Every LibraryColumnKey except 'ordinal' is also a LibrarySortColumn
// (display_ordinal isn't in the backend's GameListSort vocabulary — see
// the template's own comment). Not a type predicate: LibrarySortColumn
// also has members ('ruleset', 'boardSize', 'createdAt') outside
// LibraryColumnKey's domain entirely, so "key is LibrarySortColumn"
// isn't a valid narrowing of `key`'s own type.
function isSortableColumn(key: LibraryColumnKey): boolean {
  return key !== 'ordinal';
}
function onSortableHeaderClick(key: LibraryColumnKey): void {
  if (!isSortableColumn(key)) return;
  onHeaderClick(key as LibrarySortColumn);
}
function sortIndicatorFor(key: LibraryColumnKey): string {
  return isSortableColumn(key) ? sortIndicator(key as LibrarySortColumn) : '';
}

// Native-title tooltip for the elision indicator — names the dropped
// columns so the loss is inspectable, not just countable.
const droppedColumnsTitle = computed(() =>
  columnFit.value.dropped.length > 0
    ? `Hidden for width: ${columnFit.value.dropped.map((c) => c.label).join(', ')}`
    : '',
);

// totalCount as a Ref so useVirtualRowList can observe it.
const totalCountRef = computed(() => props.totalCount) as unknown as Ref<number | null>;

const v = useVirtualRowList({
  totalCount: totalCountRef,
  rowHeightPx: ROW_HEIGHT_PX,
  containerHeightPx: containerHeight,
  scrollTopPx: scrollTop,
});

// Emit visible-range whenever it changes so parent can fetch.
watch(
  [v.visibleStart, v.visibleEnd],
  ([s, e]) => emit('visible-range', s, e),
  { immediate: true },
);

let resizeObserver: ResizeObserver | null = null;

function onScroll(): void {
  const el = scrollContainer.value;
  if (el) scrollTop.value = el.scrollTop;
}

onMounted(() => {
  const el = scrollContainer.value;
  if (!el) return;
  containerHeight.value = el.clientHeight;
  el.addEventListener('scroll', onScroll, { passive: true });
  resizeObserver = new ResizeObserver(() => {
    containerHeight.value = el.clientHeight;
  });
  resizeObserver.observe(el);

  if (headerEl.value) headerWidth.observe(headerEl.value);
});
onUnmounted(() => {
  resizeObserver?.disconnect();
  scrollContainer.value?.removeEventListener('scroll', onScroll);
  headerWidth.stop();
});

// Render-loop helper: an array of indices currently in the
// visible window. Length = visibleEnd - visibleStart.
const visibleIndices = computed(() => {
  const arr: number[] = [];
  for (let i = v.visibleStart.value; i < v.visibleEnd.value; i++) arr.push(i);
  return arr;
});

function onHeaderClick(col: LibrarySortColumn): void {
  if (props.sort === col) {
    emit('update:direction', props.direction === 'asc' ? 'desc' : 'asc');
  } else {
    emit('update:sort', col);
  }
}

function sortIndicator(col: LibrarySortColumn): string {
  if (props.sort !== col) return '';
  return props.direction === 'asc' ? ' ▲' : ' ▼';
}

function onRowClick(event: MouseEvent, idx: number): void {
  const row = props.rowAt(idx);
  if (!row) return;
  // Ctrl/Cmd-click → "open in new tab" semantics. Same modifier
  // convention as browser links and the MoveSuggestions PV-paste
  // affordance.
  if (isPasteClick(event)) {
    emit('open-new-tab', row);
    return;
  }
  // Plain click → open (ledger row 1015 / audit L7). See the file
  // header comment for the genre grounding and the coherence
  // argument for dropping the separate select-only gesture.
  emit('open', row);
}
function onRowMousedown(event: MouseEvent, idx: number): void {
  if (!isMiddleButtonMousedown(event)) return;
  // Middle-click also gets "open in new tab" semantics. `mousedown`
  // (not `click` / `auxclick`) for cross-browser portability —
  // matches the MoveSuggestions middle-button pattern. The
  // `preventDefault()` suppresses the platform's middle-button
  // auto-scroll cursor on Win/Linux.
  event.preventDefault();
  const row = props.rowAt(idx);
  if (row) emit('open-new-tab', row);
}

// Native-title tooltip on each row — shows every column the
// rendered grid drops (Ruleset, Size) plus the truncated bits of
// the visible columns. Long player names that ellipsis off in the
// row stay readable on hover this way. Empty fields render as
// `—` to keep the layout legible.
function rowTitle(idx: number): string {
  const r = props.rowAt(idx);
  if (!r) return '';
  return [
    `Black:  ${r.playerBlack ?? '—'}`,
    `White:  ${r.playerWhite ?? '—'}`,
    `Date:   ${r.date ?? '—'}`,
    `Result: ${r.result ?? '—'}`,
    `Rules:  ${r.ruleset ?? '—'}`,
    `Size:   ${r.boardSize ?? '—'}`,
  ].join('\n');
}
</script>

<template>
  <div class="library-table">
    <div ref="headerEl" class="library-table-header" :style="{ gridTemplateColumns }">
      <!--
        Resolution roadmap Phase 2 (audit L2): spec-driven — only
        columns `columnFit.visible` decided fit get a track at all;
        there is no state where a column renders below its declared
        minWidth. Per-user-id-enumeration design: the `ordinal`
        column is not sortable (display_ordinal isn't in the
        backend's GameListSort vocabulary), so it renders as a plain
        span rather than a `.th` button.
      -->
      <template v-for="col in columnFit.visible" :key="col.key">
        <span v-if="col.key === 'ordinal'" class="th col-ordinal">#</span>
        <button
          v-else
          class="th"
          :class="col.grow ? 'col-player' : `col-${col.key}`"
          @click="onSortableHeaderClick(col.key)"
        >{{ col.label }}{{ sortIndicatorFor(col.key) }}</button>
      </template>
      <!--
        Elision indicator (audit R1/L2's own fix shape): a dropped
        column is never silent — this cell names how many, and its
        title names which ones, so the loss is discoverable rather
        than merely inferable from a shorter header.
      -->
      <span
        v-if="columnFit.dropped.length > 0"
        class="th col-indicator"
        :title="droppedColumnsTitle"
      >+{{ columnFit.dropped.length }} more</span>
    </div>
    <div ref="scrollContainer" class="library-table-scroll">
      <div
        v-if="totalCount === null"
        class="library-empty"
      >Loading…</div>
      <div
        v-else-if="totalCount === 0"
        class="library-empty"
      >No games in library. Import some SGFs to begin.</div>
      <div
        v-else
        class="library-table-spacer"
        :style="{ height: v.totalHeightPx.value + 'px' }"
      >
        <div
          class="library-table-rows"
          :style="{ transform: `translateY(${v.topSpacerPx.value}px)` }"
        >
          <div
            v-for="i in visibleIndices"
            :key="i"
            class="library-row"
            :class="{
              loading: isRowLoading(i),
              selected: rowAt(i)?.id === selectedId,
            }"
            :style="{ height: ROW_HEIGHT_PX + 'px', gridTemplateColumns }"
            :title="rowTitle(i)"
            @click="(e) => onRowClick(e, i)"
            @mousedown="(e) => onRowMousedown(e, i)"
          >
            <template v-if="rowAt(i)">
              <template v-for="col in columnFit.visible" :key="col.key">
                <span v-if="col.key === 'ordinal'" class="td col-ordinal">{{ rowAt(i)?.displayOrdinal }}</span>
                <span v-else-if="col.key === 'playerBlack'" class="td col-player">{{ rowAt(i)?.playerBlack ?? '—' }}</span>
                <span v-else-if="col.key === 'playerWhite'" class="td col-player">{{ rowAt(i)?.playerWhite ?? '—' }}</span>
                <span v-else-if="col.key === 'date'" class="td col-date">{{ rowAt(i)?.date ?? '—' }}</span>
                <span v-else class="td col-result">{{ rowAt(i)?.result ?? '—' }}</span>
              </template>
              <span v-if="columnFit.dropped.length > 0" class="td col-indicator"></span>
            </template>
            <template v-else>
              <span class="td loading-cell" style="grid-column: 1 / -1;">…</span>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.library-table {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--surface-0);
}
.library-table-header {
  display: grid;
  /* Resolution roadmap Phase 2: grid-template-columns is no longer a
     literal here — it's bound to `gridTemplateColumns`, computed from
     `columnFit.visible` (library-table-columns.ts owns the per-column
     widths). overflow-x: auto is the fallback the spec's own fit
     guarantee should make unreachable in practice (the fit decision
     never lets the visible set exceed the measured width), but it's
     the honest floor per audit R1: a container that somehow still
     can't fit its content scrolls, it never clips silently. */
  gap: var(--space-default);
  padding: var(--space-tight) var(--space-default);
  overflow-x: auto;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border-1);
  flex: 0 0 auto;
}
.th {
  text-align: left;
  font-size: var(--text-tiny);
  font-weight: 600;
  color: var(--text-2);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.th:hover { color: var(--accent-primary); }
/* Elision indicator (audit R1/L2 fix shape) — a visible, not silent,
   signal that columns were dropped for width. Deliberately not a
   `.th` button (nothing to sort); `--text-2`/`--text-tiny` were
   already real tokens (theme.css) at the time this rule was written,
   unlike the ghost `--text-muted` this file's other rules referenced
   then (ledger row 1014: all eight ghost tokens across the library
   surface, including `--text-muted` here, were rewritten to their
   real theme.css equivalents). */
.col-indicator {
  color: var(--text-2);
  font-size: var(--text-tiny);
  font-style: italic;
  white-space: nowrap;
}
.library-table-scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: auto;
  position: relative;
}
.library-table-spacer { position: relative; }
.library-table-rows {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
}
.library-row {
  display: grid;
  /* grid-template-columns bound in the template — see the header's
     own comment; header and row must always share the same template
     so columns line up. */
  gap: var(--space-default);
  padding: 0 var(--space-default);
  font-size: var(--text-body);
  align-items: center;
  cursor: pointer;
  border-bottom: 1px solid var(--border-1);
  /* Audit L7: a single click now opens the row (see the file header
     comment), but the browser's native double-click word-selection
     is a gesture-level default independent of which app events are
     bound — it fires on a physical double-click regardless. Row
     text is not meant to be selectable content (it opens on click),
     so this kills the artifact unconditionally rather than only for
     whichever interaction model happened to be chosen. */
  user-select: none;
}
.library-row:hover { background: var(--surface-2); }
/* Selection highlight: only the background changes. Forcing a
   foreground colour against the accent-primary substrate produced
   a low-contrast grey-on-blue that was hard to read; inheriting
   the default body text colour keeps readability constant
   between selected and unselected rows. */
.library-row.selected { background: var(--accent-primary); }
.library-row.loading { opacity: 0.5; }
.td {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.loading-cell { color: var(--text-2); }
.library-empty {
  padding: var(--space-loose);
  text-align: center;
  color: var(--text-2);
}
</style>
