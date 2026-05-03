<!--
  src/components/QeuboBookmarks.vue
  Saved-bookmark list for qEUBO calibration. Independent of the
  experiment lifecycle (per dispatch v1.2 §3.6 — bookmarks survive
  experiment changes, deletions, etc.).
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useQeubo } from '../composables/useQeubo';
import { pushSystemMessage, store } from '../store';
import type { QeuboBookmark } from '../types';

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
 * Compact one-line summary of a bookmark's parameters. Sorted by
 * name for stability across reads. Numbers rendered with up to 4
 * decimals, trailing zeros trimmed.
 */
function formatParameters(params: Record<string, number>): string {
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return '(no parameters)';
  return entries
    .map(([k, v]) => `${k}=${trimZeros(v.toFixed(4))}`)
    .join(', ');
}

function trimZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '') || '0';
}

function onNewFromCurrent(): void {
  const name = window.prompt('Bookmark name:');
  if (name === null) return;
  try {
    q.pinCurrent(name);
    pushSystemMessage('info', `qEUBO bookmark "${name.trim()}" saved.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushSystemMessage('error', `qEUBO pin failed: ${msg}`);
  }
}

function onApply(b: QeuboBookmark): void {
  q.applyBookmark(b.id);
  pushSystemMessage('info', `qEUBO bookmark "${b.name}" applied.`);
}

function onRename(b: QeuboBookmark): void {
  const next = window.prompt('New name:', b.name);
  if (next === null) return;
  try {
    q.renameBookmark(b.id, next);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushSystemMessage('error', `qEUBO rename failed: ${msg}`);
  }
}

function onDelete(b: QeuboBookmark): void {
  if (!window.confirm(`Delete bookmark "${b.name}"?`)) return;
  q.deleteBookmark(b.id);
}
</script>

<template>
  <div class="qeubo-bookmarks">
    <div class="bookmarks-header">
      <span class="hint">{{ bookmarks.length }} saved</span>
      <button
        type="button"
        class="new-btn"
        title="Snapshot the currently applied analysis_env.parameters as a new bookmark"
        @click="onNewFromCurrent"
      >+ New from current</button>
    </div>

    <div v-if="bookmarks.length === 0" class="empty-state">
      No bookmarks yet. Pin from the toolbar during a calibration session,
      or click "+ New from current" to snapshot the values currently in
      <code>analysis_env.parameters</code>.
    </div>

    <ul v-else class="bookmark-list">
      <li v-for="b in bookmarks" :key="b.id" class="bookmark-row">
        <div class="bookmark-meta">
          <div class="bookmark-name">{{ b.name }}</div>
          <div class="bookmark-date">{{ formatDate(b.createdAt) }}</div>
          <div class="bookmark-params">{{ formatParameters(b.parameters) }}</div>
        </div>
        <div class="bookmark-actions">
          <button type="button" class="apply-btn" title="Write these values into analysis_env.parameters" @click="onApply(b)">Apply</button>
          <button type="button" class="rename-btn" title="Rename" @click="onRename(b)">Rename</button>
          <button type="button" class="delete-btn" title="Delete" @click="onDelete(b)">×</button>
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
   (#1a3a4a / #2a5a7a / #2a4a5a) — same pattern as QeuboToolbar's
   action-button vocabulary. */
.new-btn { background: #1a3a4a; border: 1px solid #2a5a7a; color: var(--accent-primary); padding: 5px 10px; font-size: var(--text-emphasis); cursor: pointer; border-radius: var(--radius-default); font-family: inherit; text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.new-btn:hover { background: #2a4a5a; border-color: var(--accent-primary); color: var(--text-0); }

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
.apply-btn, .rename-btn, .delete-btn { background: var(--border-2); border: 1px solid var(--border-3); color: var(--text-1); padding: var(--space-tight) var(--space-default); font-size: var(--text-body); cursor: pointer; border-radius: var(--radius-default); font-family: inherit; text-transform: uppercase; letter-spacing: var(--tracking-tight); transition: background var(--duration-default), border-color var(--duration-default), color var(--duration-default); }
.apply-btn:hover, .rename-btn:hover { background: var(--border-3); border-color: var(--border-3); color: var(--text-0); }
.apply-btn { border-color: #2a5a7a; color: var(--accent-primary); }
.apply-btn:hover { background: #1a3a4a; border-color: var(--accent-primary); }
.delete-btn { color: var(--state-error); padding: 4px 7px; font-size: var(--text-emphasis); }
/* theme-exception: .delete-btn:hover muted-state-error surface
   (#3a1a1a / #5a1a1a) — same pattern as PaletteEditor's .del-btn. */
.delete-btn:hover { background: #3a1a1a; border-color: #5a1a1a; color: var(--text-0); }
</style>
