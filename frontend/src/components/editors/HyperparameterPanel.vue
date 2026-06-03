<!--
  src/components/editors/HyperparameterPanel.vue
  Declaration editor for a deck's hyperparameter harness.
  Renders one row per HyperparamDecl; emits the full array on each
  edit so the parent (CardSetEditor) stays the source of truth.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { HyperparamDecl } from '../../types';

const { t } = useI18n();

const props = defineProps<{
  modelValue: HyperparamDecl[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: HyperparamDecl[]): void;
}>();

// Cross-row name-uniqueness check. The DSL harness validator also
// reports duplicates at the pipeline level, but flagging at the
// declaration row gives the user a per-cell signal.
const duplicateNames = computed<Set<string>>(() => {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const d of props.modelValue) {
    if (seen.has(d.name)) dup.add(d.name);
    seen.add(d.name);
  }
  return dup;
});

function emitAll(next: HyperparamDecl[]): void {
  emit('update:modelValue', next);
}

function addDeclaration(): void {
  const baseName = 'param';
  const existing = new Set(props.modelValue.map(d => d.name));
  let i = 1;
  let candidate = baseName;
  while (existing.has(candidate)) { i++; candidate = `${baseName}${i}`; }
  emitAll([...props.modelValue, { name: candidate, type: 'number', default: 0 }]);
}

function deleteDeclaration(idx: number): void {
  const next = props.modelValue.slice();
  next.splice(idx, 1);
  emitAll(next);
}

function updateName(idx: number, value: string): void {
  const cleaned = value.replace(/[^A-Za-z0-9_$]/g, '');
  const next = props.modelValue.slice();
  next[idx] = { ...next[idx], name: cleaned };
  emitAll(next);
}

function updateType(idx: number, value: 'number' | 'string' | 'enum'): void {
  const current = props.modelValue[idx];
  // Type change forces a default that fits the new type; carry over
  // label; drop range/options that no longer apply.
  const next = props.modelValue.slice();
  if (value === 'number') {
    next[idx] = { name: current.name, type: 'number', default: 0, label: current.label };
  } else if (value === 'string') {
    next[idx] = { name: current.name, type: 'string', default: '', label: current.label };
  } else {
    next[idx] = { name: current.name, type: 'enum', default: '', options: [], label: current.label };
  }
  emitAll(next);
}

function updateDefault(idx: number, raw: string): void {
  const decl = props.modelValue[idx];
  const next = props.modelValue.slice();
  if (decl.type === 'number') {
    const n = Number(raw);
    next[idx] = { ...decl, default: Number.isFinite(n) ? n : 0 };
  } else {
    next[idx] = { ...decl, default: raw };
  }
  emitAll(next);
}

function updateLabel(idx: number, value: string): void {
  const next = props.modelValue.slice();
  next[idx] = { ...next[idx], label: value || undefined };
  emitAll(next);
}

function updateOptions(idx: number, raw: string): void {
  const decl = props.modelValue[idx];
  if (decl.type !== 'enum' && decl.type !== 'string') return;
  const parts = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
  const next = props.modelValue.slice();
  if (decl.type === 'enum') {
    next[idx] = { ...decl, options: parts };
  } else {
    next[idx] = { ...decl, options: parts.length > 0 ? parts : undefined };
  }
  emitAll(next);
}

function updateRange(idx: number, which: 'lo' | 'hi', raw: string): void {
  const decl = props.modelValue[idx];
  if (decl.type !== 'number') return;
  const n = Number(raw);
  const safe = Number.isFinite(n) ? n : 0;
  const existing = decl.range ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
  const lo = which === 'lo' ? safe : existing[0];
  const hi = which === 'hi' ? safe : existing[1];
  const next = props.modelValue.slice();
  // Drop range when both bounds are unconstrained; otherwise keep.
  if (Number.isFinite(lo) || Number.isFinite(hi)) {
    next[idx] = { ...decl, range: [lo, hi] };
  } else {
    const { range: _drop, ...rest } = decl;
    next[idx] = rest;
  }
  emitAll(next);
}

function rangeLo(decl: HyperparamDecl): string {
  if (decl.type !== 'number' || !decl.range) return '';
  return Number.isFinite(decl.range[0]) ? String(decl.range[0]) : '';
}
function rangeHi(decl: HyperparamDecl): string {
  if (decl.type !== 'number' || !decl.range) return '';
  return Number.isFinite(decl.range[1]) ? String(decl.range[1]) : '';
}
function optionsStr(decl: HyperparamDecl): string {
  if (decl.type === 'enum') return decl.options.join(', ');
  if (decl.type === 'string') return decl.options?.join(', ') ?? '';
  return '';
}
</script>

<template>
  <div class="harness-panel">
    <div class="harness-header">
      <span>{{ t('cardSet.harness.header') }}</span>
      <button class="add-btn" @click="addDeclaration">+</button>
    </div>
    <div v-if="modelValue.length === 0" class="empty">
      {{ t('cardSet.harness.empty') }}
    </div>
    <table v-else class="harness-table">
      <thead>
        <tr>
          <th>{{ t('cardSet.harness.col.name') }}</th>
          <th>{{ t('cardSet.harness.col.type') }}</th>
          <th>{{ t('cardSet.harness.col.default') }}</th>
          <th>{{ t('cardSet.harness.col.constraints') }}</th>
          <th>{{ t('cardSet.harness.col.label') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(decl, idx) in modelValue" :key="idx">
          <td>
            <input
              type="text"
              class="dark-input"
              :class="{ 'dup': duplicateNames.has(decl.name) }"
              :value="decl.name"
              @input="(e: any) => updateName(idx, e.target.value)"
            />
          </td>
          <td>
            <select
              class="dark-input"
              :value="decl.type"
              @change="(e: any) => updateType(idx, e.target.value)"
            >
              <option value="number">{{ t('cardSet.harness.type.number') }}</option>
              <option value="string">{{ t('cardSet.harness.type.string') }}</option>
              <option value="enum">{{ t('cardSet.harness.type.enum') }}</option>
            </select>
          </td>
          <td>
            <input
              type="text"
              class="dark-input"
              :value="String(decl.default)"
              @input="(e: any) => updateDefault(idx, e.target.value)"
            />
          </td>
          <td>
            <template v-if="decl.type === 'number'">
              <input
                type="text"
                class="dark-input narrow"
                :placeholder="t('cardSet.harness.placeholder.min')"
                :value="rangeLo(decl)"
                @input="(e: any) => updateRange(idx, 'lo', e.target.value)"
              />
              <input
                type="text"
                class="dark-input narrow"
                :placeholder="t('cardSet.harness.placeholder.max')"
                :value="rangeHi(decl)"
                @input="(e: any) => updateRange(idx, 'hi', e.target.value)"
              />
            </template>
            <input
              v-else
              type="text"
              class="dark-input"
              :placeholder="t('cardSet.harness.placeholder.options')"
              :value="optionsStr(decl)"
              @input="(e: any) => updateOptions(idx, e.target.value)"
            />
          </td>
          <td>
            <input
              type="text"
              class="dark-input"
              :placeholder="t('cardSet.harness.placeholder.label')"
              :value="decl.label ?? ''"
              @input="(e: any) => updateLabel(idx, e.target.value)"
            />
          </td>
          <td>
            <button class="row-del-btn" :title="t('cardSet.harness.deleteRow')" @click="deleteDeclaration(idx)">×</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.harness-panel {
  border-top: 1px solid var(--surface-3);
  padding: var(--space-default) var(--space-medium);
  background: var(--surface-0);
  display: flex;
  flex-direction: column;
  gap: var(--space-tight);
}
.harness-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--text-body);
  text-transform: uppercase;
  color: var(--text-1);
}
.add-btn {
  background: none; border: none; color: var(--accent-primary); cursor: pointer;
  font-weight: bold; font-size: var(--text-heading);
}
.empty {
  color: var(--border-3);
  font-size: var(--text-body);
  font-style: italic;
}
.harness-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-emphasis);
}
.harness-table th {
  text-align: left;
  color: var(--text-2);
  font-weight: normal;
  font-size: var(--text-tiny);
  padding: var(--space-tight) var(--space-default);
}
.harness-table td {
  padding: 2px var(--space-default) 2px 0;
  vertical-align: top;
}
.harness-table td:first-child { padding-left: 0; }
.dark-input {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: var(--space-tight) var(--space-default); border-radius: var(--radius-default);
  font-family: monospace; font-size: var(--text-emphasis); width: 100%; outline: none;
}
.dark-input:focus { border-color: var(--accent-primary); }
.dark-input.dup { border-color: var(--state-error); }
.dark-input.narrow { width: 48%; display: inline-block; margin-right: 2%; }
.row-del-btn {
  background: none; border: none; color: var(--state-error);
  cursor: pointer; font-size: var(--text-heading); padding: 0 var(--space-tight);
}
</style>
