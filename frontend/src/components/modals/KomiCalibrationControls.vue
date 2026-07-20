<!--
  src/components/modals/KomiCalibrationControls.vue
  Mint-time komi calibration controls (opt-in, pedagogical, Go-specific).
  Extracted out of MintCardModal.vue so the modal shell stays generic —
  see docs/notes/design/di-refactor-entanglement-investigation-2026-07-20.md
  §2.6. Supplied to MintCardModal via its `komiCalibration` named slot;
  the slot hands this component `boardId` and `registerBeforeSubmit` as
  scoped-slot props (wired at the call site in App.vue), and this
  component registers its own `beforeSubmit` hook — the modal's
  `submit()` runs whatever hook is registered without knowing anything
  about komi or KataGo.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { store, pushSystemMessage } from '../../store';
import { useMinting } from '../../composables/review/useMinting';
import type { BoardId, CardCreatePayload } from '../../types';

const props = defineProps<{
  boardId: BoardId | null;
  registerBeforeSubmit: (fn: ((draft: CardCreatePayload) => Promise<void>) | null) => void;
}>();

const { t } = useI18n();
const { calibrateKomiOnDraft } = useMinting();

// Shown only when an engine is connected — calibration needs a live
// evaluation. Strictly opt-in: the checkbox is unchecked by default.
// The visits input prefills from the user setting but per-mint edits
// do NOT write back to it (a local ref, not bound to the store). Since
// this component is (re)mounted each time the modal opens (it lives
// behind the modal's own `v-if="draft"`), these refs naturally reset to
// their defaults on every open — no explicit reset call needed.
const engineConnected = computed(() => store.engine.status === 'connected');
const calibrateKomi = ref(false);
const calibrationVisits = ref<number>(store.profile.settings.engine.katago.calibrationVisits);

/**
 * Runs a fresh bounded evaluation and rewrites the draft's SGF komi so
 * the minted card stores the even-game komi. If the evaluation fails
 * (engine disconnect, error packet, timeout), `calibrateKomiOnDraft`
 * throws; this pushes the calibration-specific failure message to the
 * system log and rethrows so the modal's own catch still surfaces its
 * generic mint-failed alert (same two-message behavior as before the
 * extraction — the modal doesn't need to know which step failed).
 */
async function beforeSubmit(draft: CardCreatePayload): Promise<void> {
  if (!(calibrateKomi.value && engineConnected.value && props.boardId)) return;
  try {
    const result = await calibrateKomiOnDraft(props.boardId, draft, calibrationVisits.value);
    pushSystemMessage(
      'info',
      result.clamped
        ? t('mint.komiCalibration.setClamped', {
            komi: result.evenKomi,
            raw: result.rawEvenKomi.toFixed(1),
          })
        : t('mint.komiCalibration.set', { komi: result.evenKomi }),
    );
  } catch (err) {
    pushSystemMessage('error', t('mint.komiCalibration.failed', { err: String(err) }));
    throw err;
  }
}

props.registerBeforeSubmit(beforeSubmit);
onUnmounted(() => props.registerBeforeSubmit(null));
</script>

<template>
  <template v-if="engineConnected">
    <label>{{ $t('mint.field.calibrateKomi') }}</label>
    <label class="checkbox-cell">
      <input type="checkbox" v-model="calibrateKomi" class="calibrate-checkbox" />
      <span class="hint">{{ $t('mint.komiCalibration.hint') }}</span>
    </label>

    <label>{{ $t('mint.field.calibrationVisits') }}</label>
    <input
      type="number"
      v-model.number="calibrationVisits"
      min="1"
      step="100"
      class="dark-input"
      :disabled="!calibrateKomi"
    />
  </template>
</template>

<style scoped>
/* Shares MintCardModal's `.form-grid` grid context (this component's
   root-level `<label>`/`<input>` elements become direct grid children
   via the slot), so only the styles specific to this block's own
   markup live here; the grid/input/label base styles stay in the
   modal's stylesheet. */
.checkbox-cell { display: flex; align-items: center; gap: var(--space-default); text-transform: none; }
.calibrate-checkbox { width: auto; accent-color: var(--accent-primary); cursor: pointer; }
.dark-input {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0); padding: var(--space-default);
  border-radius: var(--radius-default); font-family: monospace; font-size: var(--text-emphasis); width: 100%; outline: none;
}
.dark-input:focus { border-color: var(--accent-primary); }
.dark-input:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }
.hint { font-size: var(--text-body); color: var(--text-2); margin: var(--space-tight) 0 0 0; }
</style>
