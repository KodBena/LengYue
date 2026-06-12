/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, computed, watch, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQeubo } from '../../composables/useQeubo';
import { pushSystemMessage } from '../../store';
import { currentClaim, onClaimChange } from '../../lib/knobs';
const { t } = useI18n();
import { Codemirror } from 'vue-codemirror';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
const props = defineProps();
const emit = defineEmits();
const qeubo = useQeubo();
// Editor Extensions. `EditorView.lineWrapping` makes long single-line
// formulas wrap visually instead of pushing the editor outward and
// squeezing the sidebar's symbol list off-screen.
const extensions = [python(), oneDark, EditorView.lineWrapping];
const selectedType = ref(null);
const selectedId = ref('');
const symbolKeys = computed(() => Object.keys(props.env.symbols));
const paramKeys = computed(() => Object.keys(props.env.parameters));
// Deep clone helper to safely mutate and emit
function getClone() {
    return JSON.parse(JSON.stringify(props.env));
}
function commit(newEnv) {
    emit('update', { path: ['engine', 'katago', 'analysis_env'], value: newEnv });
}
// ── Selection ──────────────────────────────────────────
function select(type, id) {
    selectedType.value = type;
    selectedId.value = id;
}
// ── Mutations ──────────────────────────────────────────
function addSymbol() {
    const name = prompt(t('palette.prompt.symbolName'));
    if (!name || props.env.symbols[name])
        return;
    const next = getClone();
    next.symbols[name] = '0.0';
    commit(next);
    select('symbol', name);
}
function updateSymbolValue(val) {
    if (selectedType.value !== 'symbol')
        return;
    const next = getClone();
    next.symbols[selectedId.value] = val;
    commit(next);
}
function addParameter() {
    const name = prompt(t('palette.prompt.parameterName'));
    if (!name || props.env.parameters[name] !== undefined)
        return;
    const next = getClone();
    next.parameters[name] = 1.0;
    commit(next);
    select('parameter', name);
}
function updateParameterValue(val) {
    if (selectedType.value !== 'parameter')
        return;
    // Knob-registry Phase 6: respect the substrate's hard claim. When
    // a qEUBO experiment is running, the parameter's KnobDecl is
    // hard-claimed and manual writes must be refused per ADR-0002.
    // The input is also rendered `:disabled` via `parameterValueDisabled`,
    // so this guard is the belt-and-braces backstop for programmatic
    // edits and the rare race window between claim acquisition and
    // re-render. Skipping the commit (rather than throwing) matches the
    // KnobSlider's behaviour — the substrate-side WriteResult would be
    // `refused`/`hard-claim-held`, surfaced as a user-visible message
    // and a no-op on the underlying store.
    const knobId = `qeubo.${selectedId.value}`;
    const claim = currentClaim(knobId);
    if (claim?.policy === 'hard') {
        pushSystemMessage('warning', t('palette.systemMessage.parameterLocked', {
            name: selectedId.value,
            holder: claim.consumerId,
        }));
        return;
    }
    const next = getClone();
    next.parameters[selectedId.value] = val;
    commit(next);
}
// ── Substrate-claim reactivity for the parameter-value input ───────
//
// Mirrors the same pattern KnobSlider.vue uses: derive the relevant
// KnobId from the current selection, subscribe to claim changes
// once, and update a local ref the template binds to. The
// substrate's claim machinery is in-memory and not part of the
// reactive store, so a watcher / subscriber is the bridge that
// makes the template re-render on transitions.
const selectedParameterKnobId = computed(() => selectedType.value === 'parameter'
    ? `qeubo.${selectedId.value}` // KnobId brand mint: the `qeubo.<param>` template-literal id shape
    : null);
const selectedParameterClaim = ref(null);
watch(selectedParameterKnobId, (knobId) => {
    selectedParameterClaim.value = knobId ? currentClaim(knobId) : null;
}, { immediate: true });
const unsubscribeClaim = onClaimChange((event) => {
    if (selectedParameterKnobId.value === event.knobId) {
        selectedParameterClaim.value = event.next;
    }
});
onUnmounted(unsubscribeClaim);
const parameterValueDisabled = computed(() => selectedParameterClaim.value?.policy === 'hard');
const parameterValueDisabledTitle = computed(() => {
    if (!parameterValueDisabled.value)
        return '';
    const c = selectedParameterClaim.value;
    const reason = c.reason ? ` (${c.reason})` : '';
    return t('palette.tooltip.parameterLocked', {
        holder: c.consumerId,
        reason,
    });
});
// ── Parameter meta editing (qEUBO calibration) ─────────────────────
//
// Per dispatch v1.2 §3.7, the PaletteEditor is the curated home for
// parameter_meta editing. The toggle (qeubo_controlled) is the
// trigger that recreates the backend experiment over the new
// controlled set; range edits are local and do NOT recreate (the
// backend snapshots ranges at experiment-create time, so changing a
// range mid-experiment would silently misalign the GP). Users who
// edit a range while qeubo_controlled is checked can apply the new
// range by retoggling.
function getParamMeta(name) {
    return props.env.parameter_meta?.[name] ?? {};
}
function isRangeValid(meta) {
    const r = meta.range;
    return Array.isArray(r)
        && r.length === 2
        && Number.isFinite(r[0])
        && Number.isFinite(r[1])
        && r[0] < r[1];
}
const selectedParamMeta = computed(() => selectedType.value === 'parameter' ? getParamMeta(selectedId.value) : {});
const selectedRangeValid = computed(() => isRangeValid(selectedParamMeta.value));
function updateParamRange(name, side, raw) {
    const next = getClone();
    if (!next.parameter_meta)
        next.parameter_meta = {};
    const meta = { ...(next.parameter_meta[name] ?? {}) };
    const currentRange = meta.range ?? [NaN, NaN];
    const parsed = raw.trim() === '' ? NaN : Number(raw);
    const newRange = side === 'min'
        ? [parsed, currentRange[1]]
        : [currentRange[0], parsed];
    // Keep the range as-set even if invalid; validation happens at
    // qeubo_controlled gate. A partial range is preserved across input
    // events so the user doesn't lose half their typing.
    if (Number.isNaN(newRange[0]) && Number.isNaN(newRange[1])) {
        delete meta.range;
    }
    else {
        meta.range = newRange;
    }
    next.parameter_meta[name] = meta;
    commit(next);
}
async function setParamQeuboControlled(name, checked) {
    const next = getClone();
    if (!next.parameter_meta)
        next.parameter_meta = {};
    const meta = { ...(next.parameter_meta[name] ?? {}) };
    if (checked) {
        // Defensive: the checkbox is supposed to be disabled when range
        // is invalid. If it somehow fires anyway (programmatic change,
        // older UA), surface the error per ADR-0002 and bail.
        if (!isRangeValid(meta)) {
            pushSystemMessage('error', `PBO: parameter "${name}" needs a valid [min, max] range before it can be marked qeubo_controlled.`);
            return;
        }
        meta.qeubo_controlled = true;
    }
    else {
        delete meta.qeubo_controlled;
    }
    next.parameter_meta[name] = meta;
    commit(next);
    // Read the controlled set from the just-committed `next`, not from
    // props.env (Vue may not have re-rendered the prop yet). The
    // composable reads from store, but its read happens inside the
    // network request which fires after the commit's reactive update
    // has propagated.
    const controlled = Object.entries(next.parameter_meta)
        .filter(([_, m]) => m?.qeubo_controlled === true)
        .map(([k]) => k);
    try {
        if (controlled.length === 0) {
            await qeubo.abortExperiment();
            pushSystemMessage('info', 'PBO experiment dissolved (no controlled parameters).');
        }
        else {
            await qeubo.startNewExperiment(controlled);
            pushSystemMessage('info', t('palette.systemMessage.qeuboRecreated', { params: controlled.join(', ') }));
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        pushSystemMessage('error', t('palette.systemMessage.qeuboSyncFailed', { msg }));
    }
}
function addPalette() {
    const name = prompt(t('palette.prompt.paletteName'));
    if (!name)
        return;
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const next = getClone();
    next.palettes.push({
        id,
        name,
        delta_fn: symbolKeys.value[0] || '',
        delta_ordering: 'lower_is_worse',
        summary_fn: symbolKeys.value[0] || '',
        state_fns: {}
    });
    commit(next);
    select('palette', id);
}
function addStateFnToPalette(paletteId) {
    const name = prompt(t('palette.prompt.chartName'));
    if (!name)
        return;
    const next = getClone();
    const p = next.palettes.find(p => p.id === paletteId);
    if (p) {
        p.state_fns[name] = symbolKeys.value[0] || '';
        commit(next);
    }
}
function removeStateFnFromPalette(paletteId, chartName) {
    const next = getClone();
    const p = next.palettes.find(p => p.id === paletteId);
    if (p && p.state_fns[chartName]) {
        delete p.state_fns[chartName];
        commit(next);
    }
}
// Generic key parameter ties the value's type to the named field, so the
// keyed write typechecks without the historical `as any` erasure.
function updatePaletteField(paletteId, field, val) {
    const next = getClone();
    const p = next.palettes.find(p => p.id === paletteId);
    if (p) {
        p[field] = val;
        commit(next);
    }
}
function updatePaletteStateFn(paletteId, chartName, symRef) {
    const next = getClone();
    const p = next.palettes.find(p => p.id === paletteId);
    if (p) {
        p.state_fns[chartName] = symRef;
        commit(next);
    }
}
function deleteItem() {
    if (!selectedType.value || !selectedId.value)
        return;
    if (!confirm(t('palette.confirm.deleteItem', { type: selectedType.value, id: selectedId.value })))
        return;
    const next = getClone();
    if (selectedType.value === 'symbol')
        delete next.symbols[selectedId.value];
    if (selectedType.value === 'parameter')
        delete next.parameters[selectedId.value];
    if (selectedType.value === 'palette') {
        next.palettes = next.palettes.filter(p => p.id !== selectedId.value);
        if (next.activePaletteId === selectedId.value && next.palettes.length > 0) {
            next.activePaletteId = next.palettes[0].id;
        }
    }
    commit(next);
    selectedType.value = null;
    selectedId.value = '';
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
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-content']} */ ;
/** @type {__VLS_StyleScopedClasses['palette-form']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-content']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-select']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-label']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-label']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-label']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "palette-editor" },
});
/** @type {__VLS_StyleScopedClasses['palette-editor']} */ ;
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
(__VLS_ctx.$t('palette.sidebar.symbols'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.addSymbol) },
    ...{ class: "add-btn" },
});
/** @type {__VLS_StyleScopedClasses['add-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
    ...{ class: "item-list" },
});
/** @type {__VLS_StyleScopedClasses['item-list']} */ ;
for (const [key] of __VLS_vFor((__VLS_ctx.symbolKeys))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.select('symbol', key);
                // @ts-ignore
                [$t, addSymbol, symbolKeys, select,];
            } },
        key: (key),
        ...{ class: ({ active: __VLS_ctx.selectedType === 'symbol' && __VLS_ctx.selectedId === key }) },
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (key);
    // @ts-ignore
    [selectedType, selectedId,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section" },
});
/** @type {__VLS_StyleScopedClasses['section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section-header" },
});
/** @type {__VLS_StyleScopedClasses['section-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.$t('palette.sidebar.parameters'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.addParameter) },
    ...{ class: "add-btn" },
});
/** @type {__VLS_StyleScopedClasses['add-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
    ...{ class: "item-list" },
});
/** @type {__VLS_StyleScopedClasses['item-list']} */ ;
for (const [key] of __VLS_vFor((__VLS_ctx.paramKeys))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.select('parameter', key);
                // @ts-ignore
                [$t, select, addParameter, paramKeys,];
            } },
        key: (key),
        ...{ class: ({ active: __VLS_ctx.selectedType === 'parameter' && __VLS_ctx.selectedId === key }) },
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (key);
    // @ts-ignore
    [selectedType, selectedId,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section" },
});
/** @type {__VLS_StyleScopedClasses['section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section-header" },
});
/** @type {__VLS_StyleScopedClasses['section-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.$t('palette.sidebar.palettes'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.addPalette) },
    ...{ class: "add-btn" },
});
/** @type {__VLS_StyleScopedClasses['add-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
    ...{ class: "item-list" },
});
/** @type {__VLS_StyleScopedClasses['item-list']} */ ;
for (const [p] of __VLS_vFor((__VLS_ctx.env.palettes))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.select('palette', p.id);
                // @ts-ignore
                [$t, select, addPalette, env,];
            } },
        key: (p.id),
        ...{ class: ({ active: __VLS_ctx.selectedType === 'palette' && __VLS_ctx.selectedId === p.id }) },
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (p.name);
    if (__VLS_ctx.env.activePaletteId === p.id) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "active-badge" },
        });
        /** @type {__VLS_StyleScopedClasses['active-badge']} */ ;
        (__VLS_ctx.$t('palette.sidebar.activeBadge'));
    }
    // @ts-ignore
    [$t, selectedType, selectedId, env,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "detail-pane" },
});
/** @type {__VLS_StyleScopedClasses['detail-pane']} */ ;
if (!__VLS_ctx.selectedType) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
    (__VLS_ctx.$t('palette.detail.empty'));
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
        ...{ onClick: (__VLS_ctx.deleteItem) },
        ...{ class: "del-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['del-btn']} */ ;
    (__VLS_ctx.$t('palette.detail.delete'));
    if (__VLS_ctx.selectedType === 'symbol') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "editor-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['editor-wrap']} */ ;
        let __VLS_0;
        /** @ts-ignore @type { | typeof __VLS_components.Codemirror} */
        Codemirror;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.env.symbols[__VLS_ctx.selectedId]),
            extensions: (__VLS_ctx.extensions),
            ...{ style: ({ height: '100%', fontSize: '12px' }) },
        }));
        const __VLS_2 = __VLS_1({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.env.symbols[__VLS_ctx.selectedId]),
            extensions: (__VLS_ctx.extensions),
            ...{ style: ({ height: '100%', fontSize: '12px' }) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        let __VLS_5;
        const __VLS_6 = {
            ...{ 'update:modelValue': {} },
            'onUpdate:modelValue': (__VLS_ctx.updateSymbolValue),
        };
        var __VLS_3;
        var __VLS_4;
    }
    if (__VLS_ctx.selectedType === 'parameter') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-grid" },
        });
        /** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('palette.param.value'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onInput: ((e) => __VLS_ctx.updateParameterValue(Number(e.target.value))) },
            type: "number",
            step: "0.01",
            ...{ class: "dark-input" },
            value: (__VLS_ctx.env.parameters[__VLS_ctx.selectedId]),
            disabled: (__VLS_ctx.parameterValueDisabled),
            title: (__VLS_ctx.parameterValueDisabledTitle),
        });
        /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('palette.param.range'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "range-inputs" },
        });
        /** @type {__VLS_StyleScopedClasses['range-inputs']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onInput: ((e) => __VLS_ctx.updateParamRange(__VLS_ctx.selectedId, 'min', e.target.value)) },
            type: "number",
            step: "0.01",
            ...{ class: "dark-input range-half" },
            ...{ class: ({ invalid: !__VLS_ctx.selectedRangeValid && !!__VLS_ctx.selectedParamMeta.qeubo_controlled }) },
            placeholder: (__VLS_ctx.$t('palette.param.rangeMin')),
            value: (__VLS_ctx.selectedParamMeta.range?.[0] ?? ''),
        });
        /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        /** @type {__VLS_StyleScopedClasses['range-half']} */ ;
        /** @type {__VLS_StyleScopedClasses['invalid']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "range-sep" },
        });
        /** @type {__VLS_StyleScopedClasses['range-sep']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onInput: ((e) => __VLS_ctx.updateParamRange(__VLS_ctx.selectedId, 'max', e.target.value)) },
            type: "number",
            step: "0.01",
            ...{ class: "dark-input range-half" },
            ...{ class: ({ invalid: !__VLS_ctx.selectedRangeValid && !!__VLS_ctx.selectedParamMeta.qeubo_controlled }) },
            placeholder: (__VLS_ctx.$t('palette.param.rangeMax')),
            value: (__VLS_ctx.selectedParamMeta.range?.[1] ?? ''),
        });
        /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        /** @type {__VLS_StyleScopedClasses['range-half']} */ ;
        /** @type {__VLS_StyleScopedClasses['invalid']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('palette.param.qeuboLabel'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "qeubo-control" },
        });
        /** @type {__VLS_StyleScopedClasses['qeubo-control']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "checkbox-label" },
        });
        /** @type {__VLS_StyleScopedClasses['checkbox-label']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: ((e) => __VLS_ctx.setParamQeuboControlled(__VLS_ctx.selectedId, e.target.checked)) },
            type: "checkbox",
            checked: (!!__VLS_ctx.selectedParamMeta.qeubo_controlled),
            disabled: (!__VLS_ctx.selectedRangeValid && !__VLS_ctx.selectedParamMeta.qeubo_controlled),
            title: (__VLS_ctx.selectedRangeValid ? __VLS_ctx.$t('palette.param.qeuboTooltipReady') : __VLS_ctx.$t('palette.param.qeuboTooltipNeedRange')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('palette.param.qeuboCheckboxLabel'));
        if (!__VLS_ctx.selectedRangeValid && !!__VLS_ctx.selectedParamMeta.qeubo_controlled) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "validation-error" },
            });
            /** @type {__VLS_StyleScopedClasses['validation-error']} */ ;
            (__VLS_ctx.$t('palette.param.qeuboRangeInvalidActive'));
        }
        else if (!__VLS_ctx.selectedRangeValid) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "validation-hint" },
            });
            /** @type {__VLS_StyleScopedClasses['validation-hint']} */ ;
            (__VLS_ctx.$t('palette.param.qeuboRangeInvalidPassive'));
        }
    }
    if (__VLS_ctx.selectedType === 'palette') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "palette-form" },
        });
        /** @type {__VLS_StyleScopedClasses['palette-form']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-grid" },
        });
        /** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('palette.field.name'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onInput: ((e) => __VLS_ctx.updatePaletteField(__VLS_ctx.selectedId, 'name', e.target.value)) },
            type: "text",
            ...{ class: "dark-input" },
            value: (__VLS_ctx.env.palettes.find(p => p.id === __VLS_ctx.selectedId)?.name),
        });
        /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('palette.field.deltaFn'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            ...{ onChange: ((e) => __VLS_ctx.updatePaletteField(__VLS_ctx.selectedId, 'delta_fn', e.target.value)) },
            ...{ class: "dark-select" },
            value: (__VLS_ctx.env.palettes.find(p => p.id === __VLS_ctx.selectedId)?.delta_fn),
        });
        /** @type {__VLS_StyleScopedClasses['dark-select']} */ ;
        for (const [sym] of __VLS_vFor((__VLS_ctx.symbolKeys))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (sym),
                value: (sym),
            });
            (sym);
            // @ts-ignore
            [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, symbolKeys, selectedType, selectedType, selectedType, selectedType, selectedId, selectedId, selectedId, selectedId, selectedId, selectedId, selectedId, selectedId, selectedId, selectedId, env, env, env, env, deleteItem, extensions, updateSymbolValue, updateParameterValue, parameterValueDisabled, parameterValueDisabledTitle, updateParamRange, updateParamRange, selectedRangeValid, selectedRangeValid, selectedRangeValid, selectedRangeValid, selectedRangeValid, selectedRangeValid, selectedParamMeta, selectedParamMeta, selectedParamMeta, selectedParamMeta, selectedParamMeta, selectedParamMeta, selectedParamMeta, setParamQeuboControlled, updatePaletteField, updatePaletteField,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('palette.field.deltaOrdering'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            ...{ onChange: ((e) => __VLS_ctx.updatePaletteField(__VLS_ctx.selectedId, 'delta_ordering', e.target.value)) },
            ...{ class: "dark-select" },
            value: (__VLS_ctx.env.palettes.find(p => p.id === __VLS_ctx.selectedId)?.delta_ordering),
        });
        /** @type {__VLS_StyleScopedClasses['dark-select']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "lower_is_worse",
        });
        (__VLS_ctx.$t('palette.option.lowerIsWorse'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "higher_is_worse",
        });
        (__VLS_ctx.$t('palette.option.higherIsWorse'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('palette.field.summaryFn'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            ...{ onChange: ((e) => __VLS_ctx.updatePaletteField(__VLS_ctx.selectedId, 'summary_fn', e.target.value)) },
            ...{ class: "dark-select" },
            value: (__VLS_ctx.env.palettes.find(p => p.id === __VLS_ctx.selectedId)?.summary_fn),
        });
        /** @type {__VLS_StyleScopedClasses['dark-select']} */ ;
        for (const [sym] of __VLS_vFor((__VLS_ctx.symbolKeys))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (sym),
                value: (sym),
            });
            (sym);
            // @ts-ignore
            [$t, $t, $t, $t, symbolKeys, selectedId, selectedId, selectedId, selectedId, env, env, updatePaletteField, updatePaletteField,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "state-fns-section" },
        });
        /** @type {__VLS_StyleScopedClasses['state-fns-section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section-header" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['section-header']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('palette.field.charts'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.selectedType))
                        return;
                    if (!(__VLS_ctx.selectedType === 'palette'))
                        return;
                    __VLS_ctx.addStateFnToPalette(__VLS_ctx.selectedId);
                    // @ts-ignore
                    [$t, selectedId, addStateFnToPalette,];
                } },
            ...{ class: "add-btn" },
        });
        /** @type {__VLS_StyleScopedClasses['add-btn']} */ ;
        (__VLS_ctx.$t('palette.field.addChart'));
        for (const [symRef, chartName] of __VLS_vFor((__VLS_ctx.env.palettes.find(p => p.id === __VLS_ctx.selectedId)?.state_fns))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "state-fn-row" },
                key: (chartName),
            });
            /** @type {__VLS_StyleScopedClasses['state-fn-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "chart-name" },
            });
            /** @type {__VLS_StyleScopedClasses['chart-name']} */ ;
            (chartName);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "arrow" },
            });
            /** @type {__VLS_StyleScopedClasses['arrow']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ onChange: ((e) => __VLS_ctx.updatePaletteStateFn(__VLS_ctx.selectedId, chartName /* v-for key over state_fns is string|number; chart names are strings */, e.target.value)) },
                ...{ class: "dark-select flex-1" },
                value: (symRef),
            });
            /** @type {__VLS_StyleScopedClasses['dark-select']} */ ;
            /** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
            for (const [sym] of __VLS_vFor((__VLS_ctx.symbolKeys))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (sym),
                    value: (sym),
                });
                (sym);
                // @ts-ignore
                [$t, symbolKeys, selectedId, selectedId, env, updatePaletteStateFn,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.selectedType))
                            return;
                        if (!(__VLS_ctx.selectedType === 'palette'))
                            return;
                        __VLS_ctx.removeStateFnFromPalette(__VLS_ctx.selectedId, chartName /* v-for key over state_fns is string|number; chart names are strings */);
                        // @ts-ignore
                        [selectedId, removeStateFnFromPalette,];
                    } },
                ...{ class: "del-btn-sm" },
            });
            /** @type {__VLS_StyleScopedClasses['del-btn-sm']} */ ;
            // @ts-ignore
            [];
        }
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
