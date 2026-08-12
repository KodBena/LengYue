<!--
  src/components/chrome/LocalePicker.vue
  Top-nav locale picker. Renders the active locale as a flag + native
  name on a compact dropdown trigger; clicking expands a menu listing
  every SupportedLocale with the same flag + native-name layout, with
  the active row highlighted. Selecting writes through `useLocale`'s
  setter (→ store → useAppBootstrap watch → vue-i18n locale ref).
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useLocale } from '../../composables/chrome/useLocale';
import { useFixedAnchoredPopover } from '../../composables/chrome/useFixedAnchoredPopover';
import type { SupportedLocale } from '../../i18n/locales';

const { locale, supportedLocales, displayName, flag, isMachineTranslated, setLocale } = useLocale();

const open = ref(false);

const currentFlag = computed(() => flag(locale.value));
const currentName = computed(() => displayName(locale.value));

function toggle(): void {
  open.value = !open.value;
}

function pick(loc: SupportedLocale): void {
  setLocale(loc);
  open.value = false;
}

// Clip-ancestor fix (row 1984, the popover-clip class's 4th member —
// see the class sweep at .claude/dispatch-reports/lyt-popover-clip-class.md
// and the review that enumerated LocalePicker as click-toggled and
// therefore deferred pending a contract check,
// .claude/dispatch-reports/lyt-popover-clip-class-review.md). `.locale-menu`
// mounts inside `App.vue`'s `.lyt-toolbar-strip` (via ToolbarAppCluster),
// the same `overflow-y: auto` clipping ancestor `ToolbarSliderPopover.vue`'s
// D1 fix escaped. `useFixedAnchoredPopover` reads `open` as a plain
// `Ref<boolean>` (see that composable's own header — "the SAME `open` ref
// `useHoverPopover` (or an equivalent open/close boolean source)
// returned") and never inspects HOW it flips; this component's `toggle()`
// click-handler writes the same ref `useHoverPopover`'s mouseenter/leave
// pair would, so the composable composes with click-toggle open state
// with no fork required — its contract is genuinely interaction-agnostic.
const triggerEl = ref<HTMLElement | null>(null);
const popoverEl = ref<HTMLElement | null>(null);
const { style: popoverStyle } = useFixedAnchoredPopover(open, triggerEl, popoverEl, { align: 'left' });

// Document-level dismiss: clicking anywhere outside the root closes
// the menu. Using `pointerdown` (capture phase) so the closer fires
// before any in-menu click handler that mutates state, preventing the
// open=true flicker if the user clicks the trigger again to dismiss.
// Listener is installed only while the menu is open and torn down on
// close — keeps the global-listener footprint zero in the steady
// state and follows the resource-ownership convention codified in
// docs/archive/notes/resource-ownership-audit-plan.md.
const rootRef = ref<HTMLElement | null>(null);

function onDocumentPointerDown(e: PointerEvent): void {
  if (!rootRef.value) return;
  if (rootRef.value.contains(e.target as Node)) return; // DOM: event.target is an EventTarget; Node is contains()'s arg type
  open.value = false;
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') open.value = false;
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

// Defensive cleanup: if the component unmounts while the menu is
// open (rare — only on a parent re-key or full app teardown), the
// document listeners would otherwise outlive the component.
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div ref="rootRef" class="locale-picker" :class="{ open }">
    <button
      ref="triggerEl"
      type="button"
      class="locale-trigger"
      :title="$t('localePicker.tooltip')"
      :aria-haspopup="true"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="flag">{{ currentFlag }}</span>
      <span class="name">{{ currentName }}</span>
      <span class="caret" aria-hidden="true">▾</span>
    </button>

    <!-- Per-locale machine-translation notice. Renders only when the
         active catalog is in MACHINE_TRANSLATED_LOCALES; the text and
         hover-detail are translated into the active locale so the
         contribute invitation reads in the user's own language. -->
    <span
      v-if="isMachineTranslated"
      class="machine-notice"
      :title="$t('localePicker.machineTranslatedTooltip')"
    >{{ $t('localePicker.machineTranslatedNotice') }}</span>

    <ul
      v-if="open"
      ref="popoverEl"
      class="locale-menu"
      role="listbox"
      :style="{ top: popoverStyle.top, left: popoverStyle.left }"
    >
      <li
        v-for="loc in supportedLocales"
        :key="loc"
        class="locale-option"
        :class="{ active: loc === locale }"
        role="option"
        :aria-selected="loc === locale"
        @click="pick(loc)"
      >
        <span class="flag">{{ flag(loc) }}</span>
        <span class="name">{{ displayName(loc) }}</span>
        <span v-if="loc === locale" class="check" aria-hidden="true">✓</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.locale-picker { position: relative; display: flex; align-items: center; gap: var(--space-tight); }

.machine-notice {
  font-size: var(--text-tiny);
  color: var(--state-warning);
  font-style: italic;
  cursor: help;
  white-space: nowrap;
}

.locale-trigger {
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  color: var(--text-0);
  height: 18px;
  padding: 0 var(--space-tight);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--space-tight);
  border-radius: var(--radius-default);
  font-size: var(--text-body);
  line-height: 1;
}
.locale-trigger:hover { color: var(--text-0); border-color: var(--border-3); }
.locale-picker.open .locale-trigger { border-color: var(--accent-primary); color: var(--text-0); }

.locale-trigger .flag { font-size: var(--text-emphasis); line-height: 1; }
.locale-trigger .name { font-size: var(--text-emphasis); }
.locale-trigger .caret { color: var(--text-disabled); font-size: var(--text-tiny); margin-left: 1px; }

.locale-menu {
  /* Clip-ancestor fix (row 1984): previously anchored under CSS's
     absolute-positioning scheme (`top: calc(100% + 4px); left: 0`) —
     clipped by `.lyt-toolbar-strip`'s `overflow-y: auto` (see the
     <script> block's clip-ancestor-fix comment above). `top`/`left`
     are now script-computed by `useFixedAnchoredPopover` (align: 'left',
     matching the prior `left: 0` anchor — the picker container is flex with
     an optional machine-translation notice to the right, so `align: 'right'`
     would drag the menu under the notice) and bound via `popoverStyle`. */
  position: fixed;
  margin: 0;
  padding: var(--space-tight) 0;
  list-style: none;
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  min-width: 140px;
  z-index: var(--z-popover-chrome); /* W4 item 3: shared toolbar/corner-chrome popover tier — see theme.css's own doc comment on the token */
}

.locale-option {
  display: flex;
  align-items: center;
  gap: var(--space-default);
  padding: var(--space-tight) var(--space-default);
  cursor: pointer;
  color: var(--text-0);
  font-size: var(--text-emphasis);
}
.locale-option:hover { background: var(--surface-2); color: var(--text-0); }
/* wC-contrast (F9): readable text is --text-0, not accent-primary — 2.08:1 in the default cluster theme. */
.locale-option.active { color: var(--text-0); }
.locale-option.active:hover { color: var(--text-0); }

.locale-option .flag { font-size: var(--text-body); line-height: 1; }
.locale-option .name { flex: 1; }
.locale-option .check { color: var(--text-0); font-size: var(--text-emphasis); }
</style>
