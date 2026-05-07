<!--
  src/components/LocalePicker.vue
  Top-nav locale picker. Renders the active locale as a flag + native
  name on a compact dropdown trigger; clicking expands a menu listing
  every SupportedLocale with the same flag + native-name layout, with
  the active row highlighted. Selecting writes through `useLocale`'s
  setter (→ store → useAppBootstrap watch → vue-i18n locale ref).
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useLocale } from '../composables/useLocale';
import type { SupportedLocale } from '../i18n/locales';

const { locale, supportedLocales, displayName, flag, setLocale } = useLocale();

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

// Document-level dismiss: clicking anywhere outside the root closes
// the menu. Using `pointerdown` (capture phase) so the closer fires
// before any in-menu click handler that mutates state, preventing the
// open=true flicker if the user clicks the trigger again to dismiss.
// Listener is installed only while the menu is open and torn down on
// close — keeps the global-listener footprint zero in the steady
// state and follows the resource-ownership convention codified in
// docs/notes/resource-ownership-audit-plan.md.
const rootRef = ref<HTMLElement | null>(null);

function onDocumentPointerDown(e: PointerEvent): void {
  if (!rootRef.value) return;
  if (rootRef.value.contains(e.target as Node)) return;
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

    <ul v-if="open" class="locale-menu" role="listbox">
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
.locale-picker { position: relative; }

.locale-trigger {
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  color: var(--text-1);
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
.locale-trigger .caret { color: var(--text-2); font-size: var(--text-tiny); margin-left: 1px; }

.locale-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  margin: 0;
  padding: var(--space-tight) 0;
  list-style: none;
  background: var(--surface-1);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  min-width: 140px;
  z-index: 1000;
}

.locale-option {
  display: flex;
  align-items: center;
  gap: var(--space-default);
  padding: var(--space-tight) var(--space-default);
  cursor: pointer;
  color: var(--text-1);
  font-size: var(--text-emphasis);
}
.locale-option:hover { background: var(--surface-2); color: var(--text-0); }
.locale-option.active { color: var(--accent-primary); }
.locale-option.active:hover { color: var(--accent-primary); }

.locale-option .flag { font-size: var(--text-body); line-height: 1; }
.locale-option .name { flex: 1; }
.locale-option .check { color: var(--accent-primary); font-size: var(--text-emphasis); }
</style>
