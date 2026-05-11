<script setup lang="ts">
/**
 * src/components/modals/HyperparamPromptModal.vue
 * Bind-time prompt for a deck's hyperparameter harness. The caller
 * invokes `open(decls)` and awaits a `Record<name, value>` or `null`
 * on cancel. Per-field validation gates the submit button — values
 * must satisfy the declaration's type, range (numbers), and options
 * (enum / constrained string).
 *
 * License: Public Domain (The Unlicense).
 */
import { ref, computed } from 'vue';
import type { HyperparamDecl } from '../../types';

export type HyperparamValues = Record<string, number | string>;

const isOpen = ref(false);
const declarations = ref<HyperparamDecl[]>([]);
// Per-name raw input strings; numbers are parsed at submit time so
// the user can type freely. Pre-populated from `default` on open.
const inputs = ref<Record<string, string>>({});
let resolvePromise: ((result: HyperparamValues | null) => void) | null = null;

defineExpose({
  open(decls: HyperparamDecl[]): Promise<HyperparamValues | null> {
    declarations.value = decls;
    const seeded: Record<string, string> = {};
    for (const d of decls) seeded[d.name] = String(d.default);
    inputs.value = seeded;
    isOpen.value = true;
    return new Promise(resolve => { resolvePromise = resolve; });
  }
});

function fieldError(decl: HyperparamDecl, raw: string): string | null {
  if (decl.type === 'number') {
    if (raw.trim() === '') return 'required';
    const n = Number(raw);
    if (!Number.isFinite(n)) return 'not a number';
    if (decl.range) {
      const [lo, hi] = decl.range;
      if (Number.isFinite(lo) && n < lo) return `below ${lo}`;
      if (Number.isFinite(hi) && n > hi) return `above ${hi}`;
    }
    return null;
  }
  if (decl.type === 'enum') {
    if (!decl.options.includes(raw)) return 'not in options';
    return null;
  }
  // 'string': options is an optional constraint; empty string allowed.
  if (decl.options && decl.options.length > 0 && !decl.options.includes(raw)) {
    return 'not in options';
  }
  return null;
}

const allValid = computed(() =>
  declarations.value.every(d => fieldError(d, inputs.value[d.name] ?? '') === null),
);

function labelFor(d: HyperparamDecl): string {
  return d.label ?? d.name;
}

function submit() {
  if (!allValid.value) return;
  const out: HyperparamValues = {};
  for (const d of declarations.value) {
    const raw = inputs.value[d.name] ?? '';
    out[d.name] = d.type === 'number' ? Number(raw) : raw;
  }
  isOpen.value = false;
  resolvePromise?.(out);
  resolvePromise = null;
}

function cancel() {
  isOpen.value = false;
  resolvePromise?.(null);
  resolvePromise = null;
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @mousedown.self="cancel">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ $t('harnessPrompt.title') }}</h2>
      </div>
      <div class="modal-body">
        <p class="lede">{{ $t('harnessPrompt.lede') }}</p>
        <div v-for="d in declarations" :key="d.name" class="field-row">
          <label :for="`hpv-${d.name}`">
            <span class="field-label">{{ labelFor(d) }}</span>
            <span class="field-name">{{ d.name }}</span>
          </label>
          <select
            v-if="d.type === 'enum'"
            :id="`hpv-${d.name}`"
            class="dark-input"
            v-model="inputs[d.name]"
          >
            <option v-for="opt in d.options" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <input
            v-else
            :id="`hpv-${d.name}`"
            type="text"
            class="dark-input"
            :class="{ 'invalid': fieldError(d, inputs[d.name] ?? '') !== null }"
            v-model="inputs[d.name]"
          />
          <span v-if="fieldError(d, inputs[d.name] ?? '')" class="field-error">
            {{ fieldError(d, inputs[d.name] ?? '') }}
          </span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" @click="cancel">{{ $t('harnessPrompt.button.cancel') }}</button>
        <button class="btn-submit" :disabled="!allValid" @click="submit">
          {{ $t('harnessPrompt.button.run') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: var(--z-modal);
}
/* 420px modal width — design decision shared with the other modals; see
   ConfirmLoadModal.vue for the rationale. */
.modal-content {
  background: var(--surface-1); border: 1px solid var(--border-2); border-radius: var(--radius-default);
  width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
  display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
.modal-header { padding: var(--space-medium) var(--space-medium); border-bottom: 1px solid var(--surface-3); background: var(--surface-2); }
.modal-header h2 { margin: 0; font-size: var(--text-heading); color: var(--text-0); text-transform: uppercase; }
.modal-body { padding: var(--space-medium); color: var(--text-1); font-size: var(--text-emphasis); display: flex; flex-direction: column; gap: var(--space-default); }
.lede { margin: 0 0 var(--space-default); color: var(--text-2); font-size: var(--text-body); }
.field-row { display: flex; flex-direction: column; gap: var(--space-tight); }
.field-row label { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-default); }
.field-label { color: var(--text-1); font-size: var(--text-emphasis); }
.field-name { color: var(--text-2); font-family: monospace; font-size: var(--text-tiny); }
.dark-input {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: var(--space-default); border-radius: var(--radius-default);
  font-family: monospace; font-size: var(--text-emphasis); width: 100%; outline: none;
}
.dark-input:focus { border-color: var(--accent-primary); }
.dark-input.invalid { border-color: var(--state-error); }
.field-error { color: var(--state-error); font-size: var(--text-tiny); }
.modal-footer {
  display: flex; justify-content: flex-end; gap: var(--space-medium); padding: var(--space-medium) var(--space-medium);
  border-top: 1px solid var(--surface-3); background: var(--surface-2);
}
.btn-cancel { background: transparent; border: 1px solid var(--border-3); color: var(--text-1); padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-submit { background: var(--accent-primary); border: none; color: var(--surface-1); font-weight: bold; padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
