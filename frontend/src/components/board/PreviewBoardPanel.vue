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
 * Best-move variation (mandate addendum item 2, `preview-board-
 * followup-build.md`): the prior build found `BoardSnapshot` had no PV
 * field at all and flagged the omission for ratification rather than
 * silently building over it — the commissioner has now filed it as a
 * defect. `boardSnapshot.pv` below reads the SAME analysis source the
 * main board's PV overlay reads: `useMoveSuggestions(getNodeId)`'s
 * `suggestions`/`buildPvMoves`, exactly what `MoveSuggestions.vue` (the
 * main board's own PV renderer) calls — no new engine demand, no new
 * plumbing, a second reader of state that already exists. The BEST
 * move's PV (`suggestions.find(s => s.isBest)`, `order === 0` in the
 * KataGo wire shape) is the one shown, unconditionally — this panel has
 * no hover surface of its own to select a different suggestion, and
 * "best" is the variation a preview thumbnail should default to.
 * `pv` stays `undefined` (never `[]`) when no analysis packet covers
 * `activeBoard`'s current node — the honest empty state the mandate
 * asks for, distinct from "analysis ran and found no PV moves".
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { activeBoard } from '../../store';
import MiniBoard from './MiniBoard.vue';
import { getBoardSize } from '../../engine/util';
import { useMoveSuggestions } from '../../composables/board/use-move-suggestions';
import type { BoardSnapshot } from '../../engine/board-geometry';
import type { NodeId } from '../../types';

// `useMoveSuggestions` takes a `() => NodeId | null` accessor (ADR-0010
// read-locality: the subscription is established where the value is
// actually consumed, inside the composable's own `computed`s). Unlike
// `BoardWidget` (always mounted with a real board), this panel can be
// live with `activeBoard` null — `null` is the honest "no position"
// signal the composable's own `| null` widening (this mandate item)
// exists for, rather than a synthetic placeholder NodeId.
const currentNodeId = (): NodeId | null => activeBoard.value?.currentNodeId ?? null;
const { suggestions, buildPvMoves } = useMoveSuggestions(currentNodeId);

const boardSnapshot = computed((): BoardSnapshot | null => {
  const board = activeBoard.value;
  if (!board) return null;
  const currentNode = board.nodes[board.currentNodeId];
  const best = suggestions.value.find((s) => s.isBest);
  const pv = best ? buildPvMoves(best.moveIndex) : [];
  return {
    size: getBoardSize(board),
    stones: board.stones,
    lastMove: currentNode?.move ?? null,
    pv: pv.length > 0 ? pv : undefined,
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
/* W4 item 4 (MiniBoard viewport clamp). FIRST DRAFT of this rule used
   `width:100%; height:100%; aspect-ratio:1/1`, which is INERT: CSS
   `aspect-ratio` only derives a dimension left `auto` — with BOTH
   width and height already pinned to 100%, the property has nothing
   to compute, so the panel simply stretched to whatever (possibly
   non-square) box its cell provided. Empirically caught by the W4
   probe (`.claude/dispatch-reports/lyt-w4-chrome-probe.mjs`) at
   900x600 with previewBoard's track shrunk: 133x204, not square.

   Fixed shape: `min(100cqw, 100cqh)` on BOTH axes — the SAME
   container-query idiom `LytNode.vue`'s own header comment already
   documents for aspect-leaf containment ("the slotted content is
   expected to size via min(100%,100cqh)/min(100%,100cqw)"),
   consulted here rather than reinvented. `.lyt-board-cell` (the
   parent leaf cell LytNode.vue wraps every `node.aspect !== null`
   leaf in) declares `container-type: size`, which is what makes
   `cqw`/`cqh` units resolve against THIS cell's own box rather than
   the viewport. Taking the MIN of the two container-relative extents
   on both width and height forces a genuine square — whichever axis
   the cell is narrower on caps BOTH dimensions — regardless of
   whether the cell itself is square, portrait, or landscape. `margin:
   auto` centers the (possibly smaller-than-cell) square within the
   parent's own `place-items: center`. */
.preview-board-panel {
  width: min(100cqw, 100cqh);
  height: min(100cqw, 100cqh);
  margin: auto;
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
