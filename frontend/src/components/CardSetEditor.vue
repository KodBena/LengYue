<!-- 
  src/components/CardSetEditor.vue 
  Master-Detail editor for Card Sets (Decks).
  Allows power users to construct Tree DSL pipelines.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import type { CardSet } from '../types';
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
    contextIds: [3], // Default root
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

function updateContextIds(val: string) {
  if (!selectedId.value) return;
  const ids = val.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  const next = getClone();
  next[selectedId.value].contextIds = ids;
  commit(next);
}

function updatePipeline(newJsonStr: string) {
  pipelineStr.value = newJsonStr;
  try {
    const parsed = JSON.parse(newJsonStr);
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

          <label>Context IDs:</label>
          <input 
            type="text" 
            class="dark-input" 
            placeholder="e.g. 3, 4, 12"
            :value="cardSets[selectedId].contextIds.join(', ')"
            @input="(e: any) => updateContextIds(e.target.value)"
            title="Comma separated root node IDs for the backend to query."
          />
        </div>

        <div class="section-header" style="margin-top: 10px; border-top: 1px solid #1a1a1a;">
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
  display: flex; height: 400px; background: #0a0a0a; border: 1px solid #222; 
  border-radius: 4px; overflow: hidden; font-family: 'Consolas', monospace;
}

.sidebar { width: 200px; background: #111; border-right: 1px solid #222; display: flex; flex-direction: column; overflow-y: auto; flex-shrink: 0; }
.section { border-bottom: 1px solid #1a1a1a; }
.section-header { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #1a1a1a; color: #aaa; font-size: 10px; text-transform: uppercase; }
.add-btn { background: none; border: none; color: #4aaef0; cursor: pointer; font-weight: bold; font-size: 14px; }
.add-btn:hover { color: #fff; }

.item-list { list-style: none; padding: 0; margin: 0; }
.item-list li { padding: 6px 12px; font-size: 11px; color: #ccc; cursor: pointer; border-left: 2px solid transparent; display: flex; justify-content: space-between; align-items: center;}
.item-list li:hover { background: #1a1a1a; }
.item-list li.active { background: #000; border-left-color: #4aaef0; color: #4aaef0; }
.active-badge { font-size: 8px; background: #4aaef0; color: #000; padding: 1px 4px; border-radius: 2px; }

.detail-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #000; }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: #555; font-size: 12px; }
.detail-content { display: flex; flex-direction: column; height: 100%; }

.detail-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; border-bottom: 1px solid #1a1a1a; }
.detail-header h3 { margin: 0; font-size: 14px; color: #fff; font-weight: normal; }
.del-btn { background: #3a1a1a; color: #ff6b6b; border: 1px solid #5a1a1a; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 10px; }
.del-btn:hover { background: #5a1a1a; color: #fff; }

.form-grid { padding: 15px; display: grid; grid-template-columns: 100px 1fr; gap: 10px; align-items: center; }
.form-grid label { font-size: 11px; color: #888; }
.dark-input { background: #111; border: 1px solid #333; color: #eee; padding: 6px; border-radius: 3px; font-family: monospace; font-size: 12px; width: 100%; outline: none; }
.dark-input:focus { border-color: #4aaef0; }

.editor-wrap { flex: 1; overflow: auto; border-top: 1px solid #222; transition: border-color 0.2s; }
.editor-wrap.json-error { border-top: 2px solid #ff6b6b; }
.error-badge { font-size: 9px; color: #ff6b6b; font-weight: bold; }
</style>
