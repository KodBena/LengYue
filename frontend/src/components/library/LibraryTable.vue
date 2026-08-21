<script setup lang="ts">
/**
 * src/components/library/LibraryTable.vue
 *
 * Virtual-scrolled library list. Sortable column headers,
 * fixed-row-height rendering via `useVirtualRowList`. Emits
 * `select` on a plain row click, `open` on double-click or Enter,
 * and `visible-range` whenever the rendered window changes so the
 * parent can call `ensureRange` on its `useLibraryQuery`.
 *
 * Row-opening interaction (ledger row 1015 → commissioner
 * adjudication, ledger row 1106): SELECT-PREVIEWS, EXPLICIT-OPEN.
 * A plain click selects a row and updates the preview pane only —
 * nothing loads onto the board, no confirm-load modal can fire from
 * a plain click. Opening is an explicit, separate gesture:
 * double-click, or Enter on a selected row (mirrors the file-
 * manager / mail-client master-detail idiom this surface's own
 * split list+preview layout already commits to — click browses,
 * a distinct commit gesture opens). This overrules the single-
 * click-opens option explored earlier in this same ledger row;
 * see ledger row 1106 for the adjudication. `user-select: none`
 * on `.library-row` (below) is unconditional either way — it kills
 * the double-click native word-selection artifact (L7's "text
 * smear") regardless of which gesture opens.
 *
 * Keyboard operability (audit L4, ledger row 1016 / scope-corrected
 * row 1037): ROVING TABINDEX over the rendered rows. Exactly one
 * row — the one at `focusIndex` — carries `tabindex="0"`; every
 * other rendered row carries `tabindex="-1"`. That makes the list a
 * single Tab stop (genre: native listbox / mail-client / file-
 * manager row lists) rather than the earlier per-row tabindex flood.
 * ArrowUp/ArrowDown/Home/End/PageUp/PageDown move `focusIndex`,
 * update the selection (mirrors click-select — see `moveFocusTo`),
 * and coordinate with the virtualizer: moving onto a row outside the
 * rendered window first adjusts `scrollTop` (via `scrollIndexIntoView`)
 * so `useVirtualRowList` brings it into the render window, THEN
 * (after Vue's next DOM patch) calls `.focus()` on the now-existing
 * element (`focusRowAfterRender`) — a plain synchronous `.focus()`
 * at move-time would target a DOM node that doesn't exist yet for an
 * off-window row. Enter still opens the focused/selected row through
 * the existing guard path.
 *
 * Roles: rows container is `role="listbox"` (single-selection, row-
 * grain focus/selection, no cell-level nav — the file-manager/mail-
 * client shape the audit itself names) with `role="option"` +
 * `aria-selected` per row; NOT `role="grid"`/`row` — nothing here
 * does cell-level navigation, so the heavier grid pattern would be
 * unearned. Sortable column headers carry `aria-sort` (they ARE
 * sortable today, via `onSortableHeaderClick`); the `ordinal` column
 * is not sortable and gets none, per L19/L4 scope — no new sorting
 * behavior was added.
 *
 * Thin renderer. Data flow:
 *   parent (LibraryTab)
 *     → owns useLibraryQuery
 *     → passes totalCount, rowAt, isRowLoading, sort, direction in
 *     → listens for visible-range to call ensureRange on the
 *       composable
 *     → listens for sort changes to update the query
 *
 * Rows 1525/1526 (commissioner screenshot ~/smallscreen.png, dispatch
 * "library-preview-density"): the reported defect — "a single game's
 * board-preview thumbnail expands to fill the panel width, so ...
 * exactly one game is visible" — is NOT a per-row thumbnail in THIS
 * component; these rows are, and stay, plain text columns (no
 * canvas/SVG board at all). What the screenshot actually shows is
 * LibraryPreviewPane's single selected-game detail card (matchup +
 * date/result + board) filling the whole visible area because its
 * board had no height cap, starving THIS list's grid row down to
 * ~0px in LibraryTab's narrow/stacked layout — fixed at the source in
 * LibraryPreviewPane.vue and LibraryTab.vue (see their own comments),
 * not here.
 *
 * A mid-flight commissioner refinement asked to evaluate reusing the
 * sidebar rail's MiniBoardCanvas-based thumb idiom for "the library
 * game-list previews" specifically — i.e. adding a real per-ROW board
 * thumbnail to every rendered row here, not just the one detail pane.
 * Evaluated and NOT done, for a concrete data-shape reason rather than
 * taste: `LibraryGameListItem` (this component's own row type)
 * deliberately excludes the SGF body — "the SGF body ships only via
 * the detail endpoint per the column-projection discipline (~2 KB/row
 * × 100 rows would dwarf the metadata)", per that type's own doc
 * comment in types/library.ts. Rendering a board thumbnail needs a
 * parsed board (stones/lastMove), which needs that SGF body; there is
 * no cheaper server-side thumbnail field today. Painting one canvas
 * per visible row is the part MiniBoardCanvas is built cheaply for
 * (ADR-0010) — virtualization already bounds instance count to the
 * rendered window — but FETCHING and PARSING a full SGF per visible
 * row, every scroll step, to feed it, is a genuinely new per-row cost
 * this list's own virtualized/dense design was built to avoid, not a
 * rendering-cost problem MiniBoardCanvas solves. That is reported here
 * as the honest reason for falling back to the capped, fixed-size,
 * SINGLE-instance reuse in LibraryPreviewPane.vue instead of forcing a
 * second, heavier shape onto every row of a dense list.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
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
  // Plain click: select for preview only. Nothing loads onto the
  // board from this gesture (ledger row 1106).
  (e: 'select', row: LibraryGameListItem): void;
  // Double-click, or Enter on a selected row: the explicit open
  // gesture (ledger row 1106).
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
  // Not a type predicate (see isSortableColumn's docstring above): the
  // guard above rules out 'ordinal', the one LibraryColumnKey member
  // outside LibrarySortColumn, so every key reaching here is one.
  onHeaderClick(key as LibrarySortColumn);
}
function sortIndicatorFor(key: LibraryColumnKey): string {
  // Same non-predicate narrowing as onSortableHeaderClick above.
  return isSortableColumn(key) ? sortIndicator(key as LibrarySortColumn) : '';
}
// aria-sort (audit L4/L19 roles item): only meaningful on the
// sortable headers — `ordinal` isn't sortable (see isSortableColumn's
// own comment) and gets no aria-sort at all, not `'none'`; `'none'`
// on a non-sortable header would misreport it as sortable-but-unsorted
// to assistive tech.
function ariaSortFor(key: LibraryColumnKey): 'ascending' | 'descending' | 'none' | undefined {
  if (!isSortableColumn(key)) return undefined;
  if (props.sort !== key) return 'none';
  return props.direction === 'asc' ? 'ascending' : 'descending';
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

// Roving tabindex (audit L4): the single row-index that currently
// carries `tabindex="0"`. Defaults to 0 — an as-yet-unselected list
// still needs exactly one tab stop the moment the user Tabs in.
// Deliberately NOT resolved from `props.selectedId` on mount: the
// query composable exposes no id→index lookup (only `rowAt(i)`,
// index→row), and in this app's actual mount lifecycle LibraryTab
// never remounts with a pre-existing `selectedId` — assumed fact,
// ledgered per CLAUDE.md point 7.
const focusIndex = ref(0);

// Tracks the row-index `select` was already emitted for, so a row
// whose data arrives AFTER focus already moved onto it (the
// virtualization case: Home/End can jump focus onto an index whose
// data hasn't been fetched yet) emits exactly once when it loads,
// and a click that re-emits `select` for the same index doesn't
// get double-fired by the watcher below.
let selectEmittedForIndex = -1;

function emitSelectForFocusIndex(idx: number): void {
  if (selectEmittedForIndex === idx) return;
  const row = props.rowAt(idx);
  if (!row) return;
  selectEmittedForIndex = idx;
  emit('select', row);
}

// Deferred-select watcher: fires once the row at `focusIndex` becomes
// available, covering the case where keyboard nav moved focus onto an
// unrendered/unfetched row before its data arrived. `visible-range`
// (emitted below from `v.visibleStart`/`v.visibleEnd`) already drives
// the parent's `ensureRange` fetch; this just picks up the result.
watch(
  () => props.rowAt(focusIndex.value),
  () => emitSelectForFocusIndex(focusIndex.value),
);

// Brings row `idx` into the virtualizer's render window by adjusting
// `scrollTop` directly — same clamped-scroll math as any manual
// scrollIntoView: scroll up if the target is above the window, down
// if below, leave alone if already inside it.
function scrollIndexIntoView(idx: number): void {
  const el = scrollContainer.value;
  if (!el) return;
  const rowTop = idx * ROW_HEIGHT_PX;
  const rowBottom = rowTop + ROW_HEIGHT_PX;
  let target = el.scrollTop;
  if (rowTop < el.scrollTop) {
    target = rowTop;
  } else if (rowBottom > el.scrollTop + el.clientHeight) {
    target = rowBottom - el.clientHeight;
  }
  if (target !== el.scrollTop) el.scrollTop = target;
  // A programmatic `scrollTop` write doesn't reliably raise a native
  // `scroll` event synchronously (jsdom in particular never fires
  // one at all) — update the reactive `scrollTop` ref directly so
  // `useVirtualRowList`'s visibleStart/visibleEnd recompute
  // regardless of whether the `scroll` listener also fires.
  scrollTop.value = el.scrollTop;
}

// Focuses row `idx`'s DOM element once it exists. For an
// already-rendered row this resolves on the very next microtask; for
// a row `scrollIndexIntoView` just brought into the render window,
// `nextTick()` waits for Vue's DOM patch that actually creates the
// element before `.focus()` is attempted — the property audit L4
// calls out explicitly as the regression-prone case.
async function focusRowAfterRender(idx: number): Promise<void> {
  await nextTick();
  const el = scrollContainer.value?.querySelector<HTMLElement>(`[data-row-index="${idx}"]`);
  el?.focus();
}

// Rows fully visible in the current containerHeight — PageUp/PageDown
// step by this many. `Math.max(1, …)` keeps a page-step meaningful
// even before `containerHeight` has been measured (onMounted hasn't
// run yet, or jsdom reports 0).
function pageSize(): number {
  return Math.max(1, Math.floor(containerHeight.value / ROW_HEIGHT_PX));
}

// Single entry point for every keyboard-nav move: clamps to
// [0, totalCount - 1], updates the roving tab stop, scrolls the
// target into the virtualizer's render window, emits `select` (mirrors
// click-select — "arrow navigation ... and preview follows, same as
// click"), and focuses the row once it exists in the DOM.
function moveFocusTo(idx: number): void {
  const total = props.totalCount ?? 0;
  if (total <= 0) return;
  const clamped = Math.max(0, Math.min(total - 1, idx));
  focusIndex.value = clamped;
  scrollIndexIntoView(clamped);
  emitSelectForFocusIndex(clamped);
  void focusRowAfterRender(clamped);
}

// Audit L21 (ledger row 1019 residual sweep): a newly-chosen sort
// column must start ascending — genre convention (OGS, every file
// manager, every spreadsheet) — and only toggle on a second click on
// the SAME column. The prior version left `direction` untouched on a
// column switch, so it silently inherited whatever direction the
// PREVIOUS column was left in (the default is 'desc', so the very
// first click on any text column landed the user at the end of the
// alphabet with no indication why — witnessed live: clicking "Black"
// from the default date-desc sort produced `thug, maxiao888, bork,
// bork, bork`, not `An Cho-yeong, ...`).
function onHeaderClick(col: LibrarySortColumn): void {
  if (props.sort === col) {
    emit('update:direction', props.direction === 'asc' ? 'desc' : 'asc');
  } else {
    emit('update:sort', col);
    emit('update:direction', 'asc');
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
  // affordance. Takes precedence over plain-click's select-only
  // behavior — a modified click is always an open request.
  if (isPasteClick(event)) {
    emit('open-new-tab', row);
    return;
  }
  // Plain click → select for preview only (ledger row 1106). Opening
  // is the separate, explicit gesture below (dblclick / Enter). Also
  // moves the roving tab stop onto the clicked row — a click and an
  // arrow-key move land on the same row either way, so both funnel
  // through the same "this index is now current" bookkeeping.
  focusIndex.value = idx;
  selectEmittedForIndex = idx;
  emit('select', row);
}
function onRowDblclick(idx: number): void {
  const row = props.rowAt(idx);
  if (row) emit('open', row);
}
function onRowKeydown(event: KeyboardEvent, idx: number): void {
  switch (event.key) {
    case 'Enter': {
      const row = props.rowAt(idx);
      if (!row) return;
      event.preventDefault();
      emit('open', row);
      return;
    }
    case 'ArrowDown':
      event.preventDefault();
      moveFocusTo(idx + 1);
      return;
    case 'ArrowUp':
      event.preventDefault();
      moveFocusTo(idx - 1);
      return;
    case 'Home':
      event.preventDefault();
      moveFocusTo(0);
      return;
    case 'End':
      event.preventDefault();
      moveFocusTo((props.totalCount ?? 1) - 1);
      return;
    case 'PageDown':
      event.preventDefault();
      moveFocusTo(idx + pageSize());
      return;
    case 'PageUp':
      event.preventDefault();
      moveFocusTo(idx - pageSize());
      return;
    default:
      return;
  }
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
          :aria-sort="ariaSortFor(col.key)"
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
          role="listbox"
          aria-label="Library games"
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
            :data-row-index="i"
            role="option"
            :aria-selected="rowAt(i)?.id === selectedId"
            :tabindex="i === focusIndex ? 0 : -1"
            @click="(e) => onRowClick(e, i)"
            @dblclick="onRowDblclick(i)"
            @keydown="(e) => onRowKeydown(e, i)"
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
  color: var(--text-0);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
/* wC-contrast (F9): readable text is --text-0, not accent-primary — 2.08:1 in the default cluster theme. */
.th:hover { color: var(--text-0); }
/* Elision indicator (audit R1/L2 fix shape) — a visible, not silent,
   signal that columns were dropped for width. Deliberately not a
   `.th` button (nothing to sort); `--text-2`/`--text-tiny` were
   already real tokens (theme.css) at the time this rule was written,
   unlike the ghost `--text-muted` this file's other rules referenced
   then (ledger row 1014: all eight ghost tokens across the library
   surface, including `--text-muted` here, were rewritten to their
   real theme.css equivalents). */
.col-indicator {
  color: var(--text-0);
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
  /* Audit L7 / ledger row 1106: double-click is the ratified open
     gesture, and the browser's native double-click word-selection
     fires on that same physical gesture regardless of which app
     events are bound to it. Row text is not meant to be selectable
     content, so this kills the artifact unconditionally. */
  user-select: none;
}
.library-row:hover { background: var(--surface-2); }
/* Roving-tabindex focus ring (audit L4): only the one row currently
   at `tabindex="0"` is ever reachable by keyboard, so its
   `:focus-visible` state needs to be legible against both the plain
   and `.selected` (accent-primary background) row states. Inset via
   negative offset so it doesn't get clipped by the row's own
   border-bottom / the scroll container's overflow. */
.library-row:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: -2px;
}
/* Selection highlight (audit L11 / ledger row 1018). The prior
   comment here claimed inheriting the default body text colour
   "keeps readability constant between selected and unselected rows"
   — it does not: inheriting swaps one contrast failure (a forced
   grey-on-blue, per the prior comment) for another and moves it into
   a different theme. Measured: in `cluster`, the inherited body
   colour (--text-1, cluster-12-4 purple) against --accent-primary
   (cluster-12-2 sky blue) is ~7.74:1 — passes, fine to keep. In
   `dark`, the inherited body colour (--text-0, #fff — <body> sets no
   --text-1 override so this is what actually inherits) against
   --accent-primary (#4aaef0) is ~2.44:1 — the measured failure.
   `--text-on-accent` (theme.css) is a category-correct, theme-aware
   role-alias token minted for exactly this role — "dark text on a
   light accent chip" — with a real value in both palettes; see
   theme.css's own definition for the derivation. */
.library-row.selected { background: var(--accent-primary); color: var(--text-on-accent); }
.library-row.loading { opacity: 0.5; }
.td {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.loading-cell { color: var(--text-0); }
.library-empty {
  padding: var(--space-loose);
  text-align: center;
  color: var(--text-0);
}
</style>
