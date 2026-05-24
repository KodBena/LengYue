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
  gap: var(--space-small);
  padding: var(--space-medium);
  border: 2px dashed var(--border-subtle);
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
  color: var(--text-muted);
}
.import-buttons {
  display: flex;
  gap: var(--space-small);
}
.import-btn {
  padding: var(--space-tiny) var(--space-small);
  font-size: var(--text-body);
  background: var(--surface-0);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-default);
  color: var(--text-default);
  cursor: pointer;
}
.import-btn:hover {
  border-color: var(--accent-primary);
}
.import-progress, .import-done, .import-error {
  display: flex;
  flex-direction: column;
  gap: var(--space-tiny);
}
.import-counts { font-size: var(--text-small); color: var(--text-muted); }
.ok { color: var(--accent-positive, var(--accent-primary)); }
.err { color: var(--accent-negative, #c75450); }
.muted { color: var(--text-muted); }
</style>
