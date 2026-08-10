<!--
  src/components/chrome/BoardRailPopoverTrigger.vue

  W2 commission (roadmap §7 ruling 2 / §8 W2 item 2, ledger row 1743):
  board rail STYLE B — "a badge-like trigger co-located near the user
  badge / corner-menu region opening the rail as an opaque popover".
  Only rendered by App.vue when `session.ui.railStyle === 'popover'`
  (mirrors `UserBadge.vue`'s trigger-button idiom: a small button that
  opens something on click — there it opens a modal, here a popover).

  The boardRail LYT leaf's own grid track is permanently collapsed in
  this style (App.vue's presence-override computation forces it, see
  `lyt-widget-registry.ts`'s boardRail note) — this component is the
  ENTIRE realization of the rail in style B, a second `SidebarWidget`
  mount (not a shared instance; Vue components are not multiply-homed)
  reusing the same `@load-sgf`/`@save-sgf` handlers App.vue's toolbar
  mount already wires (disclosed judgment call: both copies of the
  affordance stay live rather than one going silently dead).

  Click/outside-click/Escape dismissal follows the SAME idiom
  `LytPresenceMenu.vue` / `LocalePicker.vue` use (read both in full
  before authoring this component) — kept independent (its own open
  ref, its own listeners) rather than sharing state with the presence
  menu, since the two popovers are independently dismissable.

  Opaque (--surface-0, standing law), edge-clamped
  (`usePopoverEdgeClamp`, same idiom as every other click/hover
  popover in this chrome), fixed size generous enough for the rail's
  own thumbnail list to be usable (`SidebarWidget.vue`'s own virtualized
  rail governs its OWN internal sizing; this wrapper just gives it a
  bounded box that never covers #board-square — anchored above the
  trigger, like `LytPresenceMenu.vue`'s own popover).

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { usePopoverEdgeClamp } from '../../composables/chrome/usePopoverEdgeClamp';
import SidebarWidget from './SidebarWidget.vue';

defineEmits<{
  (e: 'load-sgf'): void;
  (e: 'save-sgf'): void;
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const { setPopoverEl, xShift } = usePopoverEdgeClamp(open);

function toggle(): void {
  open.value = !open.value;
}
function close(): void {
  open.value = false;
}

function onDocumentPointerDown(e: PointerEvent): void {
  if (!rootRef.value) return;
  if (rootRef.value.contains(e.target as Node)) return; // DOM: event.target is an EventTarget; Node is contains()'s arg type
  close();
}
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') close();
}
watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('keydown', onKeydown);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    document.removeEventListener('keydown', onKeydown);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onKeydown);
});

const popoverId = 'board-rail-popover';
</script>

<template>
  <div ref="rootRef" class="board-rail-trigger-wrap" :class="{ open }">
    <button
      id="board-rail-popover-btn"
      type="button"
      class="board-rail-trigger"
      :title="$t('app.chrome.presence.railPopoverButton')"
      :aria-label="$t('app.chrome.presence.railPopoverButton')"
      aria-haspopup="true"
      :aria-expanded="open"
      :aria-controls="popoverId"
      @click="toggle"
    >
      <span aria-hidden="true">&#9638;</span>
    </button>

    <div
      v-if="open"
      :id="popoverId"
      :ref="setPopoverEl"
      class="board-rail-popover"
      role="dialog"
      :aria-label="$t('app.chrome.presence.boardRail')"
      :style="{ transform: `translateX(${xShift}px)` }"
    >
      <SidebarWidget @load-sgf="$emit('load-sgf')" @save-sgf="$emit('save-sgf')" />
    </div>
  </div>
</template>

<style scoped>
.board-rail-trigger-wrap {
  position: relative;
  display: inline-flex;
}

.board-rail-trigger {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  color: var(--text-0);
  cursor: pointer;
  font-size: var(--text-emphasis);
}
.board-rail-trigger:hover { border-color: var(--border-3); }
.board-rail-trigger-wrap.open .board-rail-trigger { border-color: var(--accent-primary); }

/* Opaque (standing law), anchored ABOVE the trigger so it never spreads
   over #board-square. Bounded box: wide/tall enough for the rail's own
   virtualized thumbnail list to be usable without blanketing the
   chrome. */
.board-rail-popover {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 4px;
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  width: 220px;
  height: 420px;
  overflow: hidden;
  z-index: 1000;
}
</style>
