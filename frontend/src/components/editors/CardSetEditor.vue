<!--
  src/components/editors/CardSetEditor.vue
  Master-Detail editor for Card Sets (Decks). Power-users construct
  Tree DSL pipelines plus an optional hyperparameter harness; bare
  identifiers in value position parse as `{ $param: name }` holes.
  See `src/lib/dsl-harness.ts` for the dialect and validator.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CardSet, HyperparamDecl, PipelineStageWithHoles } from '../../types';
import { Codemirror } from 'vue-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { parse, format, validate } from '../../lib/dsl-harness';
import HyperparameterPanel from './HyperparameterPanel.vue';

const { t } = useI18n();

const props = defineProps<{
  cardSets: Record<string, CardSet>;
  activeCardSetId: string;
}>();

const emit = defineEmits<{
  (e: 'update', payload: { path: string[], value: Record<string, CardSet> }): void;
  (e: 'update-active', id: string): void;
}>();

const selectedId = ref<string | null>(props.activeCardSetId || Object.keys(props.cardSets)[0] || null);
const pipelineStr = ref<string>('');
const parseErrorMsg = ref<string | null>(null);

const extensions = [oneDark, EditorView.lineWrapping];

// On selection change, reformat the persisted holey AST back to
// source. The formatter is deterministic; comments / source-author
// whitespace don't survive (matching the prior JSON.stringify
// round-trip).
watch(selectedId, (newId) => {
  if (newId && props.cardSets[newId]) {
    pipelineStr.value = format(props.cardSets[newId].pipeline);
    parseErrorMsg.value = null;
  }
}, { immediate: true });

const currentDecl = computed<HyperparamDecl[]>(
  () => (selectedId.value && props.cardSets[selectedId.value]?.hyperparameters) || [],
);

// Live validation surface: parser errors win first; if the pipeline
// parses, validate() against the declared hyperparameters and
// surface the first error. Warnings are not currently surfaced in
// the editor chrome (v1 scope).
const validationMsg = computed<string | null>(() => {
  if (parseErrorMsg.value) return parseErrorMsg.value;
  const current = selectedId.value && props.cardSets[selectedId.value];
  if (!current) return null;
  const r = validate(current.pipeline, current.hyperparameters);
  return r.errors[0]?.message ?? null;
});

function getClone(): Record<string, CardSet> {
  return JSON.parse(JSON.stringify(props.cardSets));
}

function commit(next: Record<string, CardSet>) {
  emit('update', { path: ['cardSets'], value: next });
}

function select(id: string) {
  selectedId.value = id;
}

function addCardSet() {
  const name = prompt(t('cardSet.prompt.deckName'));
  if (!name) return;
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (props.cardSets[id]) return alert(t('cardSet.alert.idExists'));

  const next = getClone();
  next[id] = {
    id,
    name,
    description: '',
    pipeline: [
      {
        stage: "select",
        selection: { type: "DescendantSelection" },
        ordering: { type: "bfs_order" }
      },
      { stage: "take", n: 20 },
      { stage: "shuffle" }
    ],
    hyperparameters: []
  };
  commit(next);
  select(id);
}

function deleteCardSet() {
  if (!selectedId.value) return;
  if (!confirm(t('cardSet.confirm.deleteDeck', { id: selectedId.value }))) return;

  const next = getClone();
  delete next[selectedId.value];

  const remainingKeys = Object.keys(next);
  const newSelection = remainingKeys.length > 0 ? remainingKeys[0] : null;

  commit(next);
  if (newSelection) {
    select(newSelection);
    if (props.activeCardSetId === selectedId.value) {
      emit('update-active', newSelection);
    }
  } else {
    selectedId.value = null;
    pipelineStr.value = '';
  }
}

function updateField(field: keyof CardSet, val: any) {
  if (!selectedId.value) return;
  const next = getClone();
  (next[selectedId.value] as any)[field] = val;
  commit(next);
}

/**
 * The free-form JSON5+holes authoring surface for power users. The
 * dialect (`src/lib/dsl-harness.ts`) admits trailing commas, single-
 * quoted strings, and bare-identifier holes; everything else stays
 * JSON-strict. ADR-0002 boundary cast: the parser returns a
 * structurally-typed AST that we assert as `PipelineStageWithHoles[]`
 * — the backend's typed pipeline executor (substitute() → wire) is
 * the loud-failure surface for malformed downstream payloads, while
 * parser-level and harness-level errors surface inline via
 * `parseErrorMsg` / `validationMsg`.
 */
function updatePipeline(newJsonStr: string) {
  pipelineStr.value = newJsonStr;
  const r = parse(newJsonStr);
  if (r.errors.length > 0) {
    parseErrorMsg.value = `${r.errors[0].message} (line ${r.errors[0].line}, col ${r.errors[0].column})`;
    return;
  }
  parseErrorMsg.value = null;
  if (selectedId.value && r.value) {
    const next = getClone();
    next[selectedId.value].pipeline = r.value as PipelineStageWithHoles[];
    commit(next);
  }
}

function updateHyperparameters(decls: HyperparamDecl[]) {
  if (!selectedId.value) return;
  const next = getClone();
  next[selectedId.value].hyperparameters = decls;
  commit(next);
}
</script>

<template>
  <div class="deck-editor">

    <!-- LEFT PANE: Directory -->
    <div class="sidebar">
      <div class="section">
        <div class="section-header">
          <span>{{ $t('cardSet.sidebar.header') }}</span>
          <button class="add-btn" @click="addCardSet">+</button>
        </div>
        <ul class="item-list">
          <li
            v-for="(set, key) in cardSets" :key="key"
            :class="{ active: selectedId === key }"
            @click="select(key as string)"
          >
            {{ set.name }}
            <span v-if="activeCardSetId === key" class="active-badge">{{ $t('cardSet.sidebar.selectedBadge') }}</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- RIGHT PANE: Details -->
    <div class="detail-pane">
      <div v-if="!selectedId || !cardSets[selectedId]" class="empty-state">
        {{ $t('cardSet.detail.empty') }}
      </div>

      <div v-else class="detail-content">
        <div class="detail-header">
          <h3>{{ selectedId }}</h3>
          <button class="del-btn" @click="deleteCardSet">{{ $t('cardSet.detail.delete') }}</button>
        </div>

        <div class="form-grid">
          <label>{{ $t('cardSet.field.name') }}</label>
          <input
            type="text"
            class="dark-input"
            :value="cardSets[selectedId].name"
            @input="(e: any) => updateField('name', e.target.value)"
          />

          <label>{{ $t('cardSet.field.description') }}</label>
          <input
            type="text"
            class="dark-input"
            :value="cardSets[selectedId].description"
            @input="(e: any) => updateField('description', e.target.value)"
          />
        </div>

        <HyperparameterPanel
          :model-value="currentDecl"
          @update:model-value="updateHyperparameters"
        />

        <div class="section-header pipeline-header">
          <span>{{ $t('cardSet.field.pipelineHeader') }}</span>
          <span v-if="validationMsg" class="error-badge">{{ validationMsg }}</span>
        </div>

        <div class="editor-wrap" :class="{ 'json-error': !!parseErrorMsg }">
          <Codemirror
            :model-value="pipelineStr"
            :extensions="extensions"
            :style="{ height: '100%', fontSize: '12px' }"
            @update:model-value="updatePipeline"
          />
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.deck-editor {
  display: flex; height: 400px; background: var(--surface-0); border: 1px solid var(--surface-3);
  border-radius: var(--radius-default); overflow: hidden; font-family: 'Consolas', monospace;
}

.sidebar { width: 200px; background: var(--surface-0); border-right: 1px solid var(--surface-3); display: flex; flex-direction: column; overflow-y: auto; flex-shrink: 0; }
.section { border-bottom: 1px solid var(--surface-2); }
.section-header { display: flex; justify-content: space-between; align-items: center; padding: var(--space-default) var(--space-medium); background: var(--surface-2); color: var(--text-1); font-size: var(--text-body); text-transform: uppercase; }
.pipeline-header { margin-top: var(--space-medium); border-top: 1px solid #1a1a1a; }
.add-btn { background: none; border: none; color: var(--accent-primary); cursor: pointer; font-weight: bold; font-size: var(--text-heading); }

.item-list { list-style: none; padding: 0; margin: 0; }
.item-list li { padding: var(--space-default) var(--space-medium); font-size: var(--text-emphasis); color: var(--text-1); cursor: pointer; border-left: 2px solid transparent; display: flex; justify-content: space-between; align-items: center;}
.item-list li:hover { background: var(--surface-2); }
.item-list li.active { background: var(--surface-0); border-left-color: var(--accent-primary); color: var(--accent-primary); }
.active-badge { font-size: var(--text-tiny); background: var(--accent-primary); color: var(--surface-0); padding: 1px 4px; border-radius: var(--radius-default); }

.detail-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--surface-0); }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--border-3); font-size: var(--text-emphasis); }
.detail-content { display: flex; flex-direction: column; height: 100%; overflow-y: auto; }

.detail-header { display: flex; justify-content: space-between; align-items: center; padding: var(--space-medium) var(--space-medium); border-bottom: 1px solid var(--surface-2); }
.detail-header h3 { margin: 0; font-size: var(--text-heading); color: var(--text-0); font-weight: normal; }
/* theme-exception: .del-btn's border (#5a1a1a) is a muted-dark-red
   tint for the destructive-action affordance — same rationale as
   PaletteEditor's .del-btn. */
.del-btn { background: var(--surface-0); color: var(--state-error); border: 1px solid #5a1a1a; padding: var(--space-tight) var(--space-default); border-radius: var(--radius-default); cursor: pointer; font-size: var(--text-body); }

.form-grid { padding: var(--space-medium); display: grid; grid-template-columns: 100px 1fr; gap: var(--space-medium); align-items: center; }
.form-grid label { font-size: var(--text-emphasis); color: var(--text-2); }
.dark-input { background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0); padding: var(--space-default); border-radius: var(--radius-default); font-family: monospace; font-size: var(--text-emphasis); width: 100%; outline: none; }
.dark-input:focus { border-color: var(--accent-primary); }

.editor-wrap { flex: 1; min-height: 150px; overflow: auto; border-top: 1px solid var(--surface-3); transition: border-color var(--duration-default); }
.editor-wrap.json-error { border-top: 2px solid var(--state-error); }
.error-badge { font-size: var(--text-tiny); color: var(--state-error); font-weight: bold; }
</style>
