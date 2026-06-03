<!--
  src/components/qeubo/QeuboBookmarks.vue
  Saved-bookmark list for PBO calibration. Independent of the
  experiment lifecycle (per dispatch v1.2 §3.6 — bookmarks survive
  experiment changes, deletions, etc.).
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQeubo, paramNameForKnobId } from '../../composables/useQeubo';
import { pushSystemMessage, store } from '../../store';
import type { KnobId, QeuboBookmark } from '../../types';

const { t } = useI18n();
const q = useQeubo();

const bookmarks = computed<QeuboBookmark[]>(() => {
  const list = store.profile.qeuboPinnedBookmarks ?? [];
  // Newest first — bookmarks are pushed in chronological order;
  // the user most likely wants their recent work surfaced.
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
});

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

/**
 * Compact one-line summary of a bookmark's parameters. The store
 * shape is KnobId-keyed (`qeubo.<name>`) with value vectors; the
 * display strips back to the bare param name and renders the value
 * (a scalar for the length-1 vectors qEUBO produces today, or a
 * bracketed list for a vector knob). Sorted by param name for
 * stability across reads; numbers up to 4 decimals, trailing zeros
 * trimmed.
 */
function formatParameters(params: Record<KnobId, number[]>): string {
  const entries = (Object.entries(params) as [KnobId, number[]][])
    .map(([knobId, values]) => [paramNameForKnobId(knobId), values] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return t('qeuboBookmarks.noParameters');
  return entries
    .map(([name, values]) => `${name}=${formatVector(values)}`)
    .join(', ');
}

function formatVector(values: number[]): string {
  const rendered = values.map((v) => trimZeros(v.toFixed(4)));
  return rendered.length === 1 ? rendered[0] : `[${rendered.join(', ')}]`;
}

function trimZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '') || '0';
}

function onNewFromCurrent(): void {
  const name = window.prompt(t('qeubo.prompt.bookmarkName'));
  if (name === null) return;
  try {
    q.pinCurrent(name);
    pushSystemMessage('info', t('qeubo.systemMessage.bookmarkSaved', { name: name.trim() }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushSystemMessage('error', t('qeubo.systemMessage.pinFailed', { msg }));
  }
}

function onApply(b: QeuboBookmark): void {
  q.applyBookmark(b.id);
  pushSystemMessage('info', t('qeuboBookmarks.systemMessage.applied', { name: b.name }));
}

function onRename(b: QeuboBookmark): void {
  const next = window.prompt(t('qeuboBookmarks.prompt.newName'), b.name);
  if (next === null) return;
  try {
    q.renameBookmark(b.id, next);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushSystemMessage('error', t('qeuboBookmarks.systemMessage.renameFailed', { msg }));
  }
}

function onDelete(b: QeuboBookmark): void {
  if (!window.confirm(t('qeuboBookmarks.confirm.delete', { name: b.name }))) return;
  q.deleteBookmark(b.id);
}
</script>

<template>
  <div class="qeubo-bookmarks">
    <div class="bookmarks-header">
      <span class="hint">{{ $t('qeuboBookmarks.savedCount', { n: bookmarks.length }) }}</span>
      <button
        type="button"
        class="new-btn"
        :title="$t('qeuboBookmarks.tooltip.newFromCurrent')"
        @click="onNewFromCurrent"
      >{{ $t('qeuboBookmarks.button.newFromCurrent') }}</button>
    </div>

    <div v-if="bookmarks.length === 0" class="empty-state">
      <i18n-t keypath="qeuboBookmarks.emptyState" tag="span">
        <template #code>
          <code>analysis_env.parameters</code>
        </template>
      </i18n-t>
    </div>

    <ul v-else class="bookmark-list">
      <li v-for="b in bookmarks" :key="b.id" class="bookmark-row">
        <div class="bookmark-meta">
          <div class="bookmark-name">{{ b.name }}</div>
          <div class="bookmark-date">{{ formatDate(b.createdAt) }}</div>
          <div class="bookmark-params">{{ formatParameters(b.parameters) }}</div>
        </div>
        <div class="bookmark-actions">
          <button type="button" class="apply-btn" :title="$t('qeuboBookmarks.tooltip.apply')" @click="onApply(b)">{{ $t('qeuboBookmarks.button.apply') }}</button>
          <button type="button" class="rename-btn" :title="$t('qeuboBookmarks.tooltip.rename')" @click="onRename(b)">{{ $t('qeuboBookmarks.button.rename') }}</button>
          <button type="button" class="delete-btn" :title="$t('qeuboBookmarks.tooltip.delete')" @click="onDelete(b)">×</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.qeubo-bookmarks { font-family: 'Consolas', monospace; }
.bookmarks-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-medium); }
.hint { font-size: var(--text-emphasis); color: var(--text-2); }
/* theme-exception: .new-btn / .apply-btn use muted-cyan variants
   (#1a3a4a / #2a5a7a) — same pattern as QeuboToolbar's
   action-button vocabulary. Hover-state literals retired with the
   no-mouseover-change sweep. */
.new-btn { background: #1a3a4a; border: 1px solid #2a5a7a; color: var(--accent-primary); padding: 5px 10px; font-size: var(--text-emphasis); cursor: pointer; border-radius: var(--radius-default); font-family: inherit; text-transform: uppercase; letter-spacing: var(--tracking-tight); }

.empty-state { padding: var(--space-loose); background: var(--surface-0); border: 1px dashed var(--surface-3); border-radius: var(--radius-default); color: var(--text-2); font-size: var(--text-emphasis); line-height: 1.5; text-align: center; }
.empty-state code { background: var(--surface-2); padding: 1px 5px; border-radius: var(--radius-default); color: var(--text-1); font-size: var(--text-body); }

.bookmark-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-default); }
.bookmark-row { display: flex; align-items: center; gap: var(--space-medium); padding: var(--space-medium); background: var(--surface-1); border: 1px solid var(--surface-3); border-radius: var(--radius-default); }
.bookmark-row:hover { border-color: var(--border-2); }
.bookmark-meta { flex: 1; min-width: 0; }
.bookmark-name { font-size: var(--text-emphasis); color: var(--text-0); font-weight: bold; margin-bottom: 2px; }
.bookmark-date { font-size: var(--text-body); color: var(--text-2); margin-bottom: var(--space-tight); }
.bookmark-params { font-size: var(--text-body); color: var(--text-1); font-family: monospace; overflow-wrap: anywhere; }

.bookmark-actions { display: flex; gap: var(--space-tight); flex-shrink: 0; }
.apply-btn, .rename-btn, .delete-btn { background: var(--border-2); border: 1px solid var(--border-3); color: var(--text-1); padding: var(--space-tight) var(--space-default); font-size: var(--text-body); cursor: pointer; border-radius: var(--radius-default); font-family: inherit; text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.apply-btn { border-color: #2a5a7a; color: var(--accent-primary); }
.delete-btn { color: var(--state-error); padding: 4px 7px; font-size: var(--text-emphasis); }
</style>
