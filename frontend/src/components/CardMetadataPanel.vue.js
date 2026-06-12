/// <reference types="../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { store } from '../store';
import { INTERACTION_DISMISS_DELAY_MS } from '../lib/timing';
const { t } = useI18n();
const props = defineProps();
const emit = defineEmits();
// Collapsible — expanded by default so the panel is immediately
// useful when a card is active; the chevron lets the user
// collapse if the chrome competes for vertical space.
const expanded = ref(true);
// Defensive accessor: persisted ReviewCard blobs from before the
// arc-1 tags-on-read shipped don't carry a `tags` array (the
// SyncService snapshotted them pre-ACL). Coerce to `[]` on read
// so the panel renders rather than crashing on `[...undefined]`.
// The schema-version migration handles the durable fix at
// hydrate time; this guard is the per-render belt to the
// migration's suspenders.
function cardTags(c) {
    return c.tags ?? [];
}
// Local edit state mirrors `props.card`. Synced via watch when
// the card changes (next-card transition, post-save echo).
const localTags = ref([...cardTags(props.card)]);
const tagInput = ref('');
const showTagSuggestions = ref(false);
const localNumMoves = ref(props.card.numMoves);
const localGamma = ref(props.card.gamma);
const localDefaultVisits = ref(props.card.defaultVisits);
// Inline opt-in surfacing when `numMoves` is dirty. Stays
// false on every card-change so the destructive default is
// off.
const resetPriorOnSave = ref(false);
watch(() => props.card, (c) => {
    localTags.value = [...cardTags(c)];
    tagInput.value = '';
    localNumMoves.value = c.numMoves;
    localGamma.value = c.gamma;
    localDefaultVisits.value = c.defaultVisits;
    resetPriorOnSave.value = false;
});
const numMovesDirty = computed(() => localNumMoves.value !== props.card.numMoves);
// Tag-autocomplete suggestions: known tags partial-matched by
// the current input, minus those already attached. Cap at 8 to
// match `MintCardModal`'s convention.
const tagSuggestions = computed(() => {
    const q = tagInput.value.trim().toLowerCase();
    if (!q)
        return [];
    return store.knownTags
        .filter(s => s.toLowerCase().includes(q) && !localTags.value.includes(s))
        .slice(0, 8);
});
function tagsEqual(a, b) {
    if (a.length !== b.length)
        return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.every((v, i) => v === sb[i]);
}
function commitTags() {
    if (tagsEqual(localTags.value, cardTags(props.card)))
        return;
    emit('patch', { tags: [...localTags.value] });
}
function addTag(tag) {
    const clean = tag.trim().toLowerCase();
    if (!clean || localTags.value.includes(clean))
        return;
    localTags.value.push(clean);
    tagInput.value = '';
    showTagSuggestions.value = false;
    commitTags();
}
function removeTag(idx) {
    localTags.value.splice(idx, 1);
    commitTags();
}
function handleTagKeydown(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(tagInput.value);
    }
    else if (e.key === 'Backspace' && tagInput.value === '' && localTags.value.length) {
        localTags.value.pop();
        commitTags();
    }
    else if (e.key === 'Escape') {
        showTagSuggestions.value = false;
    }
    else {
        showTagSuggestions.value = true;
    }
}
// Why the delayed hide: a click on a suggestion <li> needs the
// element to still be in the DOM when its mousedown handler
// fires; the @blur on the input would otherwise hide the list
// before mousedown lands. Uses the shared interaction-dismiss
// grace from the timing catalog (`lib/timing`).
function hideTagSuggestionsSoon() {
    setTimeout(() => { showTagSuggestions.value = false; }, INTERACTION_DISMISS_DELAY_MS);
}
function commitNumMoves() {
    if (!numMovesDirty.value) {
        resetPriorOnSave.value = false;
        return;
    }
    if (!Number.isInteger(localNumMoves.value) || localNumMoves.value <= 0) {
        // Local validation: revert. Backend would 422 on a
        // non-positive int anyway; revert here avoids the wire
        // round-trip for an obvious typo.
        localNumMoves.value = props.card.numMoves;
        return;
    }
    const patch = {
        numMoves: localNumMoves.value,
        ...(resetPriorOnSave.value ? { resetPrior: true } : {}),
    };
    emit('patch', patch);
    resetPriorOnSave.value = false;
}
function commitGamma() {
    if (localGamma.value === props.card.gamma)
        return;
    if (!(localGamma.value > 0 && localGamma.value < 1)) {
        localGamma.value = props.card.gamma;
        return;
    }
    emit('patch', { gradingParameterData: { gamma: localGamma.value } });
}
function commitDefaultVisits() {
    if (localDefaultVisits.value === props.card.defaultVisits)
        return;
    if (!Number.isInteger(localDefaultVisits.value) || localDefaultVisits.value <= 0) {
        localDefaultVisits.value = props.card.defaultVisits;
        return;
    }
    emit('patch', { gradingParameterData: { default_visits: localDefaultVisits.value } });
}
function toggleSuspended() {
    emit('patch', { suspended: !props.card.suspended });
}
function resetPriorStandalone() {
    // window.confirm() is the minimal-touch destructive-confirm
    // affordance; if the panel grows enough to warrant a custom
    // modal, that's a follow-up.
    if (!window.confirm(t('cardMetadata.resetPriorStandaloneConfirm')))
        return;
    emit('patch', { resetPrior: true });
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
/** @type {__VLS_StyleScopedClasses['card-metadata-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['num-input']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-suggestions']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-suggestions']} */ ;
/** @type {__VLS_StyleScopedClasses['reset-prompt']} */ ;
/** @type {__VLS_StyleScopedClasses['action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['action-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "card-metadata-panel" },
    ...{ class: ({ disabled: __VLS_ctx.disabled }) },
});
/** @type {__VLS_StyleScopedClasses['card-metadata-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['disabled']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.expanded = !__VLS_ctx.expanded;
            // @ts-ignore
            [disabled, expanded, expanded,];
        } },
    ...{ class: "panel-header" },
});
/** @type {__VLS_StyleScopedClasses['panel-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "header-label" },
});
/** @type {__VLS_StyleScopedClasses['header-label']} */ ;
(__VLS_ctx.$t('cardMetadata.titleWithId', { cardId: __VLS_ctx.card.id }));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "chevron" },
});
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
(__VLS_ctx.expanded ? '▼' : '▶');
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "panel-body" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.expanded) }, null, null);
/** @type {__VLS_StyleScopedClasses['panel-body']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "field" },
});
/** @type {__VLS_StyleScopedClasses['field']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
(__VLS_ctx.$t('cardMetadata.tagsLabel'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "tags-input-wrapper" },
});
/** @type {__VLS_StyleScopedClasses['tags-input-wrapper']} */ ;
for (const [tag, i] of __VLS_vFor((__VLS_ctx.localTags))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        key: (`${tag}-${i}`),
        ...{ class: "tag-chip" },
    });
    /** @type {__VLS_StyleScopedClasses['tag-chip']} */ ;
    (tag);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.removeTag(i);
                // @ts-ignore
                [expanded, expanded, $t, $t, card, localTags, removeTag,];
            } },
        ...{ class: "chip-remove" },
        disabled: (__VLS_ctx.disabled),
        title: (__VLS_ctx.$t('cardMetadata.tagRemoveTooltip', { tag })),
    });
    /** @type {__VLS_StyleScopedClasses['chip-remove']} */ ;
    // @ts-ignore
    [disabled, $t,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onKeydown: (__VLS_ctx.handleTagKeydown) },
    ...{ onFocus: (...[$event]) => {
            __VLS_ctx.showTagSuggestions = true;
            // @ts-ignore
            [handleTagKeydown, showTagSuggestions,];
        } },
    ...{ onBlur: (__VLS_ctx.hideTagSuggestionsSoon) },
    value: (__VLS_ctx.tagInput),
    type: "text",
    ...{ class: "tags-input" },
    placeholder: (__VLS_ctx.$t('cardMetadata.tagsPlaceholder')),
    disabled: (__VLS_ctx.disabled),
});
/** @type {__VLS_StyleScopedClasses['tags-input']} */ ;
if (__VLS_ctx.showTagSuggestions && __VLS_ctx.tagSuggestions.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "tag-suggestions" },
    });
    /** @type {__VLS_StyleScopedClasses['tag-suggestions']} */ ;
    for (const [s] of __VLS_vFor((__VLS_ctx.tagSuggestions))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
            ...{ onMousedown: (...[$event]) => {
                    if (!(__VLS_ctx.showTagSuggestions && __VLS_ctx.tagSuggestions.length))
                        return;
                    __VLS_ctx.addTag(s);
                    // @ts-ignore
                    [disabled, $t, showTagSuggestions, hideTagSuggestionsSoon, tagInput, tagSuggestions, tagSuggestions, addTag,];
                } },
            key: (s),
        });
        (s);
        // @ts-ignore
        [];
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "field" },
});
/** @type {__VLS_StyleScopedClasses['field']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
(__VLS_ctx.$t('cardMetadata.numMovesLabel'));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onBlur: (__VLS_ctx.commitNumMoves) },
    ...{ onKeydown: (__VLS_ctx.commitNumMoves) },
    type: "number",
    min: "1",
    step: "1",
    ...{ class: "num-input" },
    disabled: (__VLS_ctx.disabled),
});
(__VLS_ctx.localNumMoves);
/** @type {__VLS_StyleScopedClasses['num-input']} */ ;
if (__VLS_ctx.numMovesDirty) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "reset-prompt" },
    });
    /** @type {__VLS_StyleScopedClasses['reset-prompt']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "checkbox",
        disabled: (__VLS_ctx.disabled),
    });
    (__VLS_ctx.resetPriorOnSave);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "reset-prompt-text" },
    });
    /** @type {__VLS_StyleScopedClasses['reset-prompt-text']} */ ;
    (__VLS_ctx.$t('cardMetadata.resetPriorInlinePrompt'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    (__VLS_ctx.$t('cardMetadata.resetPriorInlineHint'));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "field" },
});
/** @type {__VLS_StyleScopedClasses['field']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
(__VLS_ctx.$t('cardMetadata.gammaLabel'));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onBlur: (__VLS_ctx.commitGamma) },
    ...{ onKeydown: (__VLS_ctx.commitGamma) },
    type: "number",
    min: "0.01",
    max: "0.99",
    step: "0.01",
    ...{ class: "num-input" },
    disabled: (__VLS_ctx.disabled),
});
(__VLS_ctx.localGamma);
/** @type {__VLS_StyleScopedClasses['num-input']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "field" },
});
/** @type {__VLS_StyleScopedClasses['field']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
(__VLS_ctx.$t('cardMetadata.defaultVisitsLabel'));
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onBlur: (__VLS_ctx.commitDefaultVisits) },
    ...{ onKeydown: (__VLS_ctx.commitDefaultVisits) },
    type: "number",
    min: "1",
    step: "50",
    ...{ class: "num-input" },
    disabled: (__VLS_ctx.disabled),
});
(__VLS_ctx.localDefaultVisits);
/** @type {__VLS_StyleScopedClasses['num-input']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "field toggle-field" },
});
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-field']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (__VLS_ctx.toggleSuspended) },
    type: "checkbox",
    checked: (__VLS_ctx.card.suspended),
    disabled: (__VLS_ctx.disabled),
});
(__VLS_ctx.$t('cardMetadata.suspendedLabel'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "field readonly-field" },
    title: (__VLS_ctx.$t('cardMetadata.analysisConfigTooltip')),
});
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['readonly-field']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
(__VLS_ctx.$t('cardMetadata.analysisConfigLabel'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "readonly-value" },
});
/** @type {__VLS_StyleScopedClasses['readonly-value']} */ ;
(__VLS_ctx.$t('cardMetadata.analysisConfigDeferred'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "actions" },
});
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.resetPriorStandalone) },
    ...{ class: "action-btn reset-btn" },
    disabled: (__VLS_ctx.disabled),
    title: (__VLS_ctx.$t('cardMetadata.resetPriorStandaloneTooltip')),
});
/** @type {__VLS_StyleScopedClasses['action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['reset-btn']} */ ;
(__VLS_ctx.$t('cardMetadata.resetPriorStandalone'));
// @ts-ignore
[disabled, disabled, disabled, disabled, disabled, disabled, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, card, commitNumMoves, commitNumMoves, localNumMoves, numMovesDirty, resetPriorOnSave, commitGamma, commitGamma, localGamma, commitDefaultVisits, commitDefaultVisits, localDefaultVisits, toggleSuspended, resetPriorStandalone,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
