<!--
  src/components/CardMetadataPanel.vue

  Shared inline-edit surface for a single card's mutable
  metadata. Consumes a `ReviewCard` prop and emits typed
  `CardMetadataPatch` payloads on field-level save; the parent
  hosts the ACL round-trip and store mirroring. Field edits
  fire on blur (number / text inputs) or on change (booleans);
  the panel composes patches with only the changed keys so the
  backend's "absent → preserve" merge semantics apply
  per-field.

  Card-metadata inline-edit arc 2 (2026-05-13). Mutable subset
  mirrors the backend's `CardPatch`:

    - `tags`            — full replacement (chip-based input
                          with autocomplete from
                          `store.profile.knownTags`)
    - `numMoves`        — direct overwrite; surfaces an inline
                          `resetPrior` opt-in checkbox when
                          dirty (the dispatch's worded prompt)
    - `suspended`       — toggle, fires on change
    - `gradingParameterData.gamma`         — number, validates
                                              (0, 1) locally
    - `gradingParameterData.default_visits` — number, positive

  `analysisConfig` editing is **not supported** in this panel
  by design (deferred pending UX design); the field surfaces
  as a read-only marker with a tooltip stating the deferral.
  Users who need to edit it today reach the registry editor.

  A standalone "reset review history" button is reachable
  independent of the `numMoves` flow — for the "the prior was
  corrupted by mistaken reviews" case the dispatch's reply
  identified.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ReviewCard, CardMetadataPatch } from '../types';
import { store } from '../store';

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

// Collapsible — expanded by default so the panel is immediately
// useful when a card is active; the chevron lets the user
// collapse if the chrome competes for vertical space.
const expanded = ref(true);

// Local edit state mirrors `props.card`. Synced via watch when
// the card changes (next-card transition, post-save echo).
const localTags             = ref<string[]>([...props.card.tags]);
const tagInput              = ref('');
const showTagSuggestions    = ref(false);
const localNumMoves         = ref(props.card.numMoves);
const localGamma            = ref(props.card.gamma);
const localDefaultVisits    = ref(props.card.defaultVisits);
// Inline opt-in surfacing when `numMoves` is dirty. Stays
// false on every card-change so the destructive default is
// off.
const resetPriorOnSave      = ref(false);

watch(() => props.card, (c) => {
  localTags.value          = [...c.tags];
  tagInput.value           = '';
  localNumMoves.value      = c.numMoves;
  localGamma.value         = c.gamma;
  localDefaultVisits.value = c.defaultVisits;
  resetPriorOnSave.value   = false;
});

const numMovesDirty = computed(
  () => localNumMoves.value !== props.card.numMoves,
);

// Tag-autocomplete suggestions: known tags partial-matched by
// the current input, minus those already attached. Cap at 8 to
// match `MintCardModal`'s convention.
const tagSuggestions = computed(() => {
  const q = tagInput.value.trim().toLowerCase();
  if (!q) return [];
  return store.profile.knownTags
    .filter(s => s.toLowerCase().includes(q) && !localTags.value.includes(s))
    .slice(0, 8);
});

function tagsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function commitTags(): void {
  if (tagsEqual(localTags.value, props.card.tags)) return;
  emit('patch', { tags: [...localTags.value] });
}

function addTag(tag: string): void {
  const clean = tag.trim().toLowerCase();
  if (!clean || localTags.value.includes(clean)) return;
  localTags.value.push(clean);
  tagInput.value = '';
  showTagSuggestions.value = false;
  commitTags();
}

function removeTag(idx: number): void {
  localTags.value.splice(idx, 1);
  commitTags();
}

function handleTagKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addTag(tagInput.value);
  } else if (e.key === 'Backspace' && tagInput.value === '' && localTags.value.length) {
    localTags.value.pop();
    commitTags();
  } else if (e.key === 'Escape') {
    showTagSuggestions.value = false;
  } else {
    showTagSuggestions.value = true;
  }
}

// Why the delayed hide: a click on a suggestion <li> needs the
// element to still be in the DOM when its mousedown handler
// fires; the @blur on the input would otherwise hide the list
// before mousedown lands. Same 150 ms window as
// `MintCardModal`'s autocomplete.
function hideTagSuggestionsSoon(): void {
  setTimeout(() => { showTagSuggestions.value = false; }, 150);
}

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

function toggleSuspended(): void {
  emit('patch', { suspended: !props.card.suspended });
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
  <div class="card-metadata-panel" :class="{ disabled }">
    <div class="panel-header" @click="expanded = !expanded">
      <span class="header-label">{{ $t('cardMetadata.title') }}</span>
      <span class="chevron">{{ expanded ? '▼' : '▶' }}</span>
    </div>

    <div v-show="expanded" class="panel-body">
      <!-- Tags ─────────────────────────────────────────── -->
      <div class="field">
        <label>{{ $t('cardMetadata.tagsLabel') }}</label>
        <div class="tags-input-wrapper">
          <span
            v-for="(tag, i) in localTags"
            :key="`${tag}-${i}`"
            class="tag-chip"
          >
            {{ tag }}
            <button
              class="chip-remove"
              :disabled="disabled"
              :title="$t('cardMetadata.tagRemoveTooltip', { tag })"
              @click="removeTag(i)"
            >×</button>
          </span>
          <input
            v-model="tagInput"
            type="text"
            class="tags-input"
            :placeholder="$t('cardMetadata.tagsPlaceholder')"
            :disabled="disabled"
            @keydown="handleTagKeydown"
            @focus="showTagSuggestions = true"
            @blur="hideTagSuggestionsSoon"
          />
          <ul
            v-if="showTagSuggestions && tagSuggestions.length"
            class="tag-suggestions"
          >
            <li
              v-for="s in tagSuggestions"
              :key="s"
              @mousedown.prevent="addTag(s)"
            >{{ s }}</li>
          </ul>
        </div>
      </div>

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

      <!-- Suspended ─────────────────────────────────────── -->
      <div class="field toggle-field">
        <label>
          <input
            type="checkbox"
            :checked="card.suspended"
            :disabled="disabled"
            @change="toggleSuspended"
          />
          {{ $t('cardMetadata.suspendedLabel') }}
        </label>
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
    </div>
  </div>
</template>

<style scoped>
.card-metadata-panel {
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  background: var(--surface-1);
  font-size: var(--text-body);
  color: var(--text-1);
  margin-top: var(--space-medium);
}
.card-metadata-panel.disabled { opacity: 0.6; pointer-events: none; }

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-tight) var(--space-default);
  background: var(--surface-2);
  cursor: pointer;
  user-select: none;
  border-radius: var(--radius-default) var(--radius-default) 0 0;
}
.header-label {
  color: var(--text-0);
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: var(--tracking-default);
  font-size: var(--text-emphasis);
}
.chevron { color: var(--text-2); font-size: var(--text-tiny); }

.panel-body {
  padding: var(--space-default);
  display: flex;
  flex-direction: column;
  gap: var(--space-tight);
}

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

.toggle-field label {
  display: flex;
  align-items: center;
  gap: var(--space-tight);
  color: var(--text-1);
  text-transform: none;
  letter-spacing: normal;
  font-size: var(--text-body);
  cursor: pointer;
}

/* Tags chip-list + autocomplete (modelled after MintCardModal,
   inlined here so the panel is self-contained). */
.tags-input-wrapper {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-tight);
  flex: 1;
  border: 1px solid var(--border-3);
  border-radius: var(--radius-default);
  padding: var(--space-tight);
  background: var(--surface-0);
  align-items: center;
}
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: var(--accent-primary);
  color: var(--surface-0);
  padding: 0 var(--space-tight);
  border-radius: var(--radius-default);
  font-size: var(--text-tiny);
}
.chip-remove {
  background: transparent;
  border: none;
  color: var(--surface-0);
  cursor: pointer;
  font-size: var(--text-body);
  line-height: 1;
  padding: 0 2px;
}
.chip-remove:hover { color: var(--state-attention); }

.tags-input {
  flex: 1;
  min-width: 80px;
  background: transparent;
  border: none;
  color: var(--text-0);
  font-family: inherit;
  font-size: var(--text-body);
  outline: none;
}

.tag-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 10;
  background: var(--surface-1);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  list-style: none;
  margin: 2px 0 0 0;
  padding: 0;
  max-height: 160px;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
.tag-suggestions li {
  padding: var(--space-tight) var(--space-default);
  cursor: pointer;
  color: var(--text-1);
}
.tag-suggestions li:hover { background: var(--surface-2); color: var(--text-0); }

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
