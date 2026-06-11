<!--
  src/components/chrome/FloatingThumbnail.vue
  Cursor-anchored hover thumbnail. Imperative show(source, x, y) / hide() API,
  driven now only by TreeWidget's variation-toggle hover (the sidebar board-tab
  preview moved to a docked, reactive pane in SidebarWidget.vue). The component
  owns its own visibility arbitration — see the HIDE_RADIUS_PX note — so hosts
  need only call show()/hide() from their enter/leave handlers.

  Content contract (the render-lifecycle consolidation): show() takes a
  SYNCHRONOUS accessor `() => BoardSnapshot | null` (the ChartPreviewBox
  accessor contract, ADR-0010 read-locality). The accessor is invoked inside
  THIS leaf's computed, so the reactive subscription to the shared snapshot
  cache is established here — a cache warm re-renders only this leaf, never
  the host's render. The visible gate below is set/cleared synchronously by
  show()/hide(); the host's async warm writes only the shared cache — so a
  late resolve can FILL a visible thumbnail but can never RESURRECT a hidden
  one. This is the docked sidebar pane's race-free-by-construction shape,
  now uniform across both hover surfaces. On a cache miss the frame paints
  empty and fills when the warm resolves (the replay path is synchronous, so
  in practice that is within the same microtask turn — before the next paint).
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref, shallowRef, onUnmounted } from 'vue';
import MiniBoard from '../board/MiniBoard.vue';
import type { BoardSnapshot } from '../../engine/board-geometry';

const posX = ref(0);
const posY = ref(0);
const visible = ref(false);

// The host-supplied snapshot accessor (see the header's content contract).
// shallowRef: the accessor is an opaque closure; only reassignment matters.
const source = shallowRef<(() => BoardSnapshot | null) | null>(null);

// Derived content — null while hidden or on a cache miss. Reading the
// accessor here (and only here) keeps the cache subscription leaf-local.
const snapshot = computed<BoardSnapshot | null>(() =>
  visible.value ? (source.value?.() ?? null) : null,
);

// Iter-1 audit: caller passes the raw cursor position; the CURSOR_OFFSET_PX
// nudge below places the thumbnail to the right of and slightly below the
// cursor. Without clamping, hovers near the right or bottom viewport edge
// painted the 150×150 thumbnail partially offscreen. Clamp at show()-time
// using window inner dimensions — corner case of window resize mid-hover is
// ignored (thumbnail is hidden on mouseleave anyway).

// magic-literal: 154 = thumbnail outer box. Sum of the inner 150px
// (CSS `.floating-thumb { width: 150px; height: 150px }` below) +
// 2px border on each side (the `border: 2px solid` in the same
// rule). If the .floating-thumb width/height/border changes, this
// constant must track them — they have no shared substrate token.
const THUMB_BOX = 154;

// magic-literal: 20px cursor-offset for thumbnail anchor. Composes
// with the caller's own cursor offset so the thumbnail lands to the
// right of, and slightly below, the cursor. (TreeWidget passes the
// raw cursor; the former SidebarWidget caller added its own nudge
// before that host moved to the docked pane.) If you retune the
// pair, retune both.
const CURSOR_OFFSET_PX = 20;

// magic-literal: 80px hide-radius — the seam-level backstop for a LOST
// mouseleave, which is the dominant (and nondeterministic) source of the
// "lingers forever" finickiness. show() records the cursor position the host
// anchored at; while the pointer stays within this radius the preview holds,
// and the first pointer movement beyond it hides the preview. The reason a
// plain `mouseleave` is not enough: TreeWidget's `.toggle-group` <g> elements
// are re-created on every tree re-render, and a pointer on (or moving off) a
// <g> that is removed/replaced under it never receives the element-level
// `mouseleave`, so the host's hide() never fires and the box is stranded.
// Anchoring visibility to the live pointer rather than trusting the per-element
// leave converts "lingers forever" into "hides as soon as the pointer moves
// away". This COMPOSES with the host's mouseleave (still the fast path on a
// clean leave); it does not replace it. The listener is bound only while
// visible, so there is no always-on document-listener cost.
// Tunable by eye: large enough that in-element jitter does not false-hide,
// small enough that leaving the element hides promptly.
const HIDE_RADIUS_PX = 80;

let anchorX = 0;
let anchorY = 0;

function onDocPointerMove(e: PointerEvent): void {
  if (!visible.value) return;
  const dx = e.clientX - anchorX;
  const dy = e.clientY - anchorY;
  if (dx * dx + dy * dy > HIDE_RADIUS_PX * HIDE_RADIUS_PX) {
    hide();
  }
}

// Release every stranding watcher. Called from hide() and onUnmounted; safe to
// run when nothing is bound (removeEventListener on an unregistered pair is a
// no-op). removeEventListener must echo the capture flag the matching add used.
function detachWatchers(): void {
  document.removeEventListener('pointermove', onDocPointerMove);
  document.removeEventListener('scroll', hide, true);
  window.removeEventListener('blur', hide);
}

function hide(): void {
  visible.value = false;
  // Release the host's accessor closure (it captures the hovered node's
  // label table); the next show() supplies a fresh one.
  source.value = null;
  detachWatchers();
}

defineExpose({
  show: (snapshotSource: () => BoardSnapshot | null, x: number, y: number) => {
    source.value = snapshotSource;
    anchorX = x;
    anchorY = y;
    const proposedX = x + CURSOR_OFFSET_PX;
    const proposedY = y + CURSOR_OFFSET_PX;
    const maxX = window.innerWidth - THUMB_BOX;
    const maxY = window.innerHeight - THUMB_BOX;
    posX.value = Math.max(0, Math.min(proposedX, maxX));
    posY.value = Math.max(0, Math.min(proposedY, maxY));
    visible.value = true;
    // Bind the stranding watchers (only while visible). Three ways a lost
    // mouseleave can strand the thumbnail, one watcher each:
    //   pointermove — the pointer wanders >HIDE_RADIUS_PX from the anchor;
    //   scroll      — the anchor element scrolls out from under a still pointer
    //                 (capture, since scroll does not bubble; passive, we never
    //                 preventDefault) — the live variation tree grows during
    //                 analysis, so this is the realistic stationary-pointer case;
    //   blur        — the window loses focus mid-hover.
    // addEventListener dedupes an identical (type, fn, capture) triple, so a
    // re-anchoring show() while already visible does not stack listeners.
    document.addEventListener('pointermove', onDocPointerMove);
    document.addEventListener('scroll', hide, { capture: true, passive: true });
    window.addEventListener('blur', hide);
  },
  hide,
});

// Safety net: if the host unmounts (e.g. the tree panel closes) while the
// thumbnail is still visible, hide() never runs and the watchers would leak.
// Drop them on teardown.
onUnmounted(detachWatchers);
</script>

<template>
  <div v-if="visible" class="floating-thumb" :style="{ left: posX + 'px', top: posY + 'px' }">
    <!-- Empty frame on a cache miss; the leaf-local reactive cache read
         fills it when the host's fire-and-forget warm resolves. -->
    <MiniBoard v-if="snapshot" :snapshot="snapshot" />
  </div>
</template>

<style scoped>
.floating-thumb {
  position: fixed;
  z-index: var(--z-modal);
  width: 150px;
  height: 150px;
  background: var(--surface-2);
  border: 2px solid var(--accent-primary);
  border-radius: var(--radius-default);
  pointer-events: none;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
</style>
