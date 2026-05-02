<!-- 
  src/components/MintCardModal.vue
  Floating modal for flashcard minting and tag management.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
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

// Typed accessor for the modal's only field inside `grading_parameter`.
// The wire shape declares `grading_parameter: { [key: string]: unknown } | null`
// (OpenAPI-honest about the blob's opacity), but `useMinting.prepareDraft`
// populates `data.default_visits: number` before the modal renders, and
// the modal's contract is to surface that one field as editable. The
// localized cast widens at the access boundary; the rest of the blob
// stays opaque.
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
function hideSuggestionsDelayed() {
  window.setTimeout(() => { showSuggestions.value = false; }, 150);
}

// ─── Submission ──────────────────────────────────────────────────────────────

async function submit() {
  if (!draft.value) return;
  isLoading.value = true;

  // Apply Palette Override if one was specifically chosen.
  // 34b: The override rebuilds `grading_parameter` from the palette, so we
  // must re-attach `default_visits` afterwards — otherwise we'd clobber the
  // value the user may have edited in the modal.
  if (selectedPaletteId.value !== 'active') {
    const env = store.profile.settings.engine.katago.analysis_env;
    const p = env.palettes.find(x => x.id === selectedPaletteId.value);
    if (p) {
      // Local cast at the read site: the wire shape's `grading_parameter`
      // is `{[key: string]: unknown} | null`; the create-flow contract
      // populates `data.default_visits` (see `useMinting.prepareDraft`).
      const gp = draft.value.grading_parameter as
        | { data?: { default_visits?: number } }
        | null;
      const preservedVisits = gp?.data?.default_visits;
      draft.value.grading_parameter = {
        data: {
          analysis_config: {
            bindings: { delta_fn: p.delta_fn, state_fns: p.state_fns, summary_fn: p.summary_fn },
            parameters: env.parameters,
            symbols: env.symbols
          },
          default_visits: preservedVisits
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

          <label>Analysis Palette:</label>
          <select v-model="selectedPaletteId" class="dark-select">
            <option value="active">(Current Active View)</option>
            <option v-for="p in palettes" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>

        <!-- Tag Autocomplete -->
        <div class="form-group" style="margin-top: 15px;">
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
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}

.modal-content {
  background: #111; border: 1px solid #333; border-radius: 6px;
  width: 420px; max-width: 90vw; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
  display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 15px; border-bottom: 1px solid #222; background: #181818;
}
.modal-header h2 { margin: 0; font-size: 14px; color: #fff; text-transform: uppercase; letter-spacing: 0.05em; }
.close-btn { background: none; border: none; color: #888; font-size: 18px; cursor: pointer; }
.close-btn:hover { color: #fff; }

.modal-body { padding: 15px; }

.lineage-box {
  display: flex; align-items: center; gap: 10px; padding: 10px;
  border-radius: 4px; margin-bottom: 15px; border: 1px solid transparent;
}
.lineage-box.root { background: rgba(76, 175, 80, 0.1); border-color: rgba(76, 175, 80, 0.3); }
.lineage-box.branch { background: rgba(74, 174, 240, 0.1); border-color: rgba(74, 174, 240, 0.3); }
.lineage-icon { font-size: 20px; }
.lineage-text { display: flex; flex-direction: column; font-size: 11px; color: #aaa; }
.lineage-text strong { color: #eee; font-size: 12px; text-transform: uppercase; }

.form-grid { display: grid; grid-template-columns: 110px 1fr; gap: 10px; align-items: center; }
.form-grid label { font-size: 11px; color: #888; text-transform: uppercase; }
.dark-input, .dark-select {
  background: #050505; border: 1px solid #333; color: #eee; padding: 6px;
  border-radius: 3px; font-family: monospace; font-size: 12px; width: 100%; outline: none;
}
.dark-input:focus, .dark-select:focus { border-color: #4aaef0; }

.tag-label { font-size: 11px; color: #888; text-transform: uppercase; display: block; margin-bottom: 6px; }
.tag-input-wrapper {
  background: #050505; border: 1px solid #333; border-radius: 3px;
  display: flex; flex-wrap: wrap; padding: 4px; gap: 4px; position: relative;
}
.tag-input-wrapper:focus-within { border-color: #4aaef0; }

.tag-badges { display: flex; flex-wrap: wrap; gap: 4px; }
.tag-badge {
  background: #2a2a2a; color: #4aaef0; padding: 2px 6px; border-radius: 3px;
  font-size: 11px; font-family: monospace; display: flex; align-items: center; gap: 4px;
}
.tag-remove { background: none; border: none; color: #888; cursor: pointer; font-size: 12px; padding: 0; line-height: 1; }
.tag-remove:hover { color: #ff4a4a; }

.tag-input {
  background: transparent; border: none; color: #eee; font-family: monospace;
  font-size: 12px; outline: none; flex: 1; min-width: 120px; padding: 2px;
}

.suggestions-list {
  position: absolute; top: 100%; left: 0; width: 100%; background: #1a1a1a;
  border: 1px solid #333; border-top: none; border-radius: 0 0 3px 3px;
  list-style: none; padding: 0; margin: 0; max-height: 150px; overflow-y: auto; z-index: 10;
}
.suggestions-list li { padding: 6px 10px; font-size: 11px; font-family: monospace; color: #ccc; cursor: pointer; }
.suggestions-list li:hover { background: #2a2a2a; color: #4aaef0; }

.hint { font-size: 10px; color: #666; margin: 4px 0 0 0; }

.modal-footer {
  display: flex; justify-content: flex-end; gap: 10px; padding: 12px 15px;
  border-top: 1px solid #222; background: #181818;
}
.btn-cancel { background: transparent; border: 1px solid #444; color: #aaa; padding: 6px 12px; border-radius: 3px; cursor: pointer; }
.btn-cancel:hover { background: #222; color: #fff; }
.btn-submit { background: #4aaef0; border: none; color: #111; font-weight: bold; padding: 6px 15px; border-radius: 3px; cursor: pointer; }
.btn-submit:hover:not(:disabled) { background: #5bc0ff; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
