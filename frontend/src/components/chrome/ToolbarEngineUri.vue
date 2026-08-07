<!--
  src/components/chrome/ToolbarEngineUri.vue
  Compact, address-bar-like editor for the engine WebSocket URI, sat
  in the toolbar's engine cluster. Views and edits the exact same
  store cell the Settings tab's Advanced Registry editor does
  (`useEngineUriEditor` — ADR-0012, one cell, one home); this leaf
  owns none of that logic, only the click-to-edit chrome.

  Renders unconditionally (not gated on `isConnected`, unlike
  ToolbarEngineMetrics) — the URI is exactly what a user needs to see
  and fix WHILE disconnected. It reads no per-tick metric, so it
  needs none of ToolbarEngineMetrics' imperative-escape machinery
  (ADR-0010 read-locality): the stored URI only changes on an
  explicit user edit.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEngineUriEditor } from '../../composables/useEngineUriEditor';

const { t } = useI18n();
const { storedUri, isEditing, draft, beginEdit, commit, cancel } = useEngineUriEditor();

const inputEl = ref<HTMLInputElement | null>(null);

async function onDisplayClick(): Promise<void> {
  beginEdit();
  await nextTick();
  inputEl.value?.focus();
  inputEl.value?.select();
}

function onEscape(): void {
  cancel();
  // No explicit blur: `cancel()` flips `isEditing`, so Vue removes the
  // input on the next microtask, and jsdom/browser DOM removal of a
  // focused node does NOT fire blur. An explicit `.blur()` here fired
  // the still-mounted input's @blur="commit" and turned the CANCEL
  // affordance into a commit — with an invalid stored value (writable
  // via the unvalidated Advanced Registry sibling editor) that pushed a
  // spurious error toast (review BLOCKER,
  // toolbar-engine-uri-review.md finding 1).
}
</script>

<template>
  <div class="engine-uri">
    <span class="uri-lbl">{{ $t('engineUri.label') }}</span>
    <input
      v-if="isEditing"
      ref="inputEl"
      v-model="draft"
      type="text"
      class="uri-input"
      :placeholder="t('engineUri.placeholder')"
      spellcheck="false"
      @keydown.enter="commit"
      @keydown.esc="onEscape"
      @blur="commit"
    />
    <span
      v-else
      class="uri-display"
      role="button"
      tabindex="0"
      :title="storedUri || t('engineUri.placeholder')"
      @click="onDisplayClick"
      @keydown.enter="onDisplayClick"
    >{{ storedUri || t('engineUri.placeholder') }}</span>
  </div>
</template>

<style scoped>
.engine-uri { display: flex; align-items: center; gap: var(--space-tight); min-width: 0; }
.uri-lbl { color: var(--border-3); font-size: var(--text-tiny); text-transform: uppercase; letter-spacing: var(--tracking-default); flex-shrink: 0; }
/* magic-literal: 220px max-width — compact address-bar sizing that
   comfortably fits `ws://127.0.0.1:1242`-shaped values while leaving
   room for the rest of the toolbar cluster; overflow ellipses rather
   than pushing neighbouring chrome. */
.uri-display {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-1);
  font-family: monospace;
  font-size: var(--text-emphasis);
  cursor: text;
  border: 1px solid transparent;
  border-radius: var(--radius-default);
  padding: 0 var(--space-tight);
}
.uri-display:hover, .uri-display:focus-visible {
  border-color: var(--border-3);
  outline: none;
}
.uri-input {
  width: 220px;
  background: var(--surface-0);
  border: 1px solid var(--accent-primary);
  color: var(--text-1);
  font-family: monospace;
  font-size: var(--text-emphasis);
  padding: 0 var(--space-tight);
  height: 20px;
  border-radius: var(--radius-default);
  outline: none;
}
</style>
