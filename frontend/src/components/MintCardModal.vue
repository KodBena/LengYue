<!-- 
  src/components/MintCardModal.vue
  Floating modal for flashcard minting and tag management.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { store } from '../store';
import { useMinting } from '../composables/useMinting';
import type { BoardId, CardCreatePayload } from '../types';

const { prepareDraft, commitMint } = useMinting();

const isOpen = ref(false);
const isLoading = ref(false);
const draft = ref<CardCreatePayload | null>(null);

// Tag Input State
const tagInput = ref('');
const showSuggestions = ref(false);

// Palette Override State
const selectedPaletteId = ref<string>('active');

const palettes = computed(() => store.profile.settings.engine.katago.analysis_env.palettes);

// Typed accessors for the two editable fields inside `grading_parameter`.
// The wire shape declares `grading_parameter: { [key: string]: unknown } | null`
// (OpenAPI-honest about the blob's opacity), but `useMinting.prepareDraft`
// populates `data.default_visits: number` and `data.gamma: number` before
// the modal renders, and the modal's contract is to surface those two
// fields as editable. The localized casts widen at the access boundary;
// the rest of the blob stays opaque. Read-side counterparts are the
// `readGradingParam<number>` calls in
// `services/backend-service.ts::mapToReviewCard`.
const defaultVisits = computed<number>({
  get() {
    const gp = draft.value?.grading_parameter as
      | { data?: { default_visits?: number } }
      | null
      | undefined;
    return gp?.data?.default_visits ?? 1000;
  },
  set(v: number) {
    if (!draft.value) return;
    const gp = draft.value.grading_parameter as
      | { data: Record<string, unknown> }
      | null;
    if (gp?.data) gp.data.default_visits = v;
  },
});

const gamma = computed<number>({
  get() {
    const gp = draft.value?.grading_parameter as
      | { data?: { gamma?: number } }
      | null
      | undefined;
    return gp?.data?.gamma ?? 0.9;
  },
  set(v: number) {
    if (!draft.value) return;
    const gp = draft.value.grading_parameter as
      | { data: Record<string, unknown> }
      | null;
    if (gp?.data) gp.data.gamma = v;
  },
});

const filteredTags = computed(() => {
  const query = tagInput.value.toLowerCase().trim();
  if (!query) return [];
  return store.profile.knownTags.filter(t => 
    t.toLowerCase().includes(query) && !draft.value?.tags.includes(t)
  ).slice(0, 8); // Max 8 suggestions
});

defineExpose({
  async open(boardId: BoardId) {
    selectedPaletteId.value = store.profile.settings.minting.defaultPaletteId;
    draft.value = await prepareDraft(boardId);
    if (draft.value) {
      isOpen.value = true;
      tagInput.value = '';
    }
  }
});

function close() {
  isOpen.value = false;
  draft.value = null;
}

// ─── Tag Management ──────────────────────────────────────────────────────────

function addTag(tag: string) {
  const cleanTag = tag.trim().toLowerCase();
  if (!cleanTag || !draft.value) return;
  
  if (!draft.value.tags.includes(cleanTag)) {
    draft.value.tags.push(cleanTag);
  }
  tagInput.value = '';
  showSuggestions.value = false;
}

function handleTagKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addTag(tagInput.value);
  } else if (e.key === 'Backspace' && tagInput.value === '' && draft.value?.tags.length) {
    draft.value.tags.pop();
  } else if (e.key === 'Escape') {
    showSuggestions.value = false;
  } else {
    showSuggestions.value = true;
  }
}

function removeTag(index: number) {
  if (draft.value) draft.value.tags.splice(index, 1);
}

/**
 * Hide the suggestions dropdown after a short delay.
 *
 * Why the delay: `@blur` on the input fires *before* a click on a
 * suggestion list item is processed. If we hid the dropdown
 * synchronously, the click handler (`@mousedown.prevent="addTag(...)"`)
 * would never fire because the element it targets would already be
 * gone from the DOM. The 150 ms window is comfortable on most
 * devices; lower values risk dropping the click on slower hardware.
 *
 * Hoisted out of the template because Vue templates only see script-
 * exposed identifiers, not browser globals like `setTimeout` —
 * referencing it inline produces a TS2339 error under strict mode
 * (the auto-generated component instance type doesn't include
 * browser globals).
 */
// Tracks the in-flight setTimeout handle for hideSuggestionsDelayed
// so we can clear it on unmount (and on overlapping schedules — a
// rapid blur-focus-blur sequence would otherwise queue duplicate
// callbacks). The post-unmount write to showSuggestions.value would
// be a closure-stable no-op, but releasing the timer is the
// discipline-correct shape.
let suggestionsHideTimer: number | null = null;

function hideSuggestionsDelayed() {
  if (suggestionsHideTimer !== null) {
    clearTimeout(suggestionsHideTimer);
  }
  // magic-literal: 150ms suggestions-hide delay — gives the user time to
  // mousedown on a suggestion before the dropdown closes on input blur.
  // Hand-tuned for the responsiveness of typical click sequences.
  suggestionsHideTimer = window.setTimeout(() => {
    showSuggestions.value = false;
    suggestionsHideTimer = null;
  }, 150);
}

onUnmounted(() => {
  if (suggestionsHideTimer !== null) clearTimeout(suggestionsHideTimer);
});

// ─── Submission ──────────────────────────────────────────────────────────────

async function submit() {
  if (!draft.value) return;
  isLoading.value = true;

  // Apply Palette Override if one was specifically chosen.
  // 34b: The override rebuilds `grading_parameter` from the palette, so we
  // must re-attach `default_visits` and `gamma` afterwards — otherwise
  // we'd clobber the values the user may have edited in the modal.
  if (selectedPaletteId.value !== 'active') {
    const env = store.profile.settings.engine.katago.analysis_env;
    const p = env.palettes.find(x => x.id === selectedPaletteId.value);
    if (p) {
      // Local cast at the read site: the wire shape's `grading_parameter`
      // is `{[key: string]: unknown} | null`; the create-flow contract
      // populates `data.default_visits` and `data.gamma` (see
      // `useMinting.prepareDraft`).
      const gp = draft.value.grading_parameter as
        | { data?: { default_visits?: number; gamma?: number } }
        | null;
      const preservedVisits = gp?.data?.default_visits;
      const preservedGamma = gp?.data?.gamma;
      draft.value.grading_parameter = {
        data: {
          analysis_config: {
            bindings: { delta_fn: p.delta_fn, state_fns: p.state_fns, summary_fn: p.summary_fn },
            parameters: env.parameters,
            symbols: env.symbols
          },
          default_visits: preservedVisits,
          gamma: preservedGamma
        }
      };
    }
  }

  try {
    const newId = await commitMint(draft.value);
    console.log(`[Minting] Successfully created card ${newId}`);
    close();
  } catch (err) {
    console.error('[Minting] Failed to create card:', err);
    alert(`Minting Failed: ${err}`);
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @mousedown.self="close">
    <div class="modal-content">
      
      <div class="modal-header">
        <h2>Mint Flashcard</h2>
        <button class="close-btn" @click="close">×</button>
      </div>

      <div class="modal-body" v-if="draft">
        
        <!-- Lineage Indicator -->
        <div class="lineage-box" :class="draft.parent_card_id ? 'branch' : 'root'">
          <span class="lineage-icon">{{ draft.parent_card_id ? '↳' : '🌱' }}</span>
          <div class="lineage-text">
            <strong>{{ draft.parent_card_id ? 'Branch Card' : 'Root Card' }}</strong>
            <span v-if="draft.parent_card_id">Derived from Card #{{ draft.parent_card_id }}</span>
            <span v-else>New Origin from SGF</span>
          </div>
        </div>

        <!-- Basic Settings -->
        <div class="form-grid">
          <label>Target Moves:</label>
          <input type="number" v-model.number="draft.num_moves" min="1" max="50" class="dark-input" />

          <label>Default Visits:</label>
          <!-- 34b: visits live inside `grading_parameter.data.default_visits`,
               not at the top level. The OpenAPI-generated wire type leaves
               that path opaque (`{[key: string]: unknown}`); the typed
               accessor `defaultVisits` (see <script>) widens at the
               access boundary. The path is guaranteed to exist because
               `useMinting.prepareDraft` constructs it before the modal
               renders. -->
          <input type="number" v-model.number="defaultVisits" min="1" step="100" class="dark-input" />

          <label>Discount γ:</label>
          <!-- gamma rides in `grading_parameter.data.gamma` alongside
               default_visits; same opacity story, same typed-accessor
               pattern (see <script>). Range bounded to (0, 1] —
               Ebisu's recall-discount semantics. -->
          <input type="number" v-model.number="gamma" min="0.01" max="1" step="0.01" class="dark-input" />

          <label>Analysis Palette:</label>
          <select v-model="selectedPaletteId" class="dark-select">
            <option value="active">(Current Active View)</option>
            <option v-for="p in palettes" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>

        <!-- Tag Autocomplete -->
        <div class="form-group" style="margin-top: var(--space-medium);">
          <label class="tag-label">Tags:</label>
          <div class="tag-input-wrapper">
            <div class="tag-badges">
              <span v-for="(tag, i) in draft.tags" :key="tag" class="tag-badge">
                {{ tag }}
                <button class="tag-remove" @click="removeTag(i)">×</button>
              </span>
            </div>
            
            <input 
              type="text" 
              class="tag-input" 
              v-model="tagInput"
              placeholder="Add tag (e.g. $fight)..."
              @keydown="handleTagKeydown"
              @focus="showSuggestions = true"
              @blur="hideSuggestionsDelayed"
            />

            <!-- Dropdown -->
            <ul v-if="showSuggestions && filteredTags.length > 0" class="suggestions-list">
              <li v-for="sugg in filteredTags" :key="sugg" @mousedown.prevent="addTag(sugg)">
                {{ sugg }}
              </li>
            </ul>
          </div>
          <p class="hint">Press Enter or Comma to add. Prefix with $ for dynamic queries.</p>
        </div>

      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="close" :disabled="isLoading">Cancel</button>
        <button class="btn-submit" @click="submit" :disabled="isLoading">
          {{ isLoading ? 'Minting...' : 'Mint Card' }}
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

/* magic-literal: 420px modal width — same design decision as
   ConfirmLoadModal.vue. Modal-width substrate not pursued (3 sites,
   2 widths is a thin cluster). */
.modal-content {
  background: var(--surface-1); border: 1px solid var(--border-2); border-radius: var(--radius-default);
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

.lineage-box {
  display: flex; align-items: center; gap: var(--space-medium); padding: var(--space-medium);
  border-radius: var(--radius-default); margin-bottom: var(--space-medium); border: 1px solid transparent;
}
.lineage-box.root { background: color-mix(in srgb, var(--state-success) 10%, transparent); border-color: color-mix(in srgb, var(--state-success) 30%, transparent); }
.lineage-box.branch { background: color-mix(in srgb, var(--accent-primary) 10%, transparent); border-color: color-mix(in srgb, var(--accent-primary) 30%, transparent); }
.lineage-icon { font-size: var(--text-heading); }
.lineage-text { display: flex; flex-direction: column; font-size: var(--text-emphasis); color: var(--text-1); }
.lineage-text strong { color: var(--text-0); font-size: var(--text-emphasis); text-transform: uppercase; }

.form-grid { display: grid; grid-template-columns: 110px 1fr; gap: var(--space-medium); align-items: center; }
.form-grid label { font-size: var(--text-emphasis); color: var(--text-2); text-transform: uppercase; }
.dark-input, .dark-select {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0); padding: var(--space-default);
  border-radius: var(--radius-default); font-family: monospace; font-size: var(--text-emphasis); width: 100%; outline: none;
}
.dark-input:focus, .dark-select:focus { border-color: var(--accent-primary); }

.tag-label { font-size: var(--text-emphasis); color: var(--text-2); text-transform: uppercase; display: block; margin-bottom: var(--space-default); }
.tag-input-wrapper {
  background: var(--surface-0); border: 1px solid var(--border-2); border-radius: var(--radius-default);
  display: flex; flex-wrap: wrap; padding: var(--space-tight); gap: var(--space-tight); position: relative;
}
.tag-input-wrapper:focus-within { border-color: var(--accent-primary); }

.tag-badges { display: flex; flex-wrap: wrap; gap: var(--space-tight); }
.tag-badge {
  background: var(--border-1); color: var(--accent-primary); padding: 2px 6px; border-radius: var(--radius-default);
  font-size: var(--text-emphasis); font-family: monospace; display: flex; align-items: center; gap: var(--space-tight);
}
.tag-remove { background: none; border: none; color: var(--text-2); cursor: pointer; font-size: var(--text-emphasis); padding: 0; line-height: 1; }
.tag-remove:hover { color: var(--state-attention); }

.tag-input {
  background: transparent; border: none; color: var(--text-0); font-family: monospace;
  font-size: var(--text-emphasis); outline: none; flex: 1; min-width: 120px; padding: 2px;
}

.suggestions-list {
  position: absolute; top: 100%; left: 0; width: 100%; background: var(--surface-2);
  border: 1px solid var(--border-2); border-top: none; border-radius: 0 0 var(--radius-default) var(--radius-default);
  list-style: none; padding: 0; margin: 0; max-height: 150px; overflow-y: auto; z-index: var(--z-popover);
}
.suggestions-list li { padding: var(--space-default) var(--space-medium); font-size: var(--text-emphasis); font-family: monospace; color: var(--text-1); cursor: pointer; }
.suggestions-list li:hover { background: var(--border-1); color: var(--accent-primary); }

.hint { font-size: var(--text-body); color: var(--text-2); margin: var(--space-tight) 0 0 0; }

.modal-footer {
  display: flex; justify-content: flex-end; gap: var(--space-medium); padding: var(--space-medium) var(--space-medium);
  border-top: 1px solid var(--surface-3); background: var(--surface-2);
}
.btn-cancel { background: transparent; border: 1px solid var(--border-3); color: var(--text-1); padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-submit { background: var(--accent-primary); border: none; color: var(--surface-1); font-weight: bold; padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-submit:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }
</style>
