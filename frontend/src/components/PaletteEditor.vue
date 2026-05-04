<!-- 
  src/components/PaletteEditor.vue 
  Master-Detail editor for Analysis Environments.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useQeubo } from '../composables/useQeubo';
import { pushSystemMessage } from '../store';
import type { AnalysisEnvironment, AnalysisPalette, ParameterMeta } from '../types';

import { Codemirror } from 'vue-codemirror';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';

const props = defineProps<{
  env: AnalysisEnvironment;
}>();

const emit = defineEmits<{
  (e: 'update', payload: { path: string[], value: AnalysisEnvironment }): void;
}>();

const qeubo = useQeubo();

// Editor Extensions. `EditorView.lineWrapping` makes long single-line
// formulas wrap visually instead of pushing the editor outward and
// squeezing the sidebar's symbol list off-screen.
const extensions = [python(), oneDark, EditorView.lineWrapping];

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

// ── Parameter meta editing (qEUBO calibration) ─────────────────────
//
// Per dispatch v1.2 §3.7, the PaletteEditor is the curated home for
// parameter_meta editing. The toggle (qeubo_controlled) is the
// trigger that recreates the backend experiment over the new
// controlled set; range edits are local and do NOT recreate (the
// backend snapshots ranges at experiment-create time, so changing a
// range mid-experiment would silently misalign the GP). Users who
// edit a range while qeubo_controlled is checked can apply the new
// range by retoggling.

function getParamMeta(name: string): ParameterMeta {
  return props.env.parameter_meta?.[name] ?? {};
}

function isRangeValid(meta: ParameterMeta): boolean {
  const r = meta.range;
  return Array.isArray(r)
    && r.length === 2
    && Number.isFinite(r[0])
    && Number.isFinite(r[1])
    && r[0] < r[1];
}

const selectedParamMeta = computed<ParameterMeta>(() =>
  selectedType.value === 'parameter' ? getParamMeta(selectedId.value) : {}
);

const selectedRangeValid = computed<boolean>(() =>
  isRangeValid(selectedParamMeta.value)
);

function updateParamRange(name: string, side: 'min' | 'max', raw: string): void {
  const next = getClone();
  if (!next.parameter_meta) next.parameter_meta = {};
  const meta: ParameterMeta = { ...(next.parameter_meta[name] ?? {}) };
  const currentRange = meta.range ?? [NaN, NaN];
  const parsed = raw.trim() === '' ? NaN : Number(raw);
  const newRange: [number, number] = side === 'min'
    ? [parsed, currentRange[1]]
    : [currentRange[0], parsed];
  // Keep the range as-set even if invalid; validation happens at
  // qeubo_controlled gate. A partial range is preserved across input
  // events so the user doesn't lose half their typing.
  if (Number.isNaN(newRange[0]) && Number.isNaN(newRange[1])) {
    delete meta.range;
  } else {
    meta.range = newRange;
  }
  next.parameter_meta[name] = meta;
  commit(next);
}

async function setParamQeuboControlled(name: string, checked: boolean): Promise<void> {
  const next = getClone();
  if (!next.parameter_meta) next.parameter_meta = {};
  const meta: ParameterMeta = { ...(next.parameter_meta[name] ?? {}) };

  if (checked) {
    // Defensive: the checkbox is supposed to be disabled when range
    // is invalid. If it somehow fires anyway (programmatic change,
    // older UA), surface the error per ADR-0002 and bail.
    if (!isRangeValid(meta)) {
      pushSystemMessage(
        'error',
        `qEUBO: parameter "${name}" needs a valid [min, max] range before it can be marked qeubo_controlled.`,
      );
      return;
    }
    meta.qeubo_controlled = true;
  } else {
    delete meta.qeubo_controlled;
  }
  next.parameter_meta[name] = meta;
  commit(next);

  // Read the controlled set from the just-committed `next`, not from
  // props.env (Vue may not have re-rendered the prop yet). The
  // composable reads from store, but its read happens inside the
  // network request which fires after the commit's reactive update
  // has propagated.
  const controlled = Object.entries(next.parameter_meta)
    .filter(([_, m]) => m?.qeubo_controlled === true)
    .map(([k]) => k);

  try {
    if (controlled.length === 0) {
      await qeubo.abortExperiment();
      pushSystemMessage('info', 'qEUBO experiment dissolved (no controlled parameters).');
    } else {
      await qeubo.startNewExperiment(controlled);
      pushSystemMessage(
        'info',
        `qEUBO experiment recreated over [${controlled.join(', ')}].`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushSystemMessage('error', `qEUBO sync failed: ${msg}`);
  }
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

          <label>Range:</label>
          <div class="range-inputs">
            <input
              type="number"
              step="0.01"
              class="dark-input range-half"
              :class="{ invalid: !selectedRangeValid && !!selectedParamMeta.qeubo_controlled }"
              placeholder="min"
              :value="selectedParamMeta.range?.[0] ?? ''"
              @input="(e: any) => updateParamRange(selectedId, 'min', e.target.value)"
            />
            <span class="range-sep">–</span>
            <input
              type="number"
              step="0.01"
              class="dark-input range-half"
              :class="{ invalid: !selectedRangeValid && !!selectedParamMeta.qeubo_controlled }"
              placeholder="max"
              :value="selectedParamMeta.range?.[1] ?? ''"
              @input="(e: any) => updateParamRange(selectedId, 'max', e.target.value)"
            />
          </div>

          <label>qEUBO:</label>
          <div class="qeubo-control">
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="!!selectedParamMeta.qeubo_controlled"
                :disabled="!selectedRangeValid && !selectedParamMeta.qeubo_controlled"
                :title="selectedRangeValid
                  ? 'Mark this parameter as qEUBO-controlled. Toggling recreates the calibration experiment over the new controlled set.'
                  : 'Set a valid [min, max] range first (min < max).'"
                @change="(e: any) => setParamQeuboControlled(selectedId, e.target.checked)"
              />
              <span>controlled by qEUBO calibration</span>
            </label>
            <div v-if="!selectedRangeValid && !!selectedParamMeta.qeubo_controlled" class="validation-error">
              Range invalid — qEUBO experiment continues with the snapshot taken at create. Fix the range and re-toggle to apply.
            </div>
            <div v-else-if="!selectedRangeValid" class="validation-hint">
              Set a valid [min, max] range to enable qEUBO control.
            </div>
          </div>
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
            <div class="section-header" style="margin-top: var(--space-medium);">
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
  background: var(--surface-0);
  border: 1px solid var(--surface-3);
  border-radius: var(--radius-default);
  overflow: hidden;
  font-family: 'Consolas', monospace;
}

.sidebar {
  width: 200px;
  background: var(--surface-1);
  border-right: 1px solid var(--surface-3);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  /* Keep the 200px even when the detail pane's content (e.g. an
     unwrapped CodeMirror line) tries to grow the editor outward —
     without this, the flex algorithm shrinks the sidebar to fit. */
  flex-shrink: 0;
}

.section { border-bottom: 1px solid var(--surface-2); }
.section-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: var(--space-default) var(--space-medium); background: var(--surface-2); color: var(--text-1); font-size: var(--text-body); text-transform: uppercase;
}
.add-btn { background: none; border: none; color: var(--accent-primary); cursor: pointer; font-weight: bold; font-size: var(--text-heading); }

.item-list { list-style: none; padding: 0; margin: 0; }
.item-list li {
  padding: var(--space-default) var(--space-medium); font-size: var(--text-emphasis); color: var(--text-1); cursor: pointer; border-left: 2px solid transparent;
}
.item-list li:hover { background: var(--surface-2); }
.item-list li.active { background: var(--surface-0); border-left-color: var(--accent-primary); color: var(--accent-primary); }

.active-badge { font-size: var(--text-tiny); background: var(--accent-primary); color: var(--surface-0); padding: 1px 4px; border-radius: var(--radius-default); margin-left: var(--space-default); }

/* `min-width: 0` lets the flex item shrink below the intrinsic
   width of CodeMirror's content; without it, an unwrapped long line
   widens the pane past its allocated flex share. */
.detail-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--surface-0); }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--border-3); font-size: var(--text-emphasis); }

.detail-content { display: flex; flex-direction: column; height: 100%; }
.detail-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: var(--space-medium) var(--space-medium); border-bottom: 1px solid var(--surface-2);
}
.detail-header h3 { margin: 0; font-size: var(--text-heading); color: var(--text-0); font-weight: normal; }
/* theme-exception: .del-btn's border (#5a1a1a) and hover background
   (#5a1a1a) are designer-intentional muted-dark-red tints for the
   destructive-action affordance. The base background is substrate-
   anchored (var(--surface-0)) so the button sits on the active
   theme's deepest surface; the red tints survive only on the border
   and hover state. Substrate's --state-error anchor is the
   saturated wire-color (#f04a4a); a muted-tint anchor (e.g.
   --state-error-muted) would retire these last two literals.
   Preserved until the substrate gains tinted-surface vocabulary. */
.del-btn { background: var(--surface-0); color: var(--state-error); border: 1px solid #5a1a1a; padding: var(--space-tight) var(--space-default); border-radius: var(--radius-default); cursor: pointer; font-size: var(--text-body); }

.editor-wrap { flex: 1; overflow: auto; }

.palette-form, .form-grid { padding: var(--space-medium); }
.form-grid { display: grid; grid-template-columns: 120px 1fr; gap: var(--space-medium); align-items: center; }
.form-grid label { font-size: var(--text-emphasis); color: var(--text-2); }

.dark-input {
  background: var(--surface-1); border: 1px solid var(--border-2); color: var(--text-0); padding: var(--space-default); border-radius: var(--radius-default); font-family: monospace; font-size: var(--text-emphasis); width: 100%; outline: none;
}
.dark-select {
  border: 1px solid var(--border-2); color: var(--text-0); padding: var(--space-default); border-radius: var(--radius-default); font-family: monospace; font-size: var(--text-emphasis); width: 100%; outline: none;
}
.dark-input:focus, .dark-select:focus { border-color: var(--accent-primary); }

.state-fn-row { display: flex; align-items: center; gap: var(--space-medium); margin-top: var(--space-default); padding: var(--space-default); background: var(--surface-1); border-radius: var(--radius-default); border: 1px solid var(--surface-3); }
.chart-name { font-size: var(--text-emphasis); color: var(--text-0); font-weight: bold; width: 120px; }
.arrow { color: var(--border-3); }
.flex-1 { flex: 1; }
.del-btn-sm { background: none; border: none; color: var(--state-error); cursor: pointer; font-size: var(--text-heading); }

.range-inputs { display: flex; align-items: center; gap: var(--space-default); }
.range-half { flex: 1; min-width: 0; }
.range-sep { color: var(--border-3); }
.dark-input.invalid { border-color: var(--state-error); }
.qeubo-control { display: flex; flex-direction: column; gap: var(--space-tight); }
.checkbox-label { display: flex; align-items: center; gap: var(--space-default); font-size: var(--text-emphasis); color: var(--text-1); cursor: pointer; }
.checkbox-label input[type=checkbox] { cursor: pointer; }
.checkbox-label input[type=checkbox]:disabled { cursor: not-allowed; }
.checkbox-label input[type=checkbox]:disabled + span { color: var(--border-3); }
.validation-error { font-size: var(--text-body); color: var(--state-error); }
.validation-hint { font-size: var(--text-body); color: var(--text-2); font-style: italic; }
</style>
