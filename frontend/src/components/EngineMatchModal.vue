<!--
  src/components/EngineMatchModal.vue
  Modal for configuring an engine-vs-engine match (or single-engine
  self-play) starting from the active board's current position.

  Shape adapts to the connected proxy's capability advertisement:

    SELECTOR mode (`capabilities.selector` advertised, multiple
    `availableModels`): two model dropdowns (one per color) plus
    per-color visit counts.

    Otherwise: dropdowns hidden; a single "engine: <internalName>"
    line names what's playing both colors. The pure
    `playEngineMatch` accepts undefined `model` per side and the
    proxy's legacy auto-engage path handles it.

  Both modes share: a `numMoves` input. Submit emits `start-match`
  with the configured options; App.vue wires it into
  `usePlayMatch.start`.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { store } from '../store';

const { t } = useI18n();

const isOpen = ref(false);
const blackModel = ref<string | undefined>(undefined);
const whiteModel = ref<string | undefined>(undefined);
const blackVisits = ref(500);
const whiteVisits = ref(500);
const numMoves = ref(20);

// SELECTOR mode is the single criterion for surfacing the
// engine-selection UI. Two-engine matches against a single LEAF
// would be meaningless (both colors play the same network, no
// dropdown choice changes anything); the collapsed single-engine
// view is the honest UX when SELECTOR isn't advertised.
const isSelectorMode = computed(() => {
  const caps = store.engine.info.capabilities;
  return caps !== null && 'selector' in caps;
});

const availableModels = computed(() => store.engine.info.availableModels);

// LEAF-mode label for the collapsed view. Falls back to a dash when
// the singleton hasn't probed yet (rare — the user typically opens
// this after at least one connect).
const singleEngineLabel = computed(
  () => store.engine.info.internalName ?? availableModels.value[0]?.label ?? '—',
);

const emit = defineEmits<{
  (e: 'start-match', opts: {
    numMoves: number;
    black: { model?: string; maxVisits: number };
    white: { model?: string; maxVisits: number };
  }): void;
}>();

defineExpose({
  open() {
    // Prefill model dropdowns from the user's current SELECTOR
    // selection; the user can override per-color before starting.
    // Visits and numMoves keep their last-used values so a user
    // running back-to-back matches doesn't have to re-set them.
    const current = store.engine.selectedModel ?? availableModels.value[0]?.label;
    blackModel.value = current ?? undefined;
    whiteModel.value = current ?? undefined;
    isOpen.value = true;
  },
});

function close() {
  isOpen.value = false;
}

function submit() {
  emit('start-match', {
    numMoves: numMoves.value,
    black: {
      model: isSelectorMode.value ? blackModel.value : undefined,
      maxVisits: blackVisits.value,
    },
    white: {
      model: isSelectorMode.value ? whiteModel.value : undefined,
      maxVisits: whiteVisits.value,
    },
  });
  close();
}

const canSubmit = computed(() => {
  if (numMoves.value < 1) return false;
  if (blackVisits.value < 1 || whiteVisits.value < 1) return false;
  if (isSelectorMode.value) {
    if (!blackModel.value || !whiteModel.value) return false;
  }
  return true;
});
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @mousedown.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ t('match.title') }}</h2>
        <button class="close-btn" @click="close">×</button>
      </div>

      <div class="modal-body">
        <p class="hint">{{ t('match.subtitle') }}</p>

        <!-- Single-engine notice when SELECTOR isn't in play. -->
        <div v-if="!isSelectorMode" class="single-engine-note">
          {{ t('match.singleEngineNote', { label: singleEngineLabel }) }}
        </div>

        <!-- Per-color settings grid -->
        <div class="form-grid">
          <template v-if="isSelectorMode">
            <label>{{ t('match.field.blackEngine') }}</label>
            <select v-model="blackModel" class="dark-select">
              <option
                v-for="m in availableModels"
                :key="m.label"
                :value="m.label"
              >{{ m.label }}</option>
            </select>
          </template>

          <label>{{ t('match.field.blackVisits') }}</label>
          <input type="number" v-model.number="blackVisits" min="1" step="100" class="dark-input" />

          <template v-if="isSelectorMode">
            <label>{{ t('match.field.whiteEngine') }}</label>
            <select v-model="whiteModel" class="dark-select">
              <option
                v-for="m in availableModels"
                :key="m.label"
                :value="m.label"
              >{{ m.label }}</option>
            </select>
          </template>

          <label>{{ t('match.field.whiteVisits') }}</label>
          <input type="number" v-model.number="whiteVisits" min="1" step="100" class="dark-input" />

          <label>{{ t('match.field.numMoves') }}</label>
          <input type="number" v-model.number="numMoves" min="1" max="500" class="dark-input" />
        </div>

        <p class="hint">{{ t('match.hint.stopAnytime') }}</p>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="close">{{ t('match.button.cancel') }}</button>
        <button class="btn-submit" :disabled="!canSubmit" @click="submit">
          {{ t('match.button.start') }}
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
/* magic-literal: 420px modal width — same design decision as
   ConfirmLoadModal.vue and MintCardModal.vue. */
.modal-content {
  background: var(--surface-0); border: 1px solid var(--border-2); border-radius: var(--radius-default);
  width: 420px; max-width: 90vw; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
  display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: var(--space-medium); border-bottom: 1px solid var(--surface-3); background: var(--surface-2);
}
.modal-header h2 { margin: 0; font-size: var(--text-heading); color: var(--text-0); text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.close-btn { background: none; border: none; color: var(--text-2); font-size: var(--text-heading); cursor: pointer; }
.modal-body { padding: var(--space-medium); }

.single-engine-note {
  background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent);
  border-radius: var(--radius-default);
  padding: var(--space-default) var(--space-medium);
  font-size: var(--text-emphasis);
  color: var(--text-1);
  margin-bottom: var(--space-medium);
  font-family: monospace;
}

.form-grid {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: var(--space-medium);
  align-items: center;
}
.form-grid label {
  font-size: var(--text-emphasis);
  color: var(--text-2);
  text-transform: uppercase;
}
.dark-input {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: var(--space-default); border-radius: var(--radius-default);
  font-family: monospace; font-size: var(--text-emphasis); width: 100%; outline: none;
}
.dark-select {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: var(--space-default); border-radius: var(--radius-default);
  font-family: monospace; font-size: var(--text-emphasis); width: 100%; outline: none;
}
.dark-input:focus, .dark-select:focus { border-color: var(--accent-primary); }

.hint { font-size: var(--text-body); color: var(--text-2); margin: var(--space-tight) 0 0 0; }
.modal-body .hint:first-child { margin-bottom: var(--space-medium); margin-top: 0; }

.modal-footer {
  display: flex; justify-content: flex-end; gap: var(--space-medium);
  padding: var(--space-medium); border-top: 1px solid var(--surface-3); background: var(--surface-2);
}
.btn-cancel { background: transparent; border: 1px solid var(--border-3); color: var(--text-1); padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-submit { background: var(--accent-primary); border: none; color: var(--surface-1); font-weight: bold; padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-submit:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }
</style>
