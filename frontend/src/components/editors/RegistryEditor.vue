<!-- 
  src/components/editors/RegistryEditor.vue 
  Managed Registry Editor with Defaults and Structural Protection.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { SUPPORTED_LOCALES } from '../../i18n/locales';
import { WINRATE_FRAMINGS } from '../../engine/katago/types';
import { BUNDLE_COMPRESSION_SCHEMES } from '../../types';

const props = defineProps<{
  registry: any;
  defaults?: any; // The "Shadow Schema" for restoration
  path?: string[]; 
}>();

const emit = defineEmits(['update']);

const newKeyName = ref('');

// --- Structural Rules ---
// Define which parts of the registry allow key additions/deletions.
// For everything else, the structure is "Program-Defined" and locked.
const isDynamicNode = computed(() => {
  if (!props.path) return false;
  const pathStr = props.path.join('.');
  return (
    pathStr.endsWith('symbols') ||
    pathStr.endsWith('state_fns') ||
    pathStr.endsWith('bindings') ||
    pathStr.endsWith('parameters') ||
    // KataGo's `overrideSettings` is an open-ended namespace: the
    // accepted-key set is engine-version-dependent and the user
    // routinely adds keys beyond the default seed (e.g.
    // `rootPolicyTemperature`, `analysisPVLen`). Treating it as
    // dynamic surfaces the add/remove affordances so the user
    // doesn't have to source-edit defaults.ts to extend the dict.
    pathStr.endsWith('overrideSettings')
  );
});

function getPath(key: string) {
  return [...(props.path || []), key];
}

function isObject(val: any) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

// Path → finite set of allowed string values for typed-union fields.
// The lookup key is a dot-joined path RELATIVE to the editor's root —
// `App.vue` mounts the editor twice (once with `store.profile.settings`
// as the root, once with `store.session.ui`); both rooting contexts
// share this table. When introducing a new typed-string-union field
// anywhere under either root, add an entry here so the editor renders
// a dropdown rather than a free-text input the user has to read source
// to discover the valid values for.
//
// Fields whose value set is dynamic (palette ids, card-set ids, the
// active tab) are out of scope here — they need a per-root option
// resolver, not a static table.
const PATH_ENUMS: Record<string, readonly string[]> = {
  // settings root (store.profile.settings)
  'appearance.theme':              ['dark', 'cluster'],
  'appearance.locale':             [...SUPPORTED_LOCALES],
  'navigation.actionOnDirtyBoard': ['ask', 'new', 'overwrite'],
  // KataGo `overrideSettings` keys with frontend-side meaning. Most
  // entries in `overrideSettings` are opaque pass-throughs (free-form
  // numbers / strings the user can add or remove via the dynamic-node
  // affordance); the entries listed here have a wire-vocabulary the
  // frontend reasons about by name and benefit from a dropdown both
  // for typo-prevention and for surfacing the accepted set without a
  // doc lookup. WINRATE_FRAMINGS is the exported truth set in
  // `engine/katago/types.ts`; importing rather than re-listing keeps
  // the two sites from drifting.
  'engine.katago.overrideSettings.reportAnalysisWinratesAs': [...WINRATE_FRAMINGS],
  // Analysis-bundle wire-format choice. The tuple's source-of-truth
  // declaration lives in `src/types.ts` (alongside the union type
  // that AppSettings.engine.katago.bundleCompressionScheme uses),
  // so adding a new scheme is a one-line touch there and the
  // dropdown picks it up automatically here.
  'engine.katago.bundleCompressionScheme': [...BUNDLE_COMPRESSION_SCHEMES],
  // session-ui root (store.session.ui)
  'analysisLayout':                ['horizontal', 'vertical'],
  'pvAnimation.mode':              ['instant', 'sequential', 'window'],
  'pvAnimation.annotation':        ['none', 'from1', 'fromCurrent'],
  'qeuboToolbarView':              ['applied', 'A', 'B'],
  'boardVariations':               ['off', 'circles', 'letters'],
};

function enumOptions(key: string): readonly string[] | undefined {
  return PATH_ENUMS[[...(props.path ?? []), key].join('.')];
}

// Path → human-readable warning / hint string. Same lookup convention
// as PATH_ENUMS: dot-joined path RELATIVE to the editor's mount root.
// Rendered as a `⚠` glyph after the leaf label, with the text carried
// on a native `title` attribute (browser tooltip on hover) and an
// `aria-label` for assistive tech. Use this table sparingly: it's
// intended for paths whose values have load-bearing semantics the
// user would otherwise have to spelunk source to discover, NOT for
// general-purpose field documentation (the registry editor is
// already a deep technical surface; saturating it with hint icons
// is noise). Current entries:
//   - reportAnalysisWinratesAs: only 'WHITE' is fully supported;
//     non-WHITE values get raw-packet normalisation but palette
//     enrichment runs in the wire framing on the proxy side, so
//     the seeded `winrate` / `score_lead` state_fns render
//     inverted. Tracking note in `docs/handoff-current.md`'s
//     "Known gaps (frontend)".
const PATH_TOOLTIPS: Record<string, string> = {
  'engine.katago.overrideSettings.reportAnalysisWinratesAs':
    "Only 'WHITE' is fully supported. 'BLACK' and 'SIDETOMOVE' will " +
    'not be supported in the near future unless another contributor ' +
    'steps up — raw response fields are normalised to WHITE on receipt, ' +
    'but palette enrichment runs in the wire framing on the proxy side, ' +
    'so charts using the seeded `winrate` / `score_lead` symbols will ' +
    'display in the wire framing rather than canonical WHITE.',
  'engine.katago.analysisAutoSave':
    'Experimental — opt-in. When on, the SPA PUTs the per-board analysis ' +
    "bundle to the server after every authoritative analysis packet " +
    '(debounced ~2 s). Continuous saving consumes bandwidth and counts ' +
    "against your per-user storage quota; a quota or per-bundle-cap " +
    'failure pauses auto-save for the affected board until a manual Save ' +
    'succeeds or you toggle this leaf off and back on. Requires ' +
    'analysisStorageEnabled to be true; flipping the parent off ' +
    'implicitly disables auto-save.',
  'engine.katago.bundleCompressionScheme':
    "Wire-format choice for analysis-bundle persistence. " +
    "'v1' is the legacy wire (canonical JSON, gzip on backend). " +
    "'v2-projected' is lossless on the SPA's typed shape — the SPA " +
    'projects each packet through the typed-shape allow-list (drops ' +
    'unmodelled KataGo fields like scoreStdev / scoreMean / per-move ' +
    'ownership) and the backend brotli-wraps the result. ' +
    "'v2-quantized' is lossy: in addition to projection, ownership is " +
    'Q4-quantised (max-abs error ≤ 0.0625) and policy is bitmap- ' +
    'factored with Q8 on legal cells (max-abs error ≤ 0.00195 on ' +
    'legals; illegal cells exact). The byte leader from the 2026-05-25 ' +
    'research arc (typically ~85% smaller than canonical JSON); the ' +
    'Q4 step-size on ownership is visible as banding on slowly ' +
    "drifting cells. 'v2-quantized-hifi' is the same shape but with " +
    'Q8 on ownership (max-abs error ≤ 1/256 ≈ 0.0039), trading ~6% of ' +
    'the savings for perceptually-imperceptible ownership precision. ' +
    "'v2-quantized-hifi-xor' adds byte-level XOR delta encoding " +
    'across consecutive packets on the Q8 ownership bytes; ' +
    'reconstruction is byte-identical to v2-quantized-hifi (XOR is ' +
    'algebraic, no precision loss), but the 2026-05-26 framework ' +
    'probe measured ~23% additional post-brotli savings since brotli ' +
    'compresses the literal-zero bytes the XOR produces when ' +
    'consecutive packets share Q8 bin values. Stored rows decode ' +
    'regardless of the current setting, so flipping this leaf only ' +
    'affects writes from this point forward — existing saved bundles ' +
    'remain accessible.',
};

function tooltipText(key: string): string | undefined {
  return PATH_TOOLTIPS[[...(props.path ?? []), key].join('.')];
}

function getFieldType(key: string, value: any) {
  if (typeof value !== 'string') return 'scalar';
  if (enumOptions(key)) return 'enum';
  const parentKey = props.path?.[props.path.length - 1];
  if (parentKey === 'symbols') return 'expression';
  if (parentKey === 'bindings' || parentKey === 'state_fns') return 'symbol-ref';
  return value.length > 40 ? 'expression' : 'scalar';
}

// --- Action Handlers ---

function handleUpdate(key: string, value: any) {
  emit('update', { path: getPath(key), value });
}

function restoreDefault(key: string) {
  if (props.defaults && props.defaults[key] !== undefined) {
    handleUpdate(key, props.defaults[key]);
  }
}

function deleteKey(key: string) {
  if (!isDynamicNode.value) return; // Guard
  const newObj = { ...props.registry };
  delete newObj[key];
  emit('update', { path: props.path || [], value: newObj });
}

function addKey() {
  if (!newKeyName.value || !isDynamicNode.value) return;
  const newObj = { ...props.registry, [newKeyName.value]: "" };
  emit('update', { path: props.path || [], value: newObj });
  newKeyName.value = '';
}

// Check if a value has been modified from its original default
function isModified(key: string, value: any) {
  if (!props.defaults) return false;
  return JSON.stringify(value) !== JSON.stringify(props.defaults[key]);
}
</script>

<template>
  <div class="registry-editor" :class="{ 'registry-root': !path }">
    <div v-for="(value, key) in registry" :key="key" class="registry-row">
      
      <!-- BRANCH: Object recursion -->
      <div v-if="isObject(value)" class="registry-branch">
        <div class="branch-header">
          <div class="label-group">
             <span class="branch-label">{{ key }}</span>
             <span v-if="isModified(key as string, value)" class="modified-dot"></span>
             <span
               v-if="tooltipText(key as string)"
               class="tooltip-hint"
               role="img"
               :aria-label="tooltipText(key as string)"
               :title="tooltipText(key as string)"
             >⚠</span>
          </div>
          <div class="action-group">
            <button v-if="isModified(key as string, value)" class="restore-btn" :title="$t('registry.restoreBranchDefaults')" @click="restoreDefault(key as string)">↺</button>
            <button v-if="isDynamicNode" class="delete-btn" @click="deleteKey(key as string)">×</button>
          </div>
        </div>
        <div class="branch-content">
          <RegistryEditor 
            :registry="value" 
            :defaults="defaults ? defaults[key] : undefined"
            :path="getPath(key as string)" 
            @update="e => emit('update', e)"
          />
        </div>
      </div>

      <!-- LEAF: Scalar/Expression/Ref -->
      <div v-else class="registry-leaf" :class="getFieldType(key as string, value)">
        <div class="leaf-header">
          <div class="label-group">
            <label class="leaf-label">{{ key }}</label>
            <span v-if="isModified(key as string, value)" class="modified-dot"></span>
            <span
              v-if="tooltipText(key as string)"
              class="tooltip-hint"
              role="img"
              :aria-label="tooltipText(key as string)"
              :title="tooltipText(key as string)"
            >⚠</span>
          </div>
          <div class="action-group">
            <button v-if="isModified(key as string, value)" class="restore-btn" :title="$t('registry.restoreDefault')" @click="restoreDefault(key as string)">↺</button>
            <button v-if="isDynamicNode" class="delete-btn" @click="deleteKey(key as string)">×</button>
          </div>
        </div>
        
        <div class="leaf-input-container">
          <textarea
            v-if="getFieldType(key as string, value) === 'expression'"
            class="dark-input expression-input"
            :value="value"
            spellcheck="false"
            @input="(e: any) => handleUpdate(key as string, e.target.value)"
          ></textarea>

          <div v-else-if="getFieldType(key as string, value) === 'symbol-ref'" class="symbol-ref-box">
             <span class="ref-icon">λ</span>
             <input type="text" class="dark-input scalar-input ref-input" :value="value" @input="(e: any) => handleUpdate(key as string, e.target.value)"/>
          </div>

          <input v-else-if="typeof value === 'boolean'" type="checkbox" :checked="value" @change="(e: any) => handleUpdate(key as string, e.target.checked)"/>
          <select
            v-else-if="getFieldType(key as string, value) === 'enum'"
            class="dark-input scalar-input"
            :value="value"
            @change="(e: any) => handleUpdate(key as string, e.target.value)"
          >
            <option v-for="opt in enumOptions(key as string)" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <input v-else :type="typeof value === 'number' ? 'number' : 'text'" class="dark-input scalar-input" :value="value" @input="(e: any) => handleUpdate(key as string, typeof value === 'number' ? Number(e.target.value) : e.target.value)"/>
        </div>
      </div>
    </div>

    <!-- Only show Add interface if this node is whitelisted as Dynamic -->
    <div v-if="isDynamicNode" class="add-key-row">
      <input v-model="newKeyName" :placeholder="$t('registry.newSymbolPlaceholder')" class="dark-input scalar-input add-input" @keyup.enter="addKey"/>
      <button class="add-btn" @click="addKey">{{ $t('registry.addSymbol') }}</button>
    </div>
  </div>
</template>

<style scoped>
.registry-editor { display: flex; flex-direction: column; font-family: 'Consolas', monospace; }
.registry-row { margin-bottom: 2px; }

.branch-header, .leaf-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-tight); }
.label-group { display: flex; align-items: center; gap: var(--space-default); }
.action-group { display: flex; align-items: center; gap: var(--space-default); }

/* theme-exception: .modified-dot uses #fbbf24 (Tailwind amber-400)
   as a "this leaf has been edited" indicator. A semantic anchor for
   "edited / pending" doesn't exist in the current substrate; the
   existing --state-warning (#f0a04a) is close in hue but differs in
   brightness and is reserved for warning-level system messages.
   Preserved verbatim. */
.modified-dot { width: 4px; height: 4px; border-radius: var(--radius-circle); background: #fbbf24; box-shadow: 0 0 4px #fbbf24; }

/* The tooltip-hint glyph uses --state-warning (#f0a04a) — the
   substrate's warning-level anchor, deliberately distinct from
   .modified-dot's amber-400 so the two indicators read as
   different concerns: amber dot = "you've edited this leaf",
   warning glyph = "the value here has load-bearing semantics
   you should know about." Hover surfaces the full text via the
   native `title` attribute; aria-label mirrors it for assistive
   tech. */
.tooltip-hint {
  color: var(--state-warning);
  font-size: var(--text-emphasis);
  cursor: help;
  user-select: none;
  line-height: 1;
}

.branch-label {
  color: var(--accent-primary); text-transform: uppercase; font-size: var(--text-body); font-weight: bold;
  padding: var(--space-tight) var(--space-default); background: color-mix(in srgb, var(--accent-primary) 5%, transparent); border-left: 2px solid var(--accent-primary);
}

.branch-content { padding-left: var(--space-medium); border-left: 1px solid var(--surface-3); margin-left: var(--space-tight); }

/* theme-exception: .expression-input's #fbbf24 text matches the
   .modified-dot indicator above — same Tailwind amber-400, marking
   asteval expressions visually distinct from non-expression scalar
   inputs. Same substrate gap as the indicator. */
.expression-input {
  width: 100%; min-height: 50px; padding: var(--space-default); line-height: 1.4;
  color: #fbbf24; background: var(--surface-0); border: 1px solid var(--surface-3); resize: vertical;
}

.symbol-ref-box { display: flex; align-items: center; width: 100%; gap: var(--space-default); }
/* theme-exception: .ref-icon / .ref-input use #f472b6 (Tailwind
   pink-400) as a "symbolic reference" indicator — visually distinct
   from expressions (amber) and scalars (white-ish). No semantic anchor
   for "reference" in the substrate. */
.ref-icon { color: #f472b6; font-size: var(--text-heading); }
.ref-input { color: #f472b6; font-style: italic; flex: 1; }

.registry-leaf { padding: 0; border-bottom: 1px solid var(--surface-2); }
.registry-leaf.scalar, .registry-leaf.symbol-ref, .registry-leaf.enum { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: var(--space-medium); }
.leaf-label { color: var(--text-2); font-size: var(--text-emphasis); }

.restore-btn { background: none; border: none; color: var(--text-2); cursor: pointer; font-size: var(--text-emphasis); }
.delete-btn { background: none; border: none; color: var(--border-3); cursor: pointer; font-size: var(--text-heading); }

.add-key-row { display: flex; padding: var(--space-default); gap: var(--space-tight); background: rgba(0,0,0,0.2); }
.add-input { flex: 1; border-style: dashed; }
.add-btn { background: var(--surface-3); border: 1px solid var(--border-2); color: var(--accent-primary); cursor: pointer; font-size: var(--text-body); padding: 0 var(--space-default); text-transform: uppercase; }

.dark-input { background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-1); font-size: var(--text-emphasis); }
.scalar-input { height: 22px; padding: 0 var(--space-default); width: 140px; }
</style>
