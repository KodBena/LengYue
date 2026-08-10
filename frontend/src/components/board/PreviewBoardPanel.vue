<script setup lang="ts">
/**
 * src/components/board/PreviewBoardPanel.vue
 *
 * W2 commission (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
 * §8 W2 item 3): the `previewBoard` LYT leaf's first real content — "a
 * MiniBoard-based variation preview reusing the library preview
 * machinery read-only — as a TAP on existing derived state (P1/P2: no
 * new engine demand, no upstream edits)".
 *
 * DISCLOSED SCOPE NARROWING (commission's own fallback clause): "if the
 * variation-to-display fact doesn't exist as readable state yet, mount
 * the ACTIVE BOARD's position as the placeholder content and disclose
 * that the variation-hover source is a later arc — do NOT invent new
 * analysis plumbing." Checked (W2 build): no existing composable/state
 * module exposes "the position the user is currently hovering/
 * considering" as a distinct readable value from "the active board's
 * current position" — `MoveSuggestions`/`BoardVariationsOverlay` render
 * hover previews IMPERATIVELY on the board canvas itself, not as a
 * separate addressable BoardSnapshot a second component could tap. So
 * this component mounts `activeBoard`'s own current position — a real,
 * honest read-only preview of *something* live (today's board, updating
 * as the user navigates it), not a stub — matching the fallback clause
 * exactly. Upgrading to true variation-hover content is a later,
 * disclosed arc (tracked in the W2 build report, not invented here).
 *
 * Projection logic (boardSnapshot below) is a straight port of
 * `LibraryPreviewPane.vue`'s own `boardSnapshot` computed (read in full
 * before authoring this component) — reusing the SAME MiniBoard/
 * BoardSnapshot machinery the commission names ("the library preview
 * machinery"), pointed at `activeBoard` instead of a library selection.
 *
 * `activeBoard` is read directly from `store` (`store/index.ts`), the
 * same precedent `StatusBar.vue` already sets for a leaf component
 * (`import { store, touchSession } from '../../store';`) — this
 * component is exactly the "display leaf reading the value it displays"
 * case ADR-0010 read-locality sanctions, and `activeBoard` is a
 * low/moderate-frequency structural read (changes on navigation, not
 * per-packet), not the high-frequency class that rule is aimed at.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { activeBoard } from '../../store';
import MiniBoard from './MiniBoard.vue';
import { getBoardSize } from '../../engine/util';
import type { BoardSnapshot } from '../../engine/board-geometry';

const boardSnapshot = computed((): BoardSnapshot | null => {
  const board = activeBoard.value;
  if (!board) return null;
  const currentNode = board.nodes[board.currentNodeId];
  return {
    size: getBoardSize(board),
    stones: board.stones,
    lastMove: currentNode?.move ?? null,
  };
});
</script>

<template>
  <div class="preview-board-panel">
    <div v-if="!boardSnapshot" class="preview-board-empty">
      {{ $t('app.chrome.presence.previewBoardEmpty') }}
    </div>
    <MiniBoard v-else :snapshot="boardSnapshot" :show-marker="true" />
  </div>
</template>

<style scoped>
.preview-board-panel {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-0);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-default);
  overflow: hidden;
}
.preview-board-empty {
  color: var(--text-0);
  font-size: var(--text-tiny);
  text-align: center;
  padding: var(--space-tight);
}
</style>
