<script setup lang="ts">
/**
 * src/components/library/LibraryImportPanel.vue
 *
 * Drag-drop zone + file-picker + directory-picker buttons +
 * progress / summary state. Wires the `useLibraryImport`
 * composable's three entry points to a UI surface.
 *
 * Thin renderer — all phase / progress / outcome state lives in
 * the composable; this component reads it via the prop bundle
 * and renders accordingly.
 *
 * License: Public Domain (The Unlicense)
 */
import type { LibraryImport } from '../../composables/library/useLibraryImport';

interface Props {
  imp: LibraryImport;
}
const props = defineProps<Props>();

function onDrop(ev: DragEvent): void {
  ev.preventDefault();
  if (ev.dataTransfer?.items) {
    void props.imp.dropItems(ev.dataTransfer.items);
  }
}
function onDragOver(ev: DragEvent): void {
  ev.preventDefault();
}
</script>

<template>
  <div
    class="library-import-panel"
    :class="{ 'is-active': imp.phase.value !== 'idle' }"
    @drop="onDrop"
    @dragover="onDragOver"
  >
    <div v-if="imp.phase.value === 'idle'" class="import-idle">
      <p class="import-hint">
        Drag an SGF file or a folder of SGFs here, or:
      </p>
      <div class="import-buttons">
        <button class="import-btn" @click="imp.pickFiles">
          Pick files…
        </button>
        <button class="import-btn" @click="imp.pickDirectory">
          Pick directory…
        </button>
      </div>
    </div>

    <div v-else-if="imp.phase.value === 'reading'" class="import-progress">
      <p>Reading {{ imp.progress.filesRead }} / {{ imp.progress.filesTotal }} files…</p>
    </div>

    <div v-else-if="imp.phase.value === 'uploading'" class="import-progress">
      <p>Uploading chunk {{ imp.progress.chunksUploaded }} / {{ imp.progress.chunksTotal }}</p>
      <p class="import-counts">
        <span class="ok">{{ imp.progress.counts.created }} new</span>
        ·
        <span>{{ imp.progress.counts.deduplicated }} dedup'd</span>
        <template v-if="imp.progress.counts.errored > 0">
          · <span class="err">{{ imp.progress.counts.errored }} errored</span>
        </template>
      </p>
    </div>

    <div v-else-if="imp.phase.value === 'done'" class="import-done">
      <p>Imported {{ imp.progress.counts.created }} new game(s).
        <span class="muted">
          ({{ imp.progress.counts.deduplicated }} already in library<template v-if="imp.progress.counts.errored > 0">, {{ imp.progress.counts.errored }} errored</template>.)
        </span>
      </p>
      <button class="import-btn" @click="imp.reset">Done</button>
    </div>

    <div v-else-if="imp.phase.value === 'errored'" class="import-error">
      <p class="err">Import failed: {{ imp.errorMessage.value }}</p>
      <button class="import-btn" @click="imp.reset">Dismiss</button>
    </div>
  </div>
</template>

<style scoped>
.library-import-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-default);
  padding: var(--space-medium);
  border: 2px dashed var(--border-1);
  border-radius: var(--radius-default);
  background: var(--surface-0);
}
.library-import-panel.is-active {
  border-style: solid;
  border-color: var(--accent-primary);
}
.library-import-panel:hover:not(.is-active) {
  border-color: var(--accent-primary);
}
.import-hint {
  margin: 0;
  font-size: var(--text-body);
  color: var(--text-0);
}
.import-buttons {
  display: flex;
  gap: var(--space-default);
}
.import-btn {
  padding: var(--space-tight) var(--space-default);
  font-size: var(--text-body);
  background: var(--surface-0);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-default);
  color: var(--text-0);
  cursor: pointer;
}
.import-btn:hover {
  border-color: var(--accent-primary);
}
.import-progress, .import-done, .import-error {
  display: flex;
  flex-direction: column;
  gap: var(--space-tight);
}
.import-counts { font-size: var(--text-tiny); color: var(--text-0); }
/* wC-contrast (F9): --accent-positive is undefined so this resolved to
   accent-primary — 2.08:1 in the default cluster theme. Readable text
   is --text-0, not an accent fallback. */
.ok { color: var(--text-0); }
/* wC-contrast (F9): --accent-negative is undefined so this resolved to
   the literal #c75450 fallback — ~3.45:1 against --surface-0 in the
   default cluster theme (fails the 4.5:1 normal-text floor). Readable
   text is --text-0, not an accent-family fallback. */
.err { color: var(--text-0); }
.muted { color: var(--text-0); }
</style>
