<!-- 
  src/components/RegistryEditor.vue 
  Managed Registry Editor with Defaults and Structural Protection.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed } from 'vue';

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
    pathStr.endsWith('parameters')
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
  'navigation.actionOnDirtyBoard': ['ask', 'new', 'overwrite'],
  // session-ui root (store.session.ui)
  'analysisLayout':                ['horizontal', 'vertical'],
  'pvAnimation.mode':              ['instant', 'sequential', 'window'],
  'pvAnimation.annotation':        ['none', 'from1', 'fromCurrent'],
  'qeuboToolbarView':              ['applied', 'A', 'B'],
};

function enumOptions(key: string): readonly string[] | undefined {
  return PATH_ENUMS[[...(props.path ?? []), key].join('.')];
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
          </div>
          <div class="action-group">
            <button v-if="isModified(key as string, value)" class="restore-btn" title="Restore branch defaults" @click="restoreDefault(key as string)">↺</button>
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
          </div>
          <div class="action-group">
            <button v-if="isModified(key as string, value)" class="restore-btn" title="Restore default value" @click="restoreDefault(key as string)">↺</button>
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
      <input v-model="newKeyName" placeholder="new symbol name..." class="dark-input scalar-input add-input" @keyup.enter="addKey"/>
      <button class="add-btn" @click="addKey">Add Symbol</button>
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
