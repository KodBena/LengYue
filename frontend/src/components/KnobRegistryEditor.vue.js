/// <reference types="../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * Cross-domain knob-registry editor — the originating riddle's
 * deliverable for knob-registry Phase 3b. Lists every scalar knob
 * (`inputs.length === 1`) in `store.profile.settings.knobs`,
 * categorised by `KnobDecl.domain`, rendered with `KnobSlider.vue`.
 *
 * The editor is a *view* into the registry — it doesn't own
 * decls, doesn't enforce policy, doesn't perform writes itself.
 * Each `KnobSlider` reads and writes through the substrate,
 * which polices claim state. Adding a new scalar knob (Phase 6's
 * promotion sweep) requires no change here — the editor picks
 * up new entries on the next render.
 *
 * Vector knobs are deliberately filtered out — the plan §6's
 * widget dispatch reserves the slider primitive for scalars. A
 * future `KnobGamutPicker.vue` / `KnobTwoDPad.vue` /
 * `KnobMatrixEditor.vue` will render the vector knobs through
 * the same dispatch policy; until then, vector knobs (if any are
 * declared) simply don't appear in this editor.
 *
 * Band 1 per ADR-0003 — no Go vocabulary, no game-tree coupling.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { store } from '../store';
import KnobSlider from './knobs/KnobSlider.vue';
const { t } = useI18n();
const grouped = computed(() => {
    const buckets = new Map();
    for (const [key, decl] of Object.entries(store.profile.settings.knobs)) {
        // Scalar-only — see file header. A vector knob declared in the
        // registry simply doesn't appear here.
        if (decl.inputs.length !== 1)
            continue;
        const bucket = buckets.get(decl.domain) ?? [];
        bucket.push({ id: key, decl }); // re-brand: the knobs registry is keyed by KnobId; Object.entries widens the key to string
        buckets.set(decl.domain, bucket);
    }
    // Sort each bucket by ascending priority (undefined sorts last so
    // a freshly-added decl without an authored priority sits below the
    // known set rather than at an arbitrary position). The toolbar
    // popover applies the same ordering for consistency.
    for (const entries of buckets.values()) {
        entries.sort((a, b) => priorityKey(a.decl) - priorityKey(b.decl));
    }
    return Array.from(buckets.entries()).map(([domain, entries]) => ({
        domain,
        entries,
    }));
});
function priorityKey(decl) {
    return decl.priority ?? Number.POSITIVE_INFINITY;
}
function domainLabel(domain) {
    // i18n keys colocated with the editor; falls back to the raw
    // domain string so a freshly-added domain renders sensibly
    // until its catalog entry lands.
    const key = `knobRegistry.domain.${domain}`;
    const translated = t(key);
    return translated === key ? domain : translated;
}
const isEmpty = computed(() => grouped.value.length === 0);
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "knob-registry-editor" },
});
/** @type {__VLS_StyleScopedClasses['knob-registry-editor']} */ ;
if (__VLS_ctx.isEmpty) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "knob-registry-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['knob-registry-empty']} */ ;
    (__VLS_ctx.$t('knobRegistry.empty'));
}
for (const [group] of __VLS_vFor((__VLS_ctx.grouped))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (group.domain),
        ...{ class: "knob-registry-domain" },
    });
    /** @type {__VLS_StyleScopedClasses['knob-registry-domain']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h4, __VLS_intrinsics.h4)({
        ...{ class: "knob-registry-domain-label" },
    });
    /** @type {__VLS_StyleScopedClasses['knob-registry-domain-label']} */ ;
    (__VLS_ctx.domainLabel(group.domain));
    for (const [entry] of __VLS_vFor((group.entries))) {
        const __VLS_0 = KnobSlider;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            key: (entry.id),
            knobId: (entry.id),
        }));
        const __VLS_2 = __VLS_1({
            key: (entry.id),
            knobId: (entry.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        // @ts-ignore
        [isEmpty, $t, grouped, domainLabel,];
    }
    // @ts-ignore
    [];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
