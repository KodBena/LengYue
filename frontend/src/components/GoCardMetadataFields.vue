<!--
  src/components/GoCardMetadataFields.vue
  Go/KataGo-specific metadata fields extracted out of
  CardMetadataPanel.vue so the panel shell stays generic — see
  docs/notes/design/di-refactor-entanglement-investigation-2026-07-20.md
  §2.4. Supplied to CardMetadataPanel via its `domain-fields` named
  slot; the slot hands this component `card` and `disabled` as
  scoped-slot props (wired at each call site), and this component
  emits `patch` events the same shape CardMetadataPanel used to emit
  itself — call sites listen for `patch` on this component directly
  rather than routing it back through the panel.

  Covers the subset of the card-metadata inline-edit arc 2 fields
  that are engine/domain-specific:

    - `numMoves`        — direct overwrite; surfaces an inline
                          `resetPrior` opt-in checkbox when dirty
                          (the dispatch's worded prompt)
    - `gradingParameterData.gamma`         — number, validates
                                              (0, 1) locally
    - `gradingParameterData.default_visits` — number, positive
    - `analysisConfig` — read-only marker (editing deferred pending
                          UX design; users who need to edit it today
                          reach the registry editor)
    - standalone "reset review history" button, reachable
      independent of the `numMoves` flow — for the "the prior was
      corrupted by mistaken reviews" case.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ReviewCard, CardMetadataPatch } from '../types';

const { t } = useI18n();

const props = defineProps<{
  card: ReviewCard;
  /**
   * Disabled while the parent has a PATCH in flight. Prevents
   * concurrent edits and signals visually that a save is
   * pending.
   */
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'patch', patch: CardMetadataPatch): void;
}>();

// Local edit state mirrors `props.card`. Synced via watch when
// the card changes (next-card transition, post-save echo).
const localNumMoves         = ref(props.card.numMoves);
const localGamma            = ref(props.card.gamma);
const localDefaultVisits    = ref(props.card.defaultVisits);
// Inline opt-in surfacing when `numMoves` is dirty. Stays
// false on every card-change so the destructive default is
// off.
const resetPriorOnSave      = ref(false);

watch(() => props.card, (c) => {
  localNumMoves.value      = c.numMoves;
  localGamma.value         = c.gamma;
  localDefaultVisits.value = c.defaultVisits;
  resetPriorOnSave.value   = false;
});

const numMovesDirty = computed(
  () => localNumMoves.value !== props.card.numMoves,
);

function commitNumMoves(): void {
  if (!numMovesDirty.value) {
    resetPriorOnSave.value = false;
    return;
  }
  if (!Number.isInteger(localNumMoves.value) || localNumMoves.value <= 0) {
    // Local validation: revert. Backend would 422 on a
    // non-positive int anyway; revert here avoids the wire
    // round-trip for an obvious typo.
    localNumMoves.value = props.card.numMoves;
    return;
  }
  const patch: CardMetadataPatch = {
    numMoves: localNumMoves.value,
    ...(resetPriorOnSave.value ? { resetPrior: true } : {}),
  };
  emit('patch', patch);
  resetPriorOnSave.value = false;
}

function commitGamma(): void {
  if (localGamma.value === props.card.gamma) return;
  if (!(localGamma.value > 0 && localGamma.value < 1)) {
    localGamma.value = props.card.gamma;
    return;
  }
  emit('patch', { gradingParameterData: { gamma: localGamma.value } });
}

function commitDefaultVisits(): void {
  if (localDefaultVisits.value === props.card.defaultVisits) return;
  if (!Number.isInteger(localDefaultVisits.value) || localDefaultVisits.value <= 0) {
    localDefaultVisits.value = props.card.defaultVisits;
    return;
  }
  emit('patch', { gradingParameterData: { default_visits: localDefaultVisits.value } });
}

function resetPriorStandalone(): void {
  // window.confirm() is the minimal-touch destructive-confirm
  // affordance; if the panel grows enough to warrant a custom
  // modal, that's a follow-up.
  if (!window.confirm(t('cardMetadata.resetPriorStandaloneConfirm'))) return;
  emit('patch', { resetPrior: true });
}
</script>

<template>
  <!-- Num moves ─────────────────────────────────────── -->
  <div class="field">
    <label>{{ $t('cardMetadata.numMovesLabel') }}</label>
    <input
      v-model.number="localNumMoves"
      type="number"
      min="1"
      step="1"
      class="num-input"
      :disabled="disabled"
      @blur="commitNumMoves"
      @keydown.enter="commitNumMoves"
    />
  </div>
  <div v-if="numMovesDirty" class="reset-prompt">
    <label>
      <input
        v-model="resetPriorOnSave"
        type="checkbox"
        :disabled="disabled"
      />
      <span class="reset-prompt-text">
        {{ $t('cardMetadata.resetPriorInlinePrompt') }}
      </span>
    </label>
    <p class="hint">{{ $t('cardMetadata.resetPriorInlineHint') }}</p>
  </div>

  <!-- Gamma ─────────────────────────────────────────── -->
  <div class="field">
    <label>{{ $t('cardMetadata.gammaLabel') }}</label>
    <input
      v-model.number="localGamma"
      type="number"
      min="0.01"
      max="0.99"
      step="0.01"
      class="num-input"
      :disabled="disabled"
      @blur="commitGamma"
      @keydown.enter="commitGamma"
    />
  </div>

  <!-- Default visits ───────────────────────────────── -->
  <div class="field">
    <label>{{ $t('cardMetadata.defaultVisitsLabel') }}</label>
    <input
      v-model.number="localDefaultVisits"
      type="number"
      min="1"
      step="50"
      class="num-input"
      :disabled="disabled"
      @blur="commitDefaultVisits"
      @keydown.enter="commitDefaultVisits"
    />
  </div>

  <!-- Analysis config (read-only marker) ───────────── -->
  <div
    class="field readonly-field"
    :title="$t('cardMetadata.analysisConfigTooltip')"
  >
    <label>{{ $t('cardMetadata.analysisConfigLabel') }}</label>
    <span class="readonly-value">
      {{ $t('cardMetadata.analysisConfigDeferred') }}
    </span>
  </div>

  <!-- Standalone reset_prior ──────────────────────── -->
  <div class="actions">
    <button
      class="action-btn reset-btn"
      :disabled="disabled"
      :title="$t('cardMetadata.resetPriorStandaloneTooltip')"
      @click="resetPriorStandalone"
    >
      {{ $t('cardMetadata.resetPriorStandalone') }}
    </button>
  </div>
</template>

<style scoped>
/* Shares CardMetadataPanel's `.panel-body` flex-column context
   (this component's root-level `<div>` elements become direct
   flex children via the slot), so field/spacing styles here mirror
   the panel's own class names verbatim (moved, not redesigned). */
.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-default);
}
.field label {
  color: var(--text-2);
  font-size: var(--text-emphasis);
  text-transform: uppercase;
  letter-spacing: var(--tracking-default);
  flex-shrink: 0;
}

.num-input {
  width: 80px;
  background: transparent;
  border: 1px solid var(--border-3);
  color: var(--text-0);
  padding: var(--space-tight);
  border-radius: var(--radius-default);
  text-align: right;
  font-family: inherit;
}
.num-input:focus { border-color: var(--accent-primary); outline: none; }

/* Reset-prior inline opt-in (visible only when num_moves is
   dirty). The hint paragraph is the worded prompt the dispatch
   reply committed to. */
.reset-prompt {
  margin-top: calc(-1 * var(--space-tight));
  margin-left: var(--space-default);
  padding: var(--space-tight);
  background: var(--surface-2);
  border-left: 2px solid var(--state-attention);
  border-radius: 0 var(--radius-default) var(--radius-default) 0;
}
.reset-prompt label {
  display: flex;
  align-items: center;
  gap: var(--space-tight);
  color: var(--text-0);
  text-transform: none;
  letter-spacing: normal;
  font-weight: normal;
  font-size: var(--text-body);
  cursor: pointer;
}
.reset-prompt-text { font-weight: normal; }
.hint { margin: var(--space-tight) 0 0 0; font-size: var(--text-tiny); color: var(--text-2); }

.readonly-field { color: var(--text-2); cursor: help; }
.readonly-value { color: var(--text-2); font-style: italic; }

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-default);
}
.action-btn {
  background: transparent;
  border: 1px solid var(--border-3);
  color: var(--text-2);
  padding: var(--space-tight) var(--space-default);
  border-radius: var(--radius-default);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--text-body);
  transition: color var(--duration-default), border-color var(--duration-default);
}
.action-btn:hover { color: var(--state-attention); border-color: var(--state-attention); }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
