<!-- 
  src/components/PaletteEditor.vue 
  Master-Detail editor for Analysis Environments.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import type { AnalysisEnvironment, AnalysisPalette } from '../types';

import { Codemirror } from 'vue-codemirror';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';

const props = defineProps<{
  env: AnalysisEnvironment;
}>();

const emit = defineEmits<{
  (e: 'update', payload: { path: string[], value: AnalysisEnvironment }): void;
}>();

// Editor Extensions
const extensions = [python(), oneDark];

// View State
type ViewType = 'symbol' | 'parameter' | 'palette' | null;
const selectedType = ref<ViewType>(null);
const selectedId = ref<string>('');

const symbolKeys = computed(() => Object.keys(props.env.symbols));
const paramKeys = computed(() => Object.keys(props.env.parameters));

// Deep clone helper to safely mutate and emit
function getClone(): AnalysisEnvironment {
  return JSON.parse(JSON.stringify(props.env));
}

function commit(newEnv: AnalysisEnvironment) {
  emit('update', { path: ['engine', 'katago', 'analysis_env'], value: newEnv });
}

// ── Selection ──────────────────────────────────────────

function select(type: ViewType, id: string) {
  selectedType.value = type;
  selectedId.value = id;
}

// ── Mutations ──────────────────────────────────────────

function addSymbol() {
  const name = prompt("Symbol name (e.g., 'new_metric'):");
  if (!name || props.env.symbols[name]) return;
  const next = getClone();
  next.symbols[name] = '0.0';
  commit(next);
  select('symbol', name);
}

function updateSymbolValue(val: string) {
  if (selectedType.value !== 'symbol') return;
  const next = getClone();
  next.symbols[selectedId.value] = val;
  commit(next);
}

function addParameter() {
  const name = prompt("Parameter name (e.g., 'beta'):");
  if (!name || props.env.parameters[name] !== undefined) return;
  const next = getClone();
  next.parameters[name] = 1.0;
  commit(next);
  select('parameter', name);
}

function updateParameterValue(val: number) {
  if (selectedType.value !== 'parameter') return;
  const next = getClone();
  next.parameters[selectedId.value] = val;
  commit(next);
}

function addPalette() {
  const name = prompt("Palette Name:");
  if (!name) return;
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const next = getClone();
  next.palettes.push({
    id,
    name,
    delta_fn: symbolKeys.value[0] || '',
    summary_fn: symbolKeys.value[0] || '',
    state_fns: {}
  });
  commit(next);
  select('palette', id);
}

function addStateFnToPalette(paletteId: string) {
  const name = prompt("Chart Name (e.g., 'Complexity'):");
  if (!name) return;
  const next = getClone();
  const p = next.palettes.find(p => p.id === paletteId);
  if (p) {
    p.state_fns[name] = symbolKeys.value[0] || '';
    commit(next);
  }
}

function removeStateFnFromPalette(paletteId: string, chartName: string) {
  const next = getClone();
  const p = next.palettes.find(p => p.id === paletteId);
  if (p && p.state_fns[chartName]) {
    delete p.state_fns[chartName];
    commit(next);
  }
}

function updatePaletteField(paletteId: string, field: keyof AnalysisPalette, val: any) {
  const next = getClone();
  const p = next.palettes.find(p => p.id === paletteId);
  if (p) {
    (p as any)[field] = val;
    commit(next);
  }
}

function updatePaletteStateFn(paletteId: string, chartName: string, symRef: string) {
  const next = getClone();
  const p = next.palettes.find(p => p.id === paletteId);
  if (p) {
    p.state_fns[chartName] = symRef;
    commit(next);
  }
}

function deleteItem() {
  if (!selectedType.value || !selectedId.value) return;
  if (!confirm(`Delete ${selectedType.value} '${selectedId.value}'?`)) return;
  
  const next = getClone();
  if (selectedType.value === 'symbol') delete next.symbols[selectedId.value];
  if (selectedType.value === 'parameter') delete next.parameters[selectedId.value];
  if (selectedType.value === 'palette') {
    next.palettes = next.palettes.filter(p => p.id !== selectedId.value);
    if (next.activePaletteId === selectedId.value && next.palettes.length > 0) {
      next.activePaletteId = next.palettes[0].id;
    }
  }
  
  commit(next);
  selectedType.value = null;
  selectedId.value = '';
}
</script>

<template>
  <div class="palette-editor">
    
    <!-- LEFT PANE: Directory -->
    <div class="sidebar">
      <div class="section">
        <div class="section-header">
          <span>Symbols (λ)</span>
          <button class="add-btn" @click="addSymbol">+</button>
        </div>
        <ul class="item-list">
          <li 
            v-for="key in symbolKeys" :key="key"
            :class="{ active: selectedType === 'symbol' && selectedId === key }"
            @click="select('symbol', key)"
          >{{ key }}</li>
        </ul>
      </div>

      <div class="section">
        <div class="section-header">
          <span>Parameters</span>
          <button class="add-btn" @click="addParameter">+</button>
        </div>
        <ul class="item-list">
          <li 
            v-for="key in paramKeys" :key="key"
            :class="{ active: selectedType === 'parameter' && selectedId === key }"
            @click="select('parameter', key)"
          >{{ key }}</li>
        </ul>
      </div>

      <div class="section">
        <div class="section-header">
          <span>Palettes</span>
          <button class="add-btn" @click="addPalette">+</button>
        </div>
        <ul class="item-list">
          <li 
            v-for="p in env.palettes" :key="p.id"
            :class="{ active: selectedType === 'palette' && selectedId === p.id }"
            @click="select('palette', p.id)"
          >{{ p.name }} <span v-if="env.activePaletteId === p.id" class="active-badge">ACTIVE</span></li>
        </ul>
      </div>
    </div>

    <!-- RIGHT PANE: Details -->
    <div class="detail-pane">
      <div v-if="!selectedType" class="empty-state">
        Select an item to edit
      </div>

      <div v-else class="detail-content">
        <div class="detail-header">
          <h3>{{ selectedId }}</h3>
          <button class="del-btn" @click="deleteItem">Delete</button>
        </div>

        <!-- Symbol Editor (CodeMirror) -->
        <div v-if="selectedType === 'symbol'" class="editor-wrap">
          <Codemirror
            :model-value="env.symbols[selectedId]"
            :extensions="extensions"
            :style="{ height: '100%', fontSize: '12px' }"
            @update:model-value="updateSymbolValue"
          />
        </div>

        <!-- Parameter Editor -->
        <div v-if="selectedType === 'parameter'" class="form-grid">
          <label>Value:</label>
          <input 
            type="number" 
            step="0.01" 
            class="dark-input" 
            :value="env.parameters[selectedId]" 
            @input="(e: any) => updateParameterValue(Number(e.target.value))"
          />
        </div>

        <!-- Palette Editor -->
        <div v-if="selectedType === 'palette'" class="palette-form">
          <div class="form-grid">
            <label>Name:</label>
            <input 
              type="text" 
              class="dark-input" 
              :value="env.palettes.find(p => p.id === selectedId)?.name"
              @input="(e: any) => updatePaletteField(selectedId, 'name', e.target.value)"
            />
            
            <label>Delta Function:</label>
            <select class="dark-select" :value="env.palettes.find(p => p.id === selectedId)?.delta_fn" @change="(e: any) => updatePaletteField(selectedId, 'delta_fn', e.target.value)">
              <option v-for="sym in symbolKeys" :key="sym" :value="sym">{{ sym }}</option>
            </select>

            <label>Summary Function:</label>
            <select class="dark-select" :value="env.palettes.find(p => p.id === selectedId)?.summary_fn" @change="(e: any) => updatePaletteField(selectedId, 'summary_fn', e.target.value)">
              <option v-for="sym in symbolKeys" :key="sym" :value="sym">{{ sym }}</option>
            </select>
          </div>

          <div class="state-fns-section">
            <div class="section-header" style="margin-top: 15px;">
              <span>Charts (State Functions)</span>
              <button class="add-btn" @click="addStateFnToPalette(selectedId)">+ Chart</button>
            </div>
            
            <div class="state-fn-row" v-for="(symRef, chartName) in env.palettes.find(p => p.id === selectedId)?.state_fns" :key="chartName">
              <span class="chart-name">{{ chartName }}</span>
              <span class="arrow">→</span>
              <select class="dark-select flex-1" :value="symRef" @change="(e: any) => updatePaletteStateFn(selectedId, chartName as string, e.target.value)">
                <option v-for="sym in symbolKeys" :key="sym" :value="sym">{{ sym }}</option>
              </select>
              <button class="del-btn-sm" @click="removeStateFnFromPalette(selectedId, chartName as string)">×</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.palette-editor {
  display: flex;
  height: 400px;
  background: #0a0a0a;
  border: 1px solid #222;
  border-radius: 4px;
  overflow: hidden;
  font-family: 'Consolas', monospace;
}

.sidebar {
  width: 200px;
  background: #111;
  border-right: 1px solid #222;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.section { border-bottom: 1px solid #1a1a1a; }
.section-header { 
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 10px; background: #1a1a1a; color: #aaa; font-size: 10px; text-transform: uppercase;
}
.add-btn { background: none; border: none; color: #4aaef0; cursor: pointer; font-weight: bold; font-size: 14px; }
.add-btn:hover { color: #fff; }

.item-list { list-style: none; padding: 0; margin: 0; }
.item-list li {
  padding: 6px 12px; font-size: 11px; color: #ccc; cursor: pointer; border-left: 2px solid transparent;
}
.item-list li:hover { background: #1a1a1a; }
.item-list li.active { background: #000; border-left-color: #4aaef0; color: #4aaef0; }

.active-badge { font-size: 8px; background: #4aaef0; color: #000; padding: 1px 4px; border-radius: 2px; margin-left: 6px; }

.detail-pane { flex: 1; display: flex; flex-direction: column; background: #000; }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: #555; font-size: 12px; }

.detail-content { display: flex; flex-direction: column; height: 100%; }
.detail-header { 
  display: flex; justify-content: space-between; align-items: center; 
  padding: 10px 15px; border-bottom: 1px solid #1a1a1a;
}
.detail-header h3 { margin: 0; font-size: 14px; color: #fff; font-weight: normal; }
.del-btn { background: #3a1a1a; color: #ff6b6b; border: 1px solid #5a1a1a; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 10px; }
.del-btn:hover { background: #5a1a1a; color: #fff; }

.editor-wrap { flex: 1; overflow: auto; }

.palette-form, .form-grid { padding: 15px; }
.form-grid { display: grid; grid-template-columns: 120px 1fr; gap: 10px; align-items: center; }
.form-grid label { font-size: 11px; color: #888; }

.dark-input, .dark-select {
  background: #111; border: 1px solid #333; color: #eee; padding: 6px; border-radius: 3px; font-family: monospace; font-size: 12px; width: 100%; outline: none;
}
.dark-input:focus, .dark-select:focus { border-color: #4aaef0; }

.state-fn-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; padding: 8px; background: #111; border-radius: 4px; border: 1px solid #222; }
.chart-name { font-size: 12px; color: #fff; font-weight: bold; width: 120px; }
.arrow { color: #555; }
.flex-1 { flex: 1; }
.del-btn-sm { background: none; border: none; color: #ff6b6b; cursor: pointer; font-size: 14px; }
.del-btn-sm:hover { color: #fff; }
</style>
