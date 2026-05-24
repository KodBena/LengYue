<script setup lang="ts">
/**
 * src/components/library/LibraryTable.vue
 *
 * Virtual-scrolled library list. Sortable column headers,
 * fixed-row-height rendering via `useVirtualRowList`. Emits
 * `select` on row click, `open` on row dblclick, and
 * `visible-range` whenever the rendered window changes so the
 * parent can call `ensureRange` on its `useLibraryQuery`.
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
  (e: 'select', row: LibraryGameListItem): void;
  (e: 'open', row: LibraryGameListItem): void;
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
const scrollTop = ref(0);
const containerHeight = ref(0);

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
});
onUnmounted(() => {
  resizeObserver?.disconnect();
  scrollContainer.value?.removeEventListener('scroll', onScroll);
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

function onRowClick(idx: number): void {
  const row = props.rowAt(idx);
  if (row) emit('select', row);
}
function onRowDblclick(idx: number): void {
  const row = props.rowAt(idx);
  if (row) emit('open', row);
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
    <div class="library-table-header">
      <button class="th col-player" @click="onHeaderClick('playerBlack')">Black{{ sortIndicator('playerBlack') }}</button>
      <button class="th col-player" @click="onHeaderClick('playerWhite')">White{{ sortIndicator('playerWhite') }}</button>
      <button class="th col-date" @click="onHeaderClick('date')">Date{{ sortIndicator('date') }}</button>
      <button class="th col-result" @click="onHeaderClick('result')">Result{{ sortIndicator('result') }}</button>
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
            :style="{ height: ROW_HEIGHT_PX + 'px' }"
            :title="rowTitle(i)"
            @click="onRowClick(i)"
            @dblclick="onRowDblclick(i)"
          >
            <template v-if="rowAt(i)">
              <span class="td col-player">{{ rowAt(i)?.playerBlack ?? '—' }}</span>
              <span class="td col-player">{{ rowAt(i)?.playerWhite ?? '—' }}</span>
              <span class="td col-date">{{ rowAt(i)?.date ?? '—' }}</span>
              <span class="td col-result">{{ rowAt(i)?.result ?? '—' }}</span>
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
  /* Black, White, Date, Result. The two player columns grow
     equally with the available width; Date and Result are
     fixed so player names get the maximum room. */
  grid-template-columns: 1fr 1fr 110px 80px;
  gap: var(--space-tiny);
  padding: var(--space-tiny) var(--space-small);
  background: var(--surface-2);
  border-bottom: 1px solid var(--border-subtle);
  flex: 0 0 auto;
}
.th {
  text-align: left;
  font-size: var(--text-small);
  font-weight: 600;
  color: var(--text-muted);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.th:hover { color: var(--accent-primary); }
.library-table-scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
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
  grid-template-columns: 1fr 1fr 110px 80px;
  gap: var(--space-tiny);
  padding: 0 var(--space-small);
  font-size: var(--text-body);
  align-items: center;
  cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
}
.library-row:hover { background: var(--surface-2); }
.library-row.selected { background: var(--accent-primary); color: var(--surface-1); }
.library-row.loading { opacity: 0.5; }
.td {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.loading-cell { color: var(--text-muted); }
.library-empty {
  padding: var(--space-large);
  text-align: center;
  color: var(--text-muted);
}
</style>
