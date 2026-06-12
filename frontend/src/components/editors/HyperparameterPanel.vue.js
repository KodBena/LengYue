/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const props = defineProps();
const emit = defineEmits();
// Cross-row name-uniqueness check. The DSL harness validator also
// reports duplicates at the pipeline level, but flagging at the
// declaration row gives the user a per-cell signal.
const duplicateNames = computed(() => {
    const seen = new Set();
    const dup = new Set();
    for (const d of props.modelValue) {
        if (seen.has(d.name))
            dup.add(d.name);
        seen.add(d.name);
    }
    return dup;
});
function emitAll(next) {
    emit('update:modelValue', next);
}
function addDeclaration() {
    const baseName = 'param';
    const existing = new Set(props.modelValue.map(d => d.name));
    let i = 1;
    let candidate = baseName;
    while (existing.has(candidate)) {
        i++;
        candidate = `${baseName}${i}`;
    }
    emitAll([...props.modelValue, { name: candidate, type: 'number', default: 0 }]);
}
function deleteDeclaration(idx) {
    const next = props.modelValue.slice();
    next.splice(idx, 1);
    emitAll(next);
}
function updateName(idx, value) {
    const cleaned = value.replace(/[^A-Za-z0-9_$]/g, '');
    const next = props.modelValue.slice();
    next[idx] = { ...next[idx], name: cleaned };
    emitAll(next);
}
function updateType(idx, value) {
    const current = props.modelValue[idx];
    // Type change forces a default that fits the new type; carry over
    // label; drop range/options that no longer apply.
    const next = props.modelValue.slice();
    if (value === 'number') {
        next[idx] = { name: current.name, type: 'number', default: 0, label: current.label };
    }
    else if (value === 'string') {
        next[idx] = { name: current.name, type: 'string', default: '', label: current.label };
    }
    else {
        next[idx] = { name: current.name, type: 'enum', default: '', options: [], label: current.label };
    }
    emitAll(next);
}
function updateDefault(idx, raw) {
    const decl = props.modelValue[idx];
    const next = props.modelValue.slice();
    if (decl.type === 'number') {
        const n = Number(raw);
        next[idx] = { ...decl, default: Number.isFinite(n) ? n : 0 };
    }
    else {
        next[idx] = { ...decl, default: raw };
    }
    emitAll(next);
}
function updateLabel(idx, value) {
    const next = props.modelValue.slice();
    next[idx] = { ...next[idx], label: value || undefined };
    emitAll(next);
}
function updateOptions(idx, raw) {
    const decl = props.modelValue[idx];
    if (decl.type !== 'enum' && decl.type !== 'string')
        return;
    const parts = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const next = props.modelValue.slice();
    if (decl.type === 'enum') {
        next[idx] = { ...decl, options: parts };
    }
    else {
        next[idx] = { ...decl, options: parts.length > 0 ? parts : undefined };
    }
    emitAll(next);
}
function updateRange(idx, which, raw) {
    const decl = props.modelValue[idx];
    if (decl.type !== 'number')
        return;
    const n = Number(raw);
    const safe = Number.isFinite(n) ? n : 0;
    const existing = decl.range ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
    const lo = which === 'lo' ? safe : existing[0];
    const hi = which === 'hi' ? safe : existing[1];
    const next = props.modelValue.slice();
    // Drop range when both bounds are unconstrained; otherwise keep.
    if (Number.isFinite(lo) || Number.isFinite(hi)) {
        next[idx] = { ...decl, range: [lo, hi] };
    }
    else {
        const { range: _drop, ...rest } = decl;
        next[idx] = rest;
    }
    emitAll(next);
}
function rangeLo(decl) {
    if (decl.type !== 'number' || !decl.range)
        return '';
    return Number.isFinite(decl.range[0]) ? String(decl.range[0]) : '';
}
function rangeHi(decl) {
    if (decl.type !== 'number' || !decl.range)
        return '';
    return Number.isFinite(decl.range[1]) ? String(decl.range[1]) : '';
}
function optionsStr(decl) {
    if (decl.type === 'enum')
        return decl.options.join(', ');
    if (decl.type === 'string')
        return decl.options?.join(', ') ?? '';
    return '';
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
/** @type {__VLS_StyleScopedClasses['harness-table']} */ ;
/** @type {__VLS_StyleScopedClasses['harness-table']} */ ;
/** @type {__VLS_StyleScopedClasses['harness-table']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "harness-panel" },
});
/** @type {__VLS_StyleScopedClasses['harness-panel']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "harness-header" },
});
/** @type {__VLS_StyleScopedClasses['harness-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.t('cardSet.harness.header'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.addDeclaration) },
    ...{ class: "add-btn" },
});
/** @type {__VLS_StyleScopedClasses['add-btn']} */ ;
if (__VLS_ctx.modelValue.length === 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty" },
    });
    /** @type {__VLS_StyleScopedClasses['empty']} */ ;
    (__VLS_ctx.t('cardSet.harness.empty'));
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "harness-table" },
    });
    /** @type {__VLS_StyleScopedClasses['harness-table']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.t('cardSet.harness.col.name'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.t('cardSet.harness.col.type'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.t('cardSet.harness.col.default'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.t('cardSet.harness.col.constraints'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.t('cardSet.harness.col.label'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    for (const [decl, idx] of __VLS_vFor((__VLS_ctx.modelValue))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (idx),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onInput: ((e) => __VLS_ctx.updateName(idx, e.target.value)) },
            type: "text",
            ...{ class: "dark-input" },
            ...{ class: ({ 'dup': __VLS_ctx.duplicateNames.has(decl.name) }) },
            value: (decl.name),
        });
        /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        /** @type {__VLS_StyleScopedClasses['dup']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            ...{ onChange: ((e) => __VLS_ctx.updateType(idx, e.target.value)) },
            ...{ class: "dark-input" },
            value: (decl.type),
        });
        /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "number",
        });
        (__VLS_ctx.t('cardSet.harness.type.number'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "string",
        });
        (__VLS_ctx.t('cardSet.harness.type.string'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "enum",
        });
        (__VLS_ctx.t('cardSet.harness.type.enum'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onInput: ((e) => __VLS_ctx.updateDefault(idx, e.target.value)) },
            type: "text",
            ...{ class: "dark-input" },
            value: (String(decl.default)),
        });
        /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        if (decl.type === 'number') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onInput: ((e) => __VLS_ctx.updateRange(idx, 'lo', e.target.value)) },
                type: "text",
                ...{ class: "dark-input narrow" },
                placeholder: (__VLS_ctx.t('cardSet.harness.placeholder.min')),
                value: (__VLS_ctx.rangeLo(decl)),
            });
            /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
            /** @type {__VLS_StyleScopedClasses['narrow']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onInput: ((e) => __VLS_ctx.updateRange(idx, 'hi', e.target.value)) },
                type: "text",
                ...{ class: "dark-input narrow" },
                placeholder: (__VLS_ctx.t('cardSet.harness.placeholder.max')),
                value: (__VLS_ctx.rangeHi(decl)),
            });
            /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
            /** @type {__VLS_StyleScopedClasses['narrow']} */ ;
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onInput: ((e) => __VLS_ctx.updateOptions(idx, e.target.value)) },
                type: "text",
                ...{ class: "dark-input" },
                placeholder: (__VLS_ctx.t('cardSet.harness.placeholder.options')),
                value: (__VLS_ctx.optionsStr(decl)),
            });
            /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onInput: ((e) => __VLS_ctx.updateLabel(idx, e.target.value)) },
            type: "text",
            ...{ class: "dark-input" },
            placeholder: (__VLS_ctx.t('cardSet.harness.placeholder.label')),
            value: (decl.label ?? ''),
        });
        /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.modelValue.length === 0))
                        return;
                    __VLS_ctx.deleteDeclaration(idx);
                    // @ts-ignore
                    [t, t, t, t, t, t, t, t, t, t, t, t, t, t, addDeclaration, modelValue, modelValue, updateName, duplicateNames, updateType, updateDefault, updateRange, updateRange, rangeLo, rangeHi, updateOptions, optionsStr, updateLabel, deleteDeclaration,];
                } },
            ...{ class: "row-del-btn" },
            title: (__VLS_ctx.t('cardSet.harness.deleteRow')),
        });
        /** @type {__VLS_StyleScopedClasses['row-del-btn']} */ ;
        // @ts-ignore
        [t,];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
