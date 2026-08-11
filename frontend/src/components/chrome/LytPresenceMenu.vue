<!--
  src/components/chrome/LytPresenceMenu.vue

  W2 commission (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
  §8 W2 item 1). The corner presence menu: a small button riding the
  extreme lower-right of the chrome (mounted by App.vue as a `position:
  fixed` overlay, OUTSIDE the `<LytNode>` tree — per LYT SPEC.md §2,
  "Overlays... are not tree nodes. They contribute no constraints and
  occupy no standing space", exactly the L2 "zero standing cost beyond
  the button" the commission names) opening an opaque popover (--surface-0,
  standing occlusion law: this popover never covers #board-square — its
  corner anchor, `bottom: 100%`, keeps it above the button rather than
  spreading over the workspace) listing the three togglable panels
  (`useLytPresenceMenu.ts`'s own header explains why three, not the
  mockup's seven) as checkboxes, plus an inline rail-style selector
  (roadmap §7 ruling 2 — this popover is the natural home for both, per
  ledger row 1743's "W2 scope grows accordingly").

  Click/outside-click/Escape dismissal + aria-expanded follows
  `LocalePicker.vue`'s own established idiom verbatim (read in full
  before authoring this component) — pointerdown-capture document
  listener installed only while open, torn down on close and on
  unmount. Edge-clamped via `usePopoverEdgeClamp` (the same composable
  `ToolbarSliderPopover`/`PboPopover` use) since this button sits at the
  viewport's own right edge — a `right: 0`-anchored popover would
  otherwise overflow.

  The last-remaining-panel guard (mockup N2 fix, ported semantics via
  `useLytPresenceMenu.ts`'s `targets[].disabled`): a disabled checkbox
  carries an explanatory `title`, never a silent revert.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLytPresenceMenu, type LytPresenceTargetId } from '../../composables/chrome/useLytPresenceMenu';
import { usePopoverEdgeClamp } from '../../composables/chrome/usePopoverEdgeClamp';

const { t } = useI18n();
const { open, toggleMenu, closeMenu, targets, toggle, railStyle, setRailStyle } = useLytPresenceMenu();
const { setPopoverEl, xShift } = usePopoverEdgeClamp(open);

const rootRef = ref<HTMLElement | null>(null);

function onDocumentPointerDown(e: PointerEvent): void {
  if (!rootRef.value) return;
  if (rootRef.value.contains(e.target as Node)) return; // DOM: event.target is an EventTarget; Node is contains()'s arg type
  closeMenu();
}
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeMenu();
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

function targetTitle(id: LytPresenceTargetId, disabled: boolean): string {
  if (!disabled) return '';
  if (id === 'boardRail' && railStyle.value === 'popover') {
    return t('app.chrome.presence.boardRailPopoverStyleHint');
  }
  return t('app.chrome.presence.guardTooltip');
}

function onRailStyleChange(e: Event): void {
  // DOM cast: a native `change` event's `target` on a plain <select> in
  // this template is always the HTMLSelectElement it's bound to — no
  // Vue/branded-type unsoundness crosses this seam, same idiom
  // LocalePicker.vue's own `event.target as Node` cast uses.
  const value = (e.target as HTMLSelectElement).value;
  if (value === 'slot' || value === 'popover') setRailStyle(value);
}

const popoverId = 'lyt-presence-popover';
</script>

<template>
  <div ref="rootRef" class="lyt-presence-menu" :class="{ open }">
    <button
      id="lyt-presence-menu-btn"
      type="button"
      class="lyt-presence-trigger"
      :title="$t('app.chrome.presence.menuButton')"
      :aria-label="$t('app.chrome.presence.menuButton')"
      aria-haspopup="true"
      :aria-expanded="open"
      :aria-controls="popoverId"
      @click="toggleMenu"
    >
      <span aria-hidden="true">&#9881;</span>
    </button>

    <div
      v-if="open"
      :id="popoverId"
      :ref="setPopoverEl"
      class="lyt-presence-popover"
      role="menu"
      :style="{ transform: `translateX(${xShift}px)` }"
    >
      <div class="lyt-presence-title">{{ $t('app.chrome.presence.menuTitle') }}</div>

      <label
        v-for="target in targets"
        :key="target.id"
        class="lyt-presence-row"
        :class="{ disabled: target.disabled }"
        :title="targetTitle(target.id, target.disabled)"
        :data-lyt-presence-target="target.id"
      >
        <input
          type="checkbox"
          :checked="target.visible"
          :disabled="target.disabled"
          @change="toggle(target.id)"
        />
        <span>{{ $t(`app.chrome.presence.${target.id}`) }}</span>
      </label>

      <div class="lyt-presence-divider" role="separator"></div>

      <div class="lyt-presence-railstyle">
        <label :for="`${popoverId}-rail-style`">{{ $t('app.chrome.presence.railStyleLabel') }}</label>
        <select
          :id="`${popoverId}-rail-style`"
          class="lyt-presence-select"
          :value="railStyle"
          @change="onRailStyleChange"
        >
          <option value="slot">{{ $t('app.chrome.presence.railStyleSlot') }}</option>
          <option value="popover">{{ $t('app.chrome.presence.railStylePopover') }}</option>
        </select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lyt-presence-menu {
  position: relative;
  display: inline-flex;
}

/* 24px pointer-target floor (standing law). */
.lyt-presence-trigger {
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
.lyt-presence-trigger:hover { border-color: var(--border-3); }
.lyt-presence-menu.open .lyt-presence-trigger { border-color: var(--accent-primary); }

/* Opaque popover (standing law: no transparent overlays), anchored
   ABOVE the corner button so it never spreads across the workspace
   toward #board-square. */
.lyt-presence-popover {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 4px;
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  padding: var(--space-default);
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: var(--space-tight);
  z-index: var(--z-popover-chrome); /* W4 item 3: shared toolbar/corner-chrome popover tier — see theme.css's own doc comment on the token */
}

.lyt-presence-title {
  font-size: var(--text-body);
  font-weight: 600;
  color: var(--text-0);
  padding-bottom: var(--space-tight);
}

.lyt-presence-row {
  display: flex;
  align-items: center;
  gap: var(--space-default);
  min-height: 24px;
  padding: var(--space-tight) 0;
  color: var(--text-0);
  cursor: pointer;
}
.lyt-presence-row.disabled { color: var(--text-disabled); cursor: not-allowed; }
.lyt-presence-row input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.lyt-presence-row.disabled input[type='checkbox'] { cursor: not-allowed; }

.lyt-presence-divider {
  border-top: 1px solid var(--border-1);
  margin: var(--space-tight) 0;
}

.lyt-presence-railstyle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-default);
  color: var(--text-0);
  font-size: var(--text-body);
}
.lyt-presence-select {
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  color: var(--text-0);
  border-radius: var(--radius-default);
  height: 24px;
  padding: 0 var(--space-tight);
}
</style>
