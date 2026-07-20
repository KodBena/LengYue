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
    - `suspended`       — toggle, fires on change

  The remaining mutable fields (`numMoves`/`resetPrior`,
  `gradingParameterData.gamma`/`default_visits`, and the
  read-only `analysisConfig` marker) are Go/engine-specific and
  live in `GoCardMetadataFields.vue`, supplied via this panel's
  `domain-fields` named slot — see
  docs/notes/design/di-refactor-entanglement-investigation-2026-07-20.md
  §2.4. This panel itself is domain-agnostic; a generic fork
  drops the slot content and gets a clean generic metadata panel
  for free.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { ReviewCard, CardMetadataPatch } from '../types';
import { store } from '../store';
import { INTERACTION_DISMISS_DELAY_MS } from '../lib/timing';

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

// Defensive accessor: persisted ReviewCard blobs from before the
// arc-1 tags-on-read shipped don't carry a `tags` array (the
// SyncService snapshotted them pre-ACL). Coerce to `[]` on read
// so the panel renders rather than crashing on `[...undefined]`.
// The schema-version migration handles the durable fix at
// hydrate time; this guard is the per-render belt to the
// migration's suspenders.
function cardTags(c: { tags?: readonly string[] }): readonly string[] {
  return c.tags ?? [];
}

// Local edit state mirrors `props.card`. Synced via watch when
// the card changes (next-card transition, post-save echo).
const localTags             = ref<string[]>([...cardTags(props.card)]);
const tagInput              = ref('');
const showTagSuggestions    = ref(false);

watch(() => props.card, (c) => {
  localTags.value          = [...cardTags(c)];
  tagInput.value           = '';
});

// Tag-autocomplete suggestions: known tags partial-matched by
// the current input, minus those already attached. Cap at 8 to
// match `MintCardModal`'s convention.
const tagSuggestions = computed(() => {
  const q = tagInput.value.trim().toLowerCase();
  if (!q) return [];
  return store.knownTags
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
  if (tagsEqual(localTags.value, cardTags(props.card))) return;
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
// before mousedown lands. Uses the shared interaction-dismiss
// grace from the timing catalog (`lib/timing`).
function hideTagSuggestionsSoon(): void {
  setTimeout(() => { showTagSuggestions.value = false; }, INTERACTION_DISMISS_DELAY_MS);
}

function toggleSuspended(): void {
  emit('patch', { suspended: !props.card.suspended });
}
</script>

<template>
  <div class="card-metadata-panel" :class="{ disabled }">
    <div class="panel-header" @click="expanded = !expanded">
      <span class="header-label">{{ $t('cardMetadata.titleWithId', { cardId: card.id }) }}</span>
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

      <!-- Go/engine-specific fields (numMoves+resetPrior, gamma,
           default_visits, analysisConfig marker, standalone reset)
           — supplied via this named slot; see
           GoCardMetadataFields.vue and
           docs/notes/design/di-refactor-entanglement-investigation-2026-07-20.md
           §2.4. Note: these fields moved to sit after `suspended`
           (previously `suspended` was interleaved between the
           numMoves/gamma/defaultVisits group and the analysisConfig/
           actions group) so the whole domain-specific block is
           contiguous behind one slot; no other visual change. -->
      <slot name="domain-fields" :card="card" :disabled="disabled" />
    </div>
  </div>
</template>

<style scoped>
.card-metadata-panel {
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  background: var(--surface-0);
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
  background: var(--surface-0);
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
</style>
