/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * src/components/modals/HyperparamPromptModal.vue
 * Bind-time prompt for a deck's hyperparameter harness. The caller
 * invokes `open(decls)` and awaits a `Record<name, value>` or `null`
 * on cancel. Per-field validation gates the submit button — values
 * must satisfy the declaration's type, range (numbers), and options
 * (enum / constrained string).
 *
 * License: Public Domain (The Unlicense).
 */
import { ref, computed } from 'vue';
const isOpen = ref(false);
const declarations = ref([]);
// Per-name raw input strings; numbers are parsed at submit time so
// the user can type freely. Pre-populated from `default` on open.
const inputs = ref({});
let resolvePromise = null;
const __VLS_exposed = {
    open(decls) {
        declarations.value = decls;
        const seeded = {};
        for (const d of decls)
            seeded[d.name] = String(d.default);
        inputs.value = seeded;
        isOpen.value = true;
        return new Promise(resolve => { resolvePromise = resolve; });
    }
};
defineExpose(__VLS_exposed);
function fieldError(decl, raw) {
    if (decl.type === 'number') {
        if (raw.trim() === '')
            return 'required';
        const n = Number(raw);
        if (!Number.isFinite(n))
            return 'not a number';
        if (decl.range) {
            const [lo, hi] = decl.range;
            if (Number.isFinite(lo) && n < lo)
                return `below ${lo}`;
            if (Number.isFinite(hi) && n > hi)
                return `above ${hi}`;
        }
        return null;
    }
    if (decl.type === 'enum') {
        if (!decl.options.includes(raw))
            return 'not in options';
        return null;
    }
    // 'string': options is an optional constraint; empty string allowed.
    if (decl.options && decl.options.length > 0 && !decl.options.includes(raw)) {
        return 'not in options';
    }
    return null;
}
const allValid = computed(() => declarations.value.every(d => fieldError(d, inputs.value[d.name] ?? '') === null));
function labelFor(d) {
    return d.label ?? d.name;
}
function submit() {
    if (!allValid.value)
        return;
    const out = {};
    for (const d of declarations.value) {
        const raw = inputs.value[d.name] ?? '';
        out[d.name] = d.type === 'number' ? Number(raw) : raw;
    }
    isOpen.value = false;
    resolvePromise?.(out);
    resolvePromise = null;
}
function cancel() {
    isOpen.value = false;
    resolvePromise?.(null);
    resolvePromise = null;
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['field-row']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-submit']} */ ;
if (__VLS_ctx.isOpen) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onMousedown: (__VLS_ctx.cancel) },
        ...{ class: "modal-backdrop" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-content" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-header" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('harnessPrompt.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-body" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "lede" },
    });
    /** @type {__VLS_StyleScopedClasses['lede']} */ ;
    (__VLS_ctx.$t('harnessPrompt.lede'));
    for (const [d] of __VLS_vFor((__VLS_ctx.declarations))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (d.name),
            ...{ class: "field-row" },
        });
        /** @type {__VLS_StyleScopedClasses['field-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: (`hpv-${d.name}`),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "field-label" },
        });
        /** @type {__VLS_StyleScopedClasses['field-label']} */ ;
        (__VLS_ctx.labelFor(d));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "field-name" },
        });
        /** @type {__VLS_StyleScopedClasses['field-name']} */ ;
        (d.name);
        if (d.type === 'enum') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                id: (`hpv-${d.name}`),
                ...{ class: "dark-input" },
                value: (__VLS_ctx.inputs[d.name]),
            });
            /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
            for (const [opt] of __VLS_vFor((d.options))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (opt),
                    value: (opt),
                });
                (opt);
                // @ts-ignore
                [isOpen, cancel, $t, $t, declarations, labelFor, inputs,];
            }
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                id: (`hpv-${d.name}`),
                type: "text",
                ...{ class: "dark-input" },
                ...{ class: ({ 'invalid': __VLS_ctx.fieldError(d, __VLS_ctx.inputs[d.name] ?? '') !== null }) },
                value: (__VLS_ctx.inputs[d.name]),
            });
            /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
            /** @type {__VLS_StyleScopedClasses['invalid']} */ ;
        }
        if (__VLS_ctx.fieldError(d, __VLS_ctx.inputs[d.name] ?? '')) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "field-error" },
            });
            /** @type {__VLS_StyleScopedClasses['field-error']} */ ;
            (__VLS_ctx.fieldError(d, __VLS_ctx.inputs[d.name] ?? ''));
        }
        // @ts-ignore
        [inputs, inputs, inputs, inputs, fieldError, fieldError, fieldError,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-footer" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-footer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.cancel) },
        ...{ class: "btn-cancel" },
    });
    /** @type {__VLS_StyleScopedClasses['btn-cancel']} */ ;
    (__VLS_ctx.$t('harnessPrompt.button.cancel'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.submit) },
        ...{ class: "btn-submit" },
        disabled: (!__VLS_ctx.allValid),
    });
    /** @type {__VLS_StyleScopedClasses['btn-submit']} */ ;
    (__VLS_ctx.$t('harnessPrompt.button.run'));
}
// @ts-ignore
[cancel, $t, $t, submit, allValid,];
const __VLS_export = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
});
export default {};
