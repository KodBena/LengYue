<!--
  src/components/chrome/SidebarWidget.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { store, setActiveBoard, createBoard, closeBoard } from '../../store';
import BoardTab from '../board/BoardTab.vue';
import MiniBoard from '../board/MiniBoard.vue';
import { useThumbnailCache } from '../../composables/cards/useThumbnailCache';
import { useJankTest } from '../../composables/perf/useJankTest';
import type { BoardId, BoardState } from '../../types';
import type { BoardSnapshot } from '../../engine/board-geometry';

// Dev-only "jank test" affordance (below). import.meta.env.DEV is statically
// folded, so the button and its composable dead-code-eliminate from prod
// builds — the harness must never ship to users.
const isDevBuild = import.meta.env.DEV;
const jankTest = useJankTest();

// Load / save SGF emits relocated here from Toolbar (2026-05-15):
// SGF-file operations act on the board collection, not on engine
// telemetry, so they belong adjacent to the thumb-list's other
// board-lifecycle action (the `+` new-board button). The parent
// (`App.vue`) listens for these events and dispatches to the
// existing `openFileDialog` / `downloadActiveBoard` handlers.
defineEmits<{
  (e: 'load-sgf'): void;
  (e: 'save-sgf'): void;
}>();

const { getSnapshot, getSnapshotSync } = useThumbnailCache();

// ── Docked hover preview ────────────────────────────────────────────────────
// The board-tab hover preview is a DOCKED pane at the foot of the rail, not a
// cursor-following floating thumbnail. That redesign dissolves the two
// long-standing complaints about the old FloatingThumbnail at the root rather
// than guarding around them:
//
//   - "lingers forever": the floating thumbnail was shown via an async
//     `await getThumbnailSvg(...) → show()` while `hide()` ran synchronously on
//     mouseleave. A leave that raced the fetch — or, more often, a `mouseleave`
//     that was simply lost when the tab re-rendered under the pointer — left a
//     visible box with no pending hide, stranding it. Here the *visible state*
//     is `previewBoardId`, set and cleared synchronously; the rendered snapshot
//     is DERIVED from it (computed below). A late fetch only populates the
//     shared cache — it never writes the visible state — so it cannot resurrect
//     a cleared preview. Clearing the id empties the pane immediately and it
//     stays empty. No generation token, no imperative show/hide, no race to
//     guard.
//   - "moves around unpredictably": the pane is docked, so there is nothing to
//     reposition at the cursor.
//
// TreeWidget keeps the floating FloatingThumbnail for variation previews (it is
// contextual to the tree); that surface is hardened in FloatingThumbnail.vue
// itself rather than redesigned.
//
// We store the board *id*, not the BoardState object: `updateBoardState`
// replaces the object on navigation, so re-finding off the live store keeps the
// preview reading the board's current node.
const previewBoardId = ref<BoardId | null>(null);

const previewSnapshot = computed<BoardSnapshot | null>(() => {
  const id = previewBoardId.value;
  if (!id) return null;
  const board = store.boards.find(b => b.id === id);
  if (!board) return null;
  // Synchronous, reactive read of the shared snapshot cache. The cache Map is
  // reactive, so this re-evaluates when the warm in onHoverEnter populates the
  // entry; it returns null on a miss, so the first frame of an as-yet-uncached
  // hover is the empty placeholder, filled in once the warm resolves.
  return getSnapshotSync(board.currentNodeId);
});

function handleAdd() {
  createBoard();
}

function getReviewState(boardId: string) {
  const status = store.session.reviews[boardId as BoardId]?.status;
  if (!status) return null;

  if (status === 'AWAITING_MOVE' || status === 'ANALYZING' || status === 'LOADING') return 'ACTIVE';
  if (status === 'FINISHED') return 'INTERMISSION';
  return null;
}

function onHoverEnter(board: BoardState) {
  previewBoardId.value = board.id;
  // Fire-and-forget warm of the shared cache for that board's current node.
  // The reactive `previewSnapshot` picks the result up; we deliberately do NOT
  // assign the awaited value to any visible state — that async write-back is
  // exactly the race this redesign removes.
  void getSnapshot(board.currentNodeId, board.id);
}

function onHoverLeave() {
  previewBoardId.value = null;
}
</script>

<template>
  <div id="sidebar-widget">
    <!-- File-ops header — LOAD / SAVE for SGF import/export, sitting
         above the thumb-list so the affordance is visible regardless
         of how many boards crowd the rail. Placed here (not foot-
         adjacent to `+`) deliberately: LOAD / SAVE act on EXTERNAL
         files; `+` acts on the IN-MEMORY collection. Spatial split
         reflects the conceptual difference, and the chrome-header
         placement is the convention any user (Go researcher or
         developer) recognises for file operations. Emits bubble to
         App.vue which dispatches to the existing `openFileDialog`
         / `downloadActiveBoard` handlers — same wiring the Toolbar
         used before the 2026-05-15 separation-of-concerns move. -->
    <div class="board-actions">
      <button class="board-action-btn" @click="$emit('load-sgf')">{{ $t('sidebar.loadSgf') }}</button>
      <button class="board-action-btn" @click="$emit('save-sgf')">{{ $t('sidebar.saveSgf') }}</button>
    </div>

    <div class="thumb-list">
      <!-- v-memo skips the parent-forced re-render of each tab. App.vue
           re-renders on every navigation, and this widget's `v-show`
           makes Vue force-update it on each parent render — which would
           re-render every BoardTab (and its rug-plot meter, a full
           variation-path walk) per nav step, including the inactive
           board's. The memo key carries only the parent-driven inputs a
           BoardTab cannot self-source: `board` (object identity — catches
           the move-play replacement via updateBoardState), `index` (the
           "Board N" label after a close-induced reindex), active-highlight,
           and review-border state. Cursor / analysis-depth updates
           flow through BoardTab's OWN reactive effects, which v-memo does
           not block (it suppresses parent-driven patches, not the child's
           own render effect). See docs/notes/perf-audit-game-scroll-2026-05-28.md. -->
      <BoardTab
        v-for="(board, index) in store.boards"
        :key="board.id"
        v-memo="[board, index, store.activeBoardIndex === index, getReviewState(board.id)]"
        :state="board"
        :index="index"
        :isActive="store.activeBoardIndex === index"
        :reviewState="getReviewState(board.id)"
        @click="setActiveBoard(index)"
        @close="closeBoard(board.id)"
        @hover-enter="onHoverEnter(board)"
        @hover-leave="onHoverLeave"
      />
    </div>

    <button class="tab-add-btn" :title="$t('sidebar.newBoard')" @click="handleAdd">+</button>

    <!-- Dev-only thumbnail-preview "jank test". Loads 16 boards (one fixed
         342-move Shusaku game + 15 random library games), auto-navigates the
         long game, and scrubs the docked hover preview at a 20–50 ms cadence so
         a human can capture a DevTools performance profile of the preview
         render under stress. Gated to dev builds (import.meta.env.DEV); the
         literal "jank test" label is intentional — it is a developer
         affordance, not a user-facing string, so it skips i18n. -->
    <button
      v-if="isDevBuild"
      class="jank-test-btn"
      :class="{ running: jankTest.isRunning.value }"
      :title="'Dev: stress the thumbnail-preview render (loads 16 boards, auto-navs the long Shusaku game, scrubs the hover preview). Click again to stop.'"
      @click="jankTest.toggle()"
    >{{ jankTest.isRunning.value ? 'jank test (stop)' : 'jank test' }}</button>

    <!-- Docked hover-preview shelf — the vertical split below `+`. A fixed
         framed box that shows the hovered board's current position and falls
         back to an empty frame when nothing is hovered (previewSnapshot null).
         Reactive MiniBoard, not v-html: same race-free projection the analysis
         chart-hover preview uses. -->
    <div class="board-preview">
      <MiniBoard v-if="previewSnapshot" :snapshot="previewSnapshot" />
    </div>
  </div>
</template>

<style scoped>
/* magic-literal: 168px `#sidebar-widget` width. The rail was 90px when it held
   only the centred board tabs (`--tab-width`, currently 86px in BoardTab.vue);
   it was widened to seat the 150px docked preview box (`.board-preview` below)
   at the foot. 168px = 150px preview + a ~9px gutter each side. The board tabs
   still render at their own 86px and sit centred, so they carry a wider gutter
   now — a deliberate "narrow tab strip + preview shelf" split. Both the rail
   width and the tab gutter are visual tunables (the author retunes by eye); if
   `.board-preview`'s box grows, raise this in tandem, floor = that box width. */
#sidebar-widget {
  display: flex; flex-direction: column; align-items: center;
  padding: var(--space-medium) 0; background: var(--surface-0); height: 100%;
  border-right: 1px solid var(--surface-1); width: 168px;
}

.thumb-list {
  flex: 1; overflow-y: auto; width: 100%; display: flex;
  flex-direction: column; align-items: center;
}

.tab-add-btn {
  width: 20px; height: 20px; border-radius: 0%; border: none;
  background: var(--surface-2); color: var(--text-0); font-size: var(--text-emphasis); cursor: pointer; margin-top: var(--space-medium);
}

/* Dev-only "jank test" toggle — quiet chrome (surface-2 fill, monospace,
   matching the LOAD/SAVE board-action register) so it reads as a developer
   affordance, not a primary action. The `.running` accent makes it observable
   that the stress loop is in flight. Only mounts in dev builds. */
.jank-test-btn {
  margin-top: var(--space-tight);
  width: 100%;
  max-width: 150px;
  height: 18px;
  border: none;
  border-radius: 0%;
  background: var(--surface-2);
  color: var(--text-1);
  font-family: monospace;
  font-size: var(--text-tiny);
  text-transform: uppercase;
  letter-spacing: var(--tracking-tight);
  cursor: pointer;
  flex-shrink: 0;
}
.jank-test-btn.running {
  background: var(--accent-primary);
  color: var(--surface-0);
}

/* Docked hover-preview shelf. magic-literal: 150px box matches the app's
   established thumbnail size (the old FloatingThumbnail, the card thumbnails).
   A top border sets the shelf off from the scrollable list / `+` above it —
   the "vertical split". When idle (no board hovered) the frame stands empty as
   a quiet placeholder, honouring the rail's understated chrome register. The
   MiniBoard fills the frame; box-sizing keeps the 1px border inside the 150px. */
.board-preview {
  width: 150px;
  height: 150px;
  box-sizing: border-box;
  margin-top: var(--space-medium);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  background: var(--surface-0);
  overflow: hidden;
  flex-shrink: 0;
}

/* LOAD / SAVE file-ops header — horizontal pair at the top of
   the sidebar, above the scrollable thumb-list. Thin separator
   on the bottom edge sets the header off from the list without
   adding a heavy chrome element. Visual register matches
   `.tab-add-btn` (no border on the buttons themselves, surface-2
   fill) so the row reads as quiet chrome rather than a primary-
   action shelf — the user's "out of sight, out of mind during
   study" aesthetic preference, honoured under a discoverable
   placement. */
.board-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--space-tight);
  width: 100%;
  padding: 0 var(--space-tight) var(--space-tight);
  border-bottom: 1px solid var(--surface-1);
  margin-bottom: var(--space-tight);
}
.board-action-btn {
  flex: 1;
  height: 20px;
  border-radius: 0%;
  border: none;
  background: var(--surface-2);
  color: var(--text-0);
  font-family: monospace;
  font-size: var(--text-tiny);
  text-transform: uppercase;
  letter-spacing: var(--tracking-tight);
  cursor: pointer;
  padding: 0 var(--space-tight);
  min-width: 0;
}
</style>
