/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Codemirror } from 'vue-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { parse, format, validate } from '../../lib/dsl-harness';
import HyperparameterPanel from './HyperparameterPanel.vue';
const { t } = useI18n();
const props = defineProps();
const emit = defineEmits();
const selectedId = ref(props.activeCardSetId || Object.keys(props.cardSets)[0] || null);
const pipelineStr = ref('');
const parseErrorMsg = ref(null);
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
const currentDecl = computed(() => (selectedId.value && props.cardSets[selectedId.value]?.hyperparameters) || []);
// Live validation surface: parser errors win first; if the pipeline
// parses, validate() against the declared hyperparameters and
// surface the first error. Warnings are not currently surfaced in
// the editor chrome (v1 scope).
const validationMsg = computed(() => {
    if (parseErrorMsg.value)
        return parseErrorMsg.value;
    const current = selectedId.value && props.cardSets[selectedId.value];
    if (!current)
        return null;
    const r = validate(current.pipeline, current.hyperparameters);
    return r.errors[0]?.message ?? null;
});
function getClone() {
    return JSON.parse(JSON.stringify(props.cardSets));
}
function commit(next) {
    emit('update', { path: ['cardSets'], value: next });
}
function select(id) {
    selectedId.value = id;
}
function addCardSet() {
    const name = prompt(t('cardSet.prompt.deckName'));
    if (!name)
        return;
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (props.cardSets[id])
        return alert(t('cardSet.alert.idExists'));
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
    if (!selectedId.value)
        return;
    if (!confirm(t('cardSet.confirm.deleteDeck', { id: selectedId.value })))
        return;
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
    }
    else {
        selectedId.value = null;
        pipelineStr.value = '';
    }
}
// Generic key parameter ties the value's type to the named field, so the
// keyed write typechecks without the historical `as any` erasure.
function updateField(field, val) {
    if (!selectedId.value)
        return;
    const next = getClone();
    next[selectedId.value][field] = val;
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
function updatePipeline(newJsonStr) {
    pipelineStr.value = newJsonStr;
    const r = parse(newJsonStr);
    if (r.errors.length > 0) {
        parseErrorMsg.value = `${r.errors[0].message} (line ${r.errors[0].line}, col ${r.errors[0].column})`;
        return;
    }
    parseErrorMsg.value = null;
    if (selectedId.value && r.value) {
        const next = getClone();
        next[selectedId.value].pipeline = r.value;
        commit(next);
    }
}
function updateHyperparameters(decls) {
    if (!selectedId.value)
        return;
    const next = getClone();
    next[selectedId.value].hyperparameters = decls;
    commit(next);
}
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['item-list']} */ ;
/** @type {__VLS_StyleScopedClasses['item-list']} */ ;
/** @type {__VLS_StyleScopedClasses['item-list']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-header']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-wrap']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "deck-editor" },
});
/** @type {__VLS_StyleScopedClasses['deck-editor']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "sidebar" },
});
/** @type {__VLS_StyleScopedClasses['sidebar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section" },
});
/** @type {__VLS_StyleScopedClasses['section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section-header" },
});
/** @type {__VLS_StyleScopedClasses['section-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.$t('cardSet.sidebar.header'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.addCardSet) },
    ...{ class: "add-btn" },
});
/** @type {__VLS_StyleScopedClasses['add-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
    ...{ class: "item-list" },
});
/** @type {__VLS_StyleScopedClasses['item-list']} */ ;
for (const [set, key] of __VLS_vFor((__VLS_ctx.cardSets))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.select(key /* v-for over an object types key as string|number; cardSet keys are strings */);
                // @ts-ignore
                [$t, addCardSet, cardSets, select,];
            } },
        key: (key),
        ...{ class: ({ active: __VLS_ctx.selectedId === key }) },
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (set.name);
    if (__VLS_ctx.activeCardSetId === key) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "active-badge" },
        });
        /** @type {__VLS_StyleScopedClasses['active-badge']} */ ;
        (__VLS_ctx.$t('cardSet.sidebar.selectedBadge'));
    }
    // @ts-ignore
    [$t, selectedId, activeCardSetId,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "detail-pane" },
});
/** @type {__VLS_StyleScopedClasses['detail-pane']} */ ;
if (!__VLS_ctx.selectedId || !__VLS_ctx.cardSets[__VLS_ctx.selectedId]) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
    (__VLS_ctx.$t('cardSet.detail.empty'));
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "detail-content" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "detail-header" },
    });
    /** @type {__VLS_StyleScopedClasses['detail-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.selectedId);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.deleteCardSet) },
        ...{ class: "del-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['del-btn']} */ ;
    (__VLS_ctx.$t('cardSet.detail.delete'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.$t('cardSet.field.name'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onInput: ((e) => __VLS_ctx.updateField('name', e.target.value)) },
        type: "text",
        ...{ class: "dark-input" },
        value: (__VLS_ctx.cardSets[__VLS_ctx.selectedId].name),
    });
    /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.$t('cardSet.field.description'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onInput: ((e) => __VLS_ctx.updateField('description', e.target.value)) },
        type: "text",
        ...{ class: "dark-input" },
        value: (__VLS_ctx.cardSets[__VLS_ctx.selectedId].description),
    });
    /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
    const __VLS_0 = HyperparameterPanel;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.currentDecl),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.currentDecl),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_5;
    const __VLS_6 = {
        ...{ 'update:modelValue': {} },
        'onUpdate:modelValue': (__VLS_ctx.updateHyperparameters),
    };
    var __VLS_3;
    var __VLS_4;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section-header pipeline-header" },
    });
    /** @type {__VLS_StyleScopedClasses['section-header']} */ ;
    /** @type {__VLS_StyleScopedClasses['pipeline-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.$t('cardSet.field.pipelineHeader'));
    if (__VLS_ctx.validationMsg) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "error-badge" },
        });
        /** @type {__VLS_StyleScopedClasses['error-badge']} */ ;
        (__VLS_ctx.validationMsg);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "editor-wrap" },
        ...{ class: ({ 'json-error': !!__VLS_ctx.parseErrorMsg }) },
    });
    /** @type {__VLS_StyleScopedClasses['editor-wrap']} */ ;
    /** @type {__VLS_StyleScopedClasses['json-error']} */ ;
    let __VLS_7;
    /** @ts-ignore @type { | typeof __VLS_components.Codemirror} */
    Codemirror;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.pipelineStr),
        extensions: (__VLS_ctx.extensions),
        ...{ style: ({ height: '100%', fontSize: '12px' }) },
    }));
    const __VLS_9 = __VLS_8({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.pipelineStr),
        extensions: (__VLS_ctx.extensions),
        ...{ style: ({ height: '100%', fontSize: '12px' }) },
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    let __VLS_12;
    const __VLS_13 = {
        ...{ 'update:modelValue': {} },
        'onUpdate:modelValue': (__VLS_ctx.updatePipeline),
    };
    var __VLS_10;
    var __VLS_11;
}
// @ts-ignore
[$t, $t, $t, $t, $t, cardSets, cardSets, cardSets, selectedId, selectedId, selectedId, selectedId, selectedId, deleteCardSet, updateField, updateField, currentDecl, updateHyperparameters, validationMsg, validationMsg, parseErrorMsg, pipelineStr, extensions, updatePipeline,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
