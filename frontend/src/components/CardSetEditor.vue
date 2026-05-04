<!-- 
  src/components/CardSetEditor.vue 
  Master-Detail editor for Card Sets (Decks).
  Allows power users to construct Tree DSL pipelines.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import type { CardSet, PipelineStage } from '../types';
import { Codemirror } from 'vue-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';

const props = defineProps<{
  cardSets: Record<string, CardSet>;
  activeCardSetId: string;
}>();

const emit = defineEmits<{
  (e: 'update', payload: { path: string[], value: Record<string, CardSet> }): void;
  (e: 'update-active', id: string): void;
}>();

const selectedId = ref<string | null>(props.activeCardSetId || Object.keys(props.cardSets)[0] || null);
const pipelineStr = ref<string>('');
const isJsonValid = ref(true);

// Pure JSON; oneDark handles basic styling. `EditorView.lineWrapping`
// keeps unusually long pipeline JSON lines from pushing the editor
// outward and squeezing the deck-list sidebar off-screen.
const extensions = [oneDark, EditorView.lineWrapping];

// Synchronize local JSON string when selection changes
watch(selectedId, (newId) => {
  if (newId && props.cardSets[newId]) {
    pipelineStr.value = JSON.stringify(props.cardSets[newId].pipeline, null, 2);
    isJsonValid.value = true;
  }
}, { immediate: true });

function getClone(): Record<string, CardSet> {
  return JSON.parse(JSON.stringify(props.cardSets));
}

function commit(next: Record<string, CardSet>) {
  emit('update', { path: ['cardSets'], value: next });
}

function select(id: string) {
  selectedId.value = id;
}

function addCardSet() {
  const name = prompt("Deck Name (e.g., 'Opening Mistakes'):");
  if (!name) return;
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (props.cardSets[id]) return alert("ID already exists.");
  
  const next = getClone();
  next[id] = {
    id,
    name,
    description: '',
    pipeline: [
      {
        stage: "select",
        selection: { type: "DescendantSelection" },
        ordering: { type: "bfs_order" }
      },
      { stage: "take", n: 20 },
      { stage: "shuffle" }
    ]
  };
  commit(next);
  select(id);
}

function deleteCardSet() {
  if (!selectedId.value) return;
  if (!confirm(`Delete Deck '${selectedId.value}'?`)) return;
  
  const next = getClone();
  delete next[selectedId.value];
  
  const remainingKeys = Object.keys(next);
  const newSelection = remainingKeys.length > 0 ? remainingKeys[0] : null;
  
  commit(next);
  if (newSelection) {
    select(newSelection);
    // If the deleted deck was the globally active one, reset it.
    if (props.activeCardSetId === selectedId.value) {
      emit('update-active', newSelection);
    }
  } else {
    selectedId.value = null;
    pipelineStr.value = '';
  }
}

function updateField(field: keyof CardSet, val: any) {
  if (!selectedId.value) return;
  const next = getClone();
  (next[selectedId.value] as any)[field] = val;
  commit(next);
}

function updatePipeline(newJsonStr: string) {
  pipelineStr.value = newJsonStr;
  try {
    // ADR-0002 boundary cast: this editor is a free-form JSON
    // authoring surface for power users (the Tree DSL pipeline is
    // intentionally hand-editable). `JSON.parse` returns `any` and we
    // assert `PipelineStage[]` here without runtime structural
    // validation — the backend's pipeline executor is the loud-failure
    // surface for malformed pipelines (rejects with 4xx, surfaces via
    // the request error path), so duplicating the discriminated-union
    // shape check on the frontend would split responsibility without
    // adding signal. The `isJsonValid` indicator below covers
    // parse-time syntactic validity; structural validity is the
    // executor's job. Upgrade path if this ever needs tightening: a
    // structural validator at this boundary that walks the union and
    // sets `isJsonValid = false` on shape mismatch.
    const parsed = JSON.parse(newJsonStr) as PipelineStage[];
    isJsonValid.value = true;
    if (selectedId.value) {
      const next = getClone();
      next[selectedId.value].pipeline = parsed;
      commit(next);
    }
  } catch (e) {
    isJsonValid.value = false;
  }
}
</script>

<template>
  <div class="deck-editor">
    
    <!-- LEFT PANE: Directory -->
    <div class="sidebar">
      <div class="section">
        <div class="section-header">
          <span>Card Sets (Decks)</span>
          <button class="add-btn" @click="addCardSet">+</button>
        </div>
        <ul class="item-list">
          <li 
            v-for="(set, key) in cardSets" :key="key"
            :class="{ active: selectedId === key }"
            @click="select(key as string)"
          >
            {{ set.name }}
            <span v-if="activeCardSetId === key" class="active-badge">SELECTED</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- RIGHT PANE: Details -->
    <div class="detail-pane">
      <div v-if="!selectedId || !cardSets[selectedId]" class="empty-state">
        Select a deck to edit
      </div>

      <div v-else class="detail-content">
        <div class="detail-header">
          <h3>{{ selectedId }}</h3>
          <button class="del-btn" @click="deleteCardSet">Delete</button>
        </div>

        <div class="form-grid">
          <label>Name:</label>
          <input 
            type="text" 
            class="dark-input" 
            :value="cardSets[selectedId].name"
            @input="(e: any) => updateField('name', e.target.value)"
          />

          <label>Description:</label>
          <input
            type="text"
            class="dark-input"
            :value="cardSets[selectedId].description"
            @input="(e: any) => updateField('description', e.target.value)"
          />
        </div>

        <div class="section-header" style="margin-top: var(--space-medium); border-top: 1px solid #1a1a1a;">
          <span>Tree DSL Pipeline (JSON)</span>
          <span v-if="!isJsonValid" class="error-badge">INVALID JSON</span>
        </div>
        
        <div class="editor-wrap" :class="{ 'json-error': !isJsonValid }">
          <Codemirror
            :model-value="pipelineStr"
            :extensions="extensions"
            :style="{ height: '100%', fontSize: '12px' }"
            @update:model-value="updatePipeline"
          />
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.deck-editor {
  display: flex; height: 400px; background: var(--surface-0); border: 1px solid var(--surface-3);
  border-radius: var(--radius-default); overflow: hidden; font-family: 'Consolas', monospace;
}

.sidebar { width: 200px; background: var(--surface-1); border-right: 1px solid var(--surface-3); display: flex; flex-direction: column; overflow-y: auto; flex-shrink: 0; }
.section { border-bottom: 1px solid var(--surface-2); }
.section-header { display: flex; justify-content: space-between; align-items: center; padding: var(--space-default) var(--space-medium); background: var(--surface-2); color: var(--text-1); font-size: var(--text-body); text-transform: uppercase; }
.add-btn { background: none; border: none; color: var(--accent-primary); cursor: pointer; font-weight: bold; font-size: var(--text-heading); }

.item-list { list-style: none; padding: 0; margin: 0; }
.item-list li { padding: var(--space-default) var(--space-medium); font-size: var(--text-emphasis); color: var(--text-1); cursor: pointer; border-left: 2px solid transparent; display: flex; justify-content: space-between; align-items: center;}
.item-list li:hover { background: var(--surface-2); }
.item-list li.active { background: var(--surface-0); border-left-color: var(--accent-primary); color: var(--accent-primary); }
.active-badge { font-size: var(--text-tiny); background: var(--accent-primary); color: var(--surface-0); padding: 1px 4px; border-radius: var(--radius-default); }

.detail-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--surface-0); }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--border-3); font-size: var(--text-emphasis); }
.detail-content { display: flex; flex-direction: column; height: 100%; }

.detail-header { display: flex; justify-content: space-between; align-items: center; padding: var(--space-medium) var(--space-medium); border-bottom: 1px solid var(--surface-2); }
.detail-header h3 { margin: 0; font-size: var(--text-heading); color: var(--text-0); font-weight: normal; }
/* theme-exception: .del-btn's border (#5a1a1a) is a muted-dark-red
   tint for the destructive-action affordance — same rationale as
   PaletteEditor's .del-btn. Base bg is substrate-anchored
   (var(--surface-0)); the tint survives only on the border. Future
   substrate work could introduce tinted-surface anchors to retire
   it. */
.del-btn { background: var(--surface-0); color: var(--state-error); border: 1px solid #5a1a1a; padding: var(--space-tight) var(--space-default); border-radius: var(--radius-default); cursor: pointer; font-size: var(--text-body); }

.form-grid { padding: var(--space-medium); display: grid; grid-template-columns: 100px 1fr; gap: var(--space-medium); align-items: center; }
.form-grid label { font-size: var(--text-emphasis); color: var(--text-2); }
.dark-input { background: var(--surface-1); border: 1px solid var(--border-2); color: var(--text-0); padding: var(--space-default); border-radius: var(--radius-default); font-family: monospace; font-size: var(--text-emphasis); width: 100%; outline: none; }
.dark-input:focus { border-color: var(--accent-primary); }

.editor-wrap { flex: 1; overflow: auto; border-top: 1px solid var(--surface-3); transition: border-color var(--duration-default); }
.editor-wrap.json-error { border-top: 2px solid var(--state-error); }
.error-badge { font-size: var(--text-tiny); color: var(--state-error); font-weight: bold; }
</style>
