<!--
  src/components/modals/LearnPathModal.vue
  "Learn this path" — auto-seed a card tree beneath the currently loaded
  anchor card by following the engine's top-K ranked candidate moves to
  a given depth. See src/composables/cards/useLearnPath.ts for the full
  design (ranking metric, precondition, dedup).
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { pushSystemMessage } from '../../store';
import { useLearnPath, LearnPathError, type LearnPathResult } from '../../composables/cards/useLearnPath';
import type { BoardId } from '../../types';

const { t } = useI18n();
const { runLearnPath } = useLearnPath();

const isOpen = ref(false);
const isRunning = ref(false);
const boardId = ref<BoardId | null>(null);

const depth = ref(4);
const topK = ref(3);
const tag = ref('');

const result = ref<LearnPathResult | null>(null);
const errorMessage = ref<string | null>(null);

defineExpose({
  open(id: BoardId) {
    boardId.value = id;
    result.value = null;
    errorMessage.value = null;
    tag.value = '';
    isOpen.value = true;
  },
});

function close() {
  isOpen.value = false;
  boardId.value = null;
  result.value = null;
  errorMessage.value = null;
}

async function submit() {
  if (!boardId.value) return;
  const cleanTag = tag.value.trim();
  if (!cleanTag || depth.value < 1 || topK.value < 1) return;

  isRunning.value = true;
  errorMessage.value = null;
  result.value = null;
  try {
    const r = await runLearnPath({
      boardId: boardId.value,
      depth: depth.value,
      topK: topK.value,
      tag: cleanTag,
    });
    result.value = r;
    pushSystemMessage('info', t('learnPath.systemMessage.summary', {
      seeded: r.seeded.length,
      skipped: r.skipped.length,
      frontiers: r.frontiers.length,
      tag: r.tag,
    }));
  } catch (err) {
    const message = err instanceof LearnPathError ? err.message : String(err);
    errorMessage.value = message;
    pushSystemMessage('error', t('learnPath.systemMessage.failed', { err: message }));
  } finally {
    isRunning.value = false;
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @mousedown.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ $t('learnPath.title') }}</h2>
        <button class="close-btn" @click="close">×</button>
      </div>

      <div class="modal-body">
        <p class="hint">{{ $t('learnPath.intro') }}</p>

        <div class="form-grid">
          <label>{{ $t('learnPath.field.depth') }}</label>
          <input type="number" v-model.number="depth" min="1" max="12" class="dark-input" :disabled="isRunning" />

          <label>{{ $t('learnPath.field.topK') }}</label>
          <input type="number" v-model.number="topK" min="1" max="6" class="dark-input" :disabled="isRunning" />

          <label>{{ $t('learnPath.field.tag') }}</label>
          <input
            type="text"
            v-model="tag"
            class="dark-input"
            :placeholder="$t('learnPath.field.tagPlaceholder')"
            :disabled="isRunning"
          />
        </div>

        <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>

        <div v-if="result" class="result-box">
          <p class="result-line">{{ $t('learnPath.result.seeded', { n: result.seeded.length }) }}</p>
          <p class="result-line">{{ $t('learnPath.result.skipped', { n: result.skipped.length }) }}</p>
          <p v-if="result.frontiers.length > 0" class="result-line result-line-attention">
            {{ $t('learnPath.result.frontiers', { n: result.frontiers.length }) }}
          </p>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="close" :disabled="isRunning">{{ $t('learnPath.button.close') }}</button>
        <button class="btn-submit" @click="submit" :disabled="isRunning || !tag.trim()">
          {{ isRunning ? $t('learnPath.button.running') : $t('learnPath.button.run') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.1);
  display: flex; align-items: center; justify-content: center; z-index: var(--z-modal);
}

/* magic-literal: 420px modal width — matches MintCardModal.vue's
   established modal-width decision (3-site cluster, no shared
   substrate pursued there either). */
.modal-content {
  background: var(--surface-0); border: 1px solid var(--border-2); border-radius: var(--radius-default);
  width: 420px; max-width: 90vw; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
  display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: var(--space-medium) var(--space-medium); border-bottom: 1px solid var(--surface-3); background: var(--surface-2);
}
.modal-header h2 { margin: 0; font-size: var(--text-heading); color: var(--text-0); text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.close-btn { background: none; border: none; color: var(--text-2); font-size: var(--text-heading); cursor: pointer; }

.modal-body { padding: var(--space-medium); }
.hint { font-size: var(--text-body); color: var(--text-2); margin: 0 0 var(--space-medium) 0; }

.form-grid { display: grid; grid-template-columns: 110px 1fr; gap: var(--space-medium); align-items: center; }
.form-grid label { font-size: var(--text-emphasis); color: var(--text-2); text-transform: uppercase; }
.dark-input {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0); padding: var(--space-default);
  border-radius: var(--radius-default); font-family: monospace; font-size: var(--text-emphasis); width: 100%; outline: none;
}
.dark-input:focus { border-color: var(--accent-primary); }
.dark-input:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }

.error-box {
  margin-top: var(--space-medium); padding: var(--space-default);
  background: color-mix(in srgb, var(--state-attention) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--state-attention) 30%, transparent);
  border-radius: var(--radius-default); color: var(--text-0); font-size: var(--text-body);
}

.result-box {
  margin-top: var(--space-medium); padding: var(--space-default);
  background: color-mix(in srgb, var(--state-success) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--state-success) 30%, transparent);
  border-radius: var(--radius-default);
}
.result-line { margin: 0 0 var(--space-tight) 0; font-size: var(--text-emphasis); color: var(--text-1); }
.result-line:last-child { margin-bottom: 0; }
.result-line-attention { color: var(--state-attention); }

.modal-footer {
  display: flex; justify-content: flex-end; gap: var(--space-medium); padding: var(--space-medium) var(--space-medium);
  border-top: 1px solid var(--surface-3); background: var(--surface-2);
}
.btn-cancel { background: transparent; border: 1px solid var(--border-3); color: var(--text-1); padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-submit { background: var(--accent-primary); border: none; color: var(--surface-1); font-weight: bold; padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-submit:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }
</style>
