/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, computed } from 'vue';
import { SUPPORTED_LOCALES } from '../../i18n/locales';
import { WINRATE_FRAMINGS } from '../../engine/katago/types';
import { BUNDLE_COMPRESSION_SCHEMES } from '../../types';
const props = defineProps();
const emit = defineEmits(['update']);
const newKeyName = ref('');
// Registry keys are object property names, hence strings. Iterating
// `registry` directly with `v-for="(value, key) in registry"` types
// `key` as `string | number` (Vue's object-v-for key type), forcing a
// `key as string` cast at every helper call in the template. Deriving
// the entry list here keys the value pairs with the key typed `string`
// at the single `Object.entries` seam, removing that whole family of
// template casts. Values stay `any` (the `registry` prop is already
// `any` — this is a generic registry editor, not a typed-shape editor),
// so no narrowing cast is introduced at the value bindings either.
const entries = computed(() => Object.entries(props.registry ?? {}));
// --- Structural Rules ---
// Define which parts of the registry allow key additions/deletions.
// For everything else, the structure is "Program-Defined" and locked.
const isDynamicNode = computed(() => {
    if (!props.path)
        return false;
    const pathStr = props.path.join('.');
    return (pathStr.endsWith('symbols') ||
        pathStr.endsWith('state_fns') ||
        pathStr.endsWith('bindings') ||
        pathStr.endsWith('parameters') ||
        // KataGo's `overrideSettings` is an open-ended namespace: the
        // accepted-key set is engine-version-dependent and the user
        // routinely adds keys beyond the default seed (e.g.
        // `rootPolicyTemperature`, `analysisPVLen`). Treating it as
        // dynamic surfaces the add/remove affordances so the user
        // doesn't have to source-edit defaults.ts to extend the dict.
        pathStr.endsWith('overrideSettings'));
});
function getPath(key) {
    return [...(props.path || []), key];
}
function isObject(val) {
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
const PATH_ENUMS = {
    // settings root (store.profile.settings)
    'appearance.theme': ['dark', 'cluster'],
    'appearance.miniBoardRenderer': ['svg', 'canvas'],
    'appearance.locale': [...SUPPORTED_LOCALES],
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
    'analysisLayout': ['horizontal', 'vertical'],
    'pvAnimation.mode': ['instant', 'sequential', 'window'],
    'pvAnimation.annotation': ['none', 'from1', 'fromCurrent'],
    'qeuboToolbarView': ['applied', 'A', 'B'],
    'boardVariations': ['off', 'circles', 'letters'],
};
function enumOptions(key) {
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
const PATH_TOOLTIPS = {
    'engine.katago.overrideSettings.reportAnalysisWinratesAs': "Only 'WHITE' is fully supported. 'BLACK' and 'SIDETOMOVE' will " +
        'not be supported in the near future unless another contributor ' +
        'steps up — raw response fields are normalised to WHITE on receipt, ' +
        'but palette enrichment runs in the wire framing on the proxy side, ' +
        'so charts using the seeded `winrate` / `score_lead` symbols will ' +
        'display in the wire framing rather than canonical WHITE.',
    'engine.katago.analysisAutoSave': 'Experimental — opt-in. When on, the SPA PUTs the per-board analysis ' +
        "bundle to the server after every authoritative analysis packet " +
        '(debounced ~2 s). Continuous saving consumes bandwidth and counts ' +
        "against your per-user storage quota; a quota or per-bundle-cap " +
        'failure pauses auto-save for the affected board until a manual Save ' +
        'succeeds or you toggle this leaf off and back on. Requires ' +
        'analysisStorageEnabled to be true; flipping the parent off ' +
        'implicitly disables auto-save.',
    'engine.katago.bundleCompressionScheme': "Wire-format choice for analysis-bundle persistence. " +
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
function tooltipText(key) {
    return PATH_TOOLTIPS[[...(props.path ?? []), key].join('.')];
}
function getFieldType(key, value) {
    if (typeof value !== 'string')
        return 'scalar';
    if (enumOptions(key))
        return 'enum';
    const parentKey = props.path?.[props.path.length - 1];
    if (parentKey === 'symbols')
        return 'expression';
    if (parentKey === 'bindings' || parentKey === 'state_fns')
        return 'symbol-ref';
    return value.length > 40 ? 'expression' : 'scalar';
}
// --- Action Handlers ---
function handleUpdate(key, value) {
    emit('update', { path: getPath(key), value });
}
function restoreDefault(key) {
    if (props.defaults && props.defaults[key] !== undefined) {
        handleUpdate(key, props.defaults[key]);
    }
}
function deleteKey(key) {
    if (!isDynamicNode.value)
        return; // Guard
    const newObj = { ...props.registry };
    delete newObj[key];
    emit('update', { path: props.path || [], value: newObj });
}
function addKey() {
    if (!newKeyName.value || !isDynamicNode.value)
        return;
    const newObj = { ...props.registry, [newKeyName.value]: "" };
    emit('update', { path: props.path || [], value: newObj });
    newKeyName.value = '';
}
// Check if a value has been modified from its original default
function isModified(key, value) {
    if (!props.defaults)
        return false;
    return JSON.stringify(value) !== JSON.stringify(props.defaults[key]);
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
/** @type {__VLS_StyleScopedClasses['registry-leaf']} */ ;
/** @type {__VLS_StyleScopedClasses['registry-leaf']} */ ;
/** @type {__VLS_StyleScopedClasses['registry-leaf']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "registry-editor" },
    ...{ class: ({ 'registry-root': !__VLS_ctx.path }) },
});
/** @type {__VLS_StyleScopedClasses['registry-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['registry-root']} */ ;
for (const [[key, value]] of __VLS_vFor((__VLS_ctx.entries))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (key),
        ...{ class: "registry-row" },
    });
    /** @type {__VLS_StyleScopedClasses['registry-row']} */ ;
    if (__VLS_ctx.isObject(value)) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "registry-branch" },
        });
        /** @type {__VLS_StyleScopedClasses['registry-branch']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "branch-header" },
        });
        /** @type {__VLS_StyleScopedClasses['branch-header']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "label-group" },
        });
        /** @type {__VLS_StyleScopedClasses['label-group']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "branch-label" },
        });
        /** @type {__VLS_StyleScopedClasses['branch-label']} */ ;
        (key);
        if (__VLS_ctx.isModified(key, value)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "modified-dot" },
            });
            /** @type {__VLS_StyleScopedClasses['modified-dot']} */ ;
        }
        if (__VLS_ctx.tooltipText(key)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "tooltip-hint" },
                role: "img",
                'aria-label': (__VLS_ctx.tooltipText(key)),
                title: (__VLS_ctx.tooltipText(key)),
            });
            /** @type {__VLS_StyleScopedClasses['tooltip-hint']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "action-group" },
        });
        /** @type {__VLS_StyleScopedClasses['action-group']} */ ;
        if (__VLS_ctx.isModified(key, value)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.isObject(value)))
                            return;
                        if (!(__VLS_ctx.isModified(key, value)))
                            return;
                        __VLS_ctx.restoreDefault(key);
                        // @ts-ignore
                        [path, entries, isObject, isModified, isModified, tooltipText, tooltipText, tooltipText, restoreDefault,];
                    } },
                ...{ class: "restore-btn" },
                title: (__VLS_ctx.$t('registry.restoreBranchDefaults')),
            });
            /** @type {__VLS_StyleScopedClasses['restore-btn']} */ ;
        }
        if (__VLS_ctx.isDynamicNode) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.isObject(value)))
                            return;
                        if (!(__VLS_ctx.isDynamicNode))
                            return;
                        __VLS_ctx.deleteKey(key);
                        // @ts-ignore
                        [$t, isDynamicNode, deleteKey,];
                    } },
                ...{ class: "delete-btn" },
            });
            /** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "branch-content" },
        });
        /** @type {__VLS_StyleScopedClasses['branch-content']} */ ;
        let __VLS_0;
        /** @ts-ignore @type { | typeof __VLS_components.RegistryEditor} */
        RegistryEditor;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            ...{ 'onUpdate': {} },
            registry: (value),
            defaults: (__VLS_ctx.defaults ? __VLS_ctx.defaults[key] : undefined),
            path: (__VLS_ctx.getPath(key)),
        }));
        const __VLS_2 = __VLS_1({
            ...{ 'onUpdate': {} },
            registry: (value),
            defaults: (__VLS_ctx.defaults ? __VLS_ctx.defaults[key] : undefined),
            path: (__VLS_ctx.getPath(key)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        let __VLS_5;
        const __VLS_6 = {
            ...{ update: {} },
            onUpdate: (e => __VLS_ctx.emit('update', e)),
        };
        var __VLS_3;
        var __VLS_4;
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "registry-leaf" },
            ...{ class: (__VLS_ctx.getFieldType(key, value)) },
        });
        /** @type {__VLS_StyleScopedClasses['registry-leaf']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "leaf-header" },
        });
        /** @type {__VLS_StyleScopedClasses['leaf-header']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "label-group" },
        });
        /** @type {__VLS_StyleScopedClasses['label-group']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "leaf-label" },
        });
        /** @type {__VLS_StyleScopedClasses['leaf-label']} */ ;
        (key);
        if (__VLS_ctx.isModified(key, value)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "modified-dot" },
            });
            /** @type {__VLS_StyleScopedClasses['modified-dot']} */ ;
        }
        if (__VLS_ctx.tooltipText(key)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "tooltip-hint" },
                role: "img",
                'aria-label': (__VLS_ctx.tooltipText(key)),
                title: (__VLS_ctx.tooltipText(key)),
            });
            /** @type {__VLS_StyleScopedClasses['tooltip-hint']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "action-group" },
        });
        /** @type {__VLS_StyleScopedClasses['action-group']} */ ;
        if (__VLS_ctx.isModified(key, value)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.isObject(value)))
                            return;
                        if (!(__VLS_ctx.isModified(key, value)))
                            return;
                        __VLS_ctx.restoreDefault(key);
                        // @ts-ignore
                        [isModified, isModified, tooltipText, tooltipText, tooltipText, restoreDefault, defaults, defaults, getPath, emit, getFieldType,];
                    } },
                ...{ class: "restore-btn" },
                title: (__VLS_ctx.$t('registry.restoreDefault')),
            });
            /** @type {__VLS_StyleScopedClasses['restore-btn']} */ ;
        }
        if (__VLS_ctx.isDynamicNode) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.isObject(value)))
                            return;
                        if (!(__VLS_ctx.isDynamicNode))
                            return;
                        __VLS_ctx.deleteKey(key);
                        // @ts-ignore
                        [$t, isDynamicNode, deleteKey,];
                    } },
                ...{ class: "delete-btn" },
            });
            /** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "leaf-input-container" },
        });
        /** @type {__VLS_StyleScopedClasses['leaf-input-container']} */ ;
        if (__VLS_ctx.getFieldType(key, value) === 'expression') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.textarea, __VLS_intrinsics.textarea)({
                ...{ onInput: ((e) => __VLS_ctx.handleUpdate(key, e.target.value)) },
                ...{ class: "dark-input expression-input" },
                value: (value),
                spellcheck: "false",
            });
            /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
            /** @type {__VLS_StyleScopedClasses['expression-input']} */ ;
        }
        else if (__VLS_ctx.getFieldType(key, value) === 'symbol-ref') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "symbol-ref-box" },
            });
            /** @type {__VLS_StyleScopedClasses['symbol-ref-box']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ref-icon" },
            });
            /** @type {__VLS_StyleScopedClasses['ref-icon']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onInput: ((e) => __VLS_ctx.handleUpdate(key, e.target.value)) },
                type: "text",
                ...{ class: "dark-input scalar-input ref-input" },
                value: (value),
            });
            /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
            /** @type {__VLS_StyleScopedClasses['scalar-input']} */ ;
            /** @type {__VLS_StyleScopedClasses['ref-input']} */ ;
        }
        else if (typeof value === 'boolean') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onChange: ((e) => __VLS_ctx.handleUpdate(key, e.target.checked)) },
                type: "checkbox",
                checked: (value),
            });
        }
        else if (__VLS_ctx.getFieldType(key, value) === 'enum') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ onChange: ((e) => __VLS_ctx.handleUpdate(key, e.target.value)) },
                ...{ class: "dark-input scalar-input" },
                value: (value),
            });
            /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
            /** @type {__VLS_StyleScopedClasses['scalar-input']} */ ;
            for (const [opt] of __VLS_vFor((__VLS_ctx.enumOptions(key)))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (opt),
                    value: (opt),
                });
                (opt);
                // @ts-ignore
                [getFieldType, getFieldType, getFieldType, handleUpdate, handleUpdate, handleUpdate, handleUpdate, enumOptions,];
            }
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onInput: ((e) => __VLS_ctx.handleUpdate(key, typeof value === 'number' ? Number(e.target.value) : e.target.value)) },
                type: (typeof value === 'number' ? 'number' : 'text'),
                ...{ class: "dark-input scalar-input" },
                value: (value),
            });
            /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
            /** @type {__VLS_StyleScopedClasses['scalar-input']} */ ;
        }
    }
    // @ts-ignore
    [handleUpdate,];
}
if (__VLS_ctx.isDynamicNode) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "add-key-row" },
    });
    /** @type {__VLS_StyleScopedClasses['add-key-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onKeyup: (__VLS_ctx.addKey) },
        placeholder: (__VLS_ctx.$t('registry.newSymbolPlaceholder')),
        ...{ class: "dark-input scalar-input add-input" },
    });
    (__VLS_ctx.newKeyName);
    /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
    /** @type {__VLS_StyleScopedClasses['scalar-input']} */ ;
    /** @type {__VLS_StyleScopedClasses['add-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.addKey) },
        ...{ class: "add-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['add-btn']} */ ;
    (__VLS_ctx.$t('registry.addSymbol'));
}
// @ts-ignore
[$t, $t, isDynamicNode, addKey, addKey, newKeyName,];
const __VLS_export = (await import('vue')).defineComponent({
    emits: {},
    __typeProps: {},
});
export default {};
