/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, computed, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { store, pushSystemMessage } from '../../store';
import { useMinting } from '../../composables/review/useMinting';
import { INTERACTION_DISMISS_DELAY_MS } from '../../lib/timing';
const { t } = useI18n();
const { prepareDraft, calibrateKomiOnDraft, commitMint } = useMinting();
const isOpen = ref(false);
const isLoading = ref(false);
const draft = ref(null);
// The board this draft was prepared from — retained so the
// komi-calibration evaluation (run at submit) can re-read the board's
// position. Set in `open`, cleared in `close`.
const draftBoardId = ref(null);
// Tag Input State
const tagInput = ref('');
const showSuggestions = ref(false);
// Palette Override State
const selectedPaletteId = ref('active');
// ── Komi calibration (opt-in, pedagogical) ───────────────────────────
// The two controls appear only when an engine is connected — the same
// `store.engine.status === 'connected'` predicate the keybindings
// catalog's `engineConnected` uses. Strictly opt-in: the checkbox is
// unchecked by default. The visits input prefills from the user setting
// but per-mint edits do NOT write back to it (a local ref, not bound to
// the store).
const engineConnected = computed(() => store.engine.status === 'connected');
const calibrateKomi = ref(false);
const calibrationVisits = ref(store.profile.settings.engine.katago.calibrationVisits);
const palettes = computed(() => store.profile.settings.engine.katago.analysis_env.palettes);
// Typed accessors for the two editable fields inside `grading_parameter`.
// The wire shape declares `grading_parameter: { [key: string]: unknown } | null`
// (OpenAPI-honest about the blob's opacity), but `useMinting.prepareDraft`
// populates `data.default_visits: number` and `data.gamma: number` before
// the modal renders, and the modal's contract is to surface those two
// fields as editable. The localized casts widen at the access boundary;
// the rest of the blob stays opaque. Read-side counterparts are the
// `readGradingParam<number>` calls in
// `services/backend-service.ts::mapToReviewCard`.
const defaultVisits = computed({
    get() {
        // untyped wire blob: assert the one field this getter reads (see header).
        const gp = draft.value?.grading_parameter;
        return gp?.data?.default_visits ?? 1000;
    },
    set(v) {
        if (!draft.value)
            return;
        // untyped wire blob: assert the data sub-object this setter writes.
        const gp = draft.value.grading_parameter;
        if (gp?.data)
            gp.data.default_visits = v;
    },
});
const gamma = computed({
    get() {
        // untyped wire blob: assert the one field this getter reads (see header).
        const gp = draft.value?.grading_parameter;
        return gp?.data?.gamma ?? 0.9;
    },
    set(v) {
        if (!draft.value)
            return;
        // untyped wire blob: assert the data sub-object this setter writes.
        const gp = draft.value.grading_parameter;
        if (gp?.data)
            gp.data.gamma = v;
    },
});
const filteredTags = computed(() => {
    const query = tagInput.value.toLowerCase().trim();
    if (!query)
        return [];
    return store.knownTags.filter(t => t.toLowerCase().includes(query) && !draft.value?.tags.includes(t)).slice(0, 8); // Max 8 suggestions
});
const __VLS_exposed = {
    async open(boardId) {
        selectedPaletteId.value = store.profile.settings.minting.defaultPaletteId;
        draft.value = await prepareDraft(boardId);
        if (draft.value) {
            draftBoardId.value = boardId;
            isOpen.value = true;
            tagInput.value = '';
            // Reset calibration to its opt-in default each open; prefill the
            // visits input from the current setting (per-mint edits don't
            // write back).
            calibrateKomi.value = false;
            calibrationVisits.value = store.profile.settings.engine.katago.calibrationVisits;
        }
    }
};
defineExpose(__VLS_exposed);
function close() {
    isOpen.value = false;
    draft.value = null;
    draftBoardId.value = null;
}
// ─── Tag Management ──────────────────────────────────────────────────────────
function addTag(tag) {
    const cleanTag = tag.trim().toLowerCase();
    if (!cleanTag || !draft.value)
        return;
    if (!draft.value.tags.includes(cleanTag)) {
        draft.value.tags.push(cleanTag);
    }
    tagInput.value = '';
    showSuggestions.value = false;
}
function handleTagKeydown(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(tagInput.value);
    }
    else if (e.key === 'Backspace' && tagInput.value === '' && draft.value?.tags.length) {
        draft.value.tags.pop();
    }
    else if (e.key === 'Escape') {
        showSuggestions.value = false;
    }
    else {
        showSuggestions.value = true;
    }
}
function removeTag(index) {
    if (draft.value)
        draft.value.tags.splice(index, 1);
}
/**
 * Hide the suggestions dropdown after a short delay.
 *
 * Why the delay: `@blur` on the input fires *before* a click on a
 * suggestion list item is processed. If we hid the dropdown
 * synchronously, the click handler (`@mousedown.prevent="addTag(...)"`)
 * would never fire because the element it targets would already be
 * gone from the DOM. The 150 ms window is comfortable on most
 * devices; lower values risk dropping the click on slower hardware.
 *
 * Hoisted out of the template because Vue templates only see script-
 * exposed identifiers, not browser globals like `setTimeout` —
 * referencing it inline produces a TS2339 error under strict mode
 * (the auto-generated component instance type doesn't include
 * browser globals).
 */
// Tracks the in-flight setTimeout handle for hideSuggestionsDelayed
// so we can clear it on unmount (and on overlapping schedules — a
// rapid blur-focus-blur sequence would otherwise queue duplicate
// callbacks). The post-unmount write to showSuggestions.value would
// be a closure-stable no-op, but releasing the timer is the
// discipline-correct shape.
let suggestionsHideTimer = null;
function hideSuggestionsDelayed() {
    if (suggestionsHideTimer !== null) {
        clearTimeout(suggestionsHideTimer);
    }
    // Suggestions-hide delay — gives the user time to mousedown on a
    // suggestion before the dropdown closes on input blur. The shared
    // interaction-dismiss grace from the timing catalog (`lib/timing`).
    suggestionsHideTimer = window.setTimeout(() => {
        showSuggestions.value = false;
        suggestionsHideTimer = null;
    }, INTERACTION_DISMISS_DELAY_MS);
}
onUnmounted(() => {
    if (suggestionsHideTimer !== null)
        clearTimeout(suggestionsHideTimer);
});
// ─── Submission ──────────────────────────────────────────────────────────────
async function submit() {
    if (!draft.value)
        return;
    isLoading.value = true;
    // Flush a typed-but-uncommitted tag. A user who types a tag and
    // clicks Mint without pressing Enter/comma (so it never became a
    // chip) would otherwise have it silently dropped — it lives in
    // `tagInput`, never pushed to `draft.tags`, so the card mints
    // without it. `addTag` normalizes + dedups and clears `tagInput`.
    if (tagInput.value.trim())
        addTag(tagInput.value);
    // Apply Palette Override if one was specifically chosen.
    // 34b: The override rebuilds `grading_parameter` from the palette, so we
    // must re-attach `default_visits` and `gamma` afterwards — otherwise
    // we'd clobber the values the user may have edited in the modal.
    if (selectedPaletteId.value !== 'active') {
        const env = store.profile.settings.engine.katago.analysis_env;
        const p = env.palettes.find(x => x.id === selectedPaletteId.value);
        if (p) {
            // Local cast at the read site: the wire shape's `grading_parameter`
            // is `{[key: string]: unknown} | null`; the create-flow contract
            // populates `data.default_visits` and `data.gamma` (see
            // `useMinting.prepareDraft`).
            const gp = draft.value.grading_parameter;
            const preservedVisits = gp?.data?.default_visits;
            const preservedGamma = gp?.data?.gamma;
            draft.value.grading_parameter = {
                data: {
                    analysis_config: {
                        bindings: { delta_fn: p.delta_fn, state_fns: p.state_fns, summary_fn: p.summary_fn },
                        parameters: env.parameters,
                        symbols: env.symbols
                    },
                    default_visits: preservedVisits,
                    gamma: preservedGamma
                }
            };
        }
    }
    try {
        // Komi calibration (opt-in). Runs a fresh bounded evaluation and
        // rewrites the draft's SGF komi so the minted card stores the
        // even-game komi. If the evaluation fails (engine disconnect,
        // error packet, timeout), `calibrateKomiOnDraft` throws and we
        // ABORT the mint loudly (ADR-0002) — the catch below surfaces the
        // failure and the card is NOT created. The visits passed are the
        // per-mint value (which does not write back to the setting).
        if (calibrateKomi.value && engineConnected.value && draftBoardId.value) {
            const result = await calibrateKomiOnDraft(draftBoardId.value, draft.value, calibrationVisits.value);
            // System-log the komi set for this card; name the clamp when it
            // fired so the user isn't surprised by an out-of-range adjustment.
            pushSystemMessage('info', result.clamped
                ? t('mint.komiCalibration.setClamped', {
                    komi: result.evenKomi,
                    raw: result.rawEvenKomi.toFixed(1),
                })
                : t('mint.komiCalibration.set', { komi: result.evenKomi }));
        }
        await commitMint(draft.value);
        close();
    }
    catch (err) {
        console.error('[Minting] Failed to create card:', err);
        // A calibration failure aborts the mint loudly (ADR-0002) — surface
        // it in the system log as an error so the user knows the card was
        // NOT created and why, then fall through to the existing alert.
        if (calibrateKomi.value) {
            pushSystemMessage('error', t('mint.komiCalibration.failed', { err: String(err) }));
        }
        // Native alert wraps the English `${err}` per the (a) backend-error
        // pass-through approach (see frontend/docs/i18n.md).
        alert(t('mint.alert.failed', { err: String(err) }));
    }
    finally {
        isLoading.value = false;
    }
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['lineage-box']} */ ;
/** @type {__VLS_StyleScopedClasses['lineage-box']} */ ;
/** @type {__VLS_StyleScopedClasses['lineage-text']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-select']} */ ;
/** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-input-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['suggestions-list']} */ ;
/** @type {__VLS_StyleScopedClasses['suggestions-list']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-submit']} */ ;
if (__VLS_ctx.isOpen) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onMousedown: (__VLS_ctx.close) },
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
    (__VLS_ctx.$t('mint.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.close) },
        ...{ class: "close-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['close-btn']} */ ;
    if (__VLS_ctx.draft) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "modal-body" },
        });
        /** @type {__VLS_StyleScopedClasses['modal-body']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "lineage-box" },
            ...{ class: (__VLS_ctx.draft.parent_card_id ? 'branch' : 'root') },
        });
        /** @type {__VLS_StyleScopedClasses['lineage-box']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "lineage-icon" },
        });
        /** @type {__VLS_StyleScopedClasses['lineage-icon']} */ ;
        (__VLS_ctx.draft.parent_card_id ? '↳' : '🌱');
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "lineage-text" },
        });
        /** @type {__VLS_StyleScopedClasses['lineage-text']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_ctx.draft.parent_card_id ? __VLS_ctx.$t('mint.lineage.branch') : __VLS_ctx.$t('mint.lineage.root'));
        if (__VLS_ctx.draft.parent_card_id) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (__VLS_ctx.$t('mint.lineage.derivedFrom', { id: __VLS_ctx.draft.parent_card_id }));
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (__VLS_ctx.$t('mint.lineage.newOrigin'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-grid" },
        });
        /** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('mint.field.targetMoves'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            min: "1",
            max: "50",
            ...{ class: "dark-input" },
        });
        (__VLS_ctx.draft.num_moves);
        /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('mint.field.defaultVisits'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            min: "1",
            step: "100",
            ...{ class: "dark-input" },
        });
        (__VLS_ctx.defaultVisits);
        /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('mint.field.discountGamma'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            min: "0.01",
            max: "1",
            step: "0.01",
            ...{ class: "dark-input" },
        });
        (__VLS_ctx.gamma);
        /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('mint.field.analysisPalette'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            value: (__VLS_ctx.selectedPaletteId),
            ...{ class: "dark-select" },
        });
        /** @type {__VLS_StyleScopedClasses['dark-select']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "active",
        });
        (__VLS_ctx.$t('mint.palette.activeOption'));
        for (const [p] of __VLS_vFor((__VLS_ctx.palettes))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (p.id),
                value: (p.id),
            });
            (p.name);
            // @ts-ignore
            [isOpen, close, close, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, draft, draft, draft, draft, draft, draft, draft, defaultVisits, gamma, selectedPaletteId, palettes,];
        }
        if (__VLS_ctx.engineConnected) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            (__VLS_ctx.$t('mint.field.calibrateKomi'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                ...{ class: "checkbox-cell" },
            });
            /** @type {__VLS_StyleScopedClasses['checkbox-cell']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "checkbox",
                ...{ class: "calibrate-checkbox" },
            });
            (__VLS_ctx.calibrateKomi);
            /** @type {__VLS_StyleScopedClasses['calibrate-checkbox']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "hint" },
            });
            /** @type {__VLS_StyleScopedClasses['hint']} */ ;
            (__VLS_ctx.$t('mint.komiCalibration.hint'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            (__VLS_ctx.$t('mint.field.calibrationVisits'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "number",
                min: "1",
                step: "100",
                ...{ class: "dark-input" },
                disabled: (!__VLS_ctx.calibrateKomi),
            });
            (__VLS_ctx.calibrationVisits);
            /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "form-group" },
            ...{ style: {} },
        });
        /** @type {__VLS_StyleScopedClasses['form-group']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "tag-label" },
        });
        /** @type {__VLS_StyleScopedClasses['tag-label']} */ ;
        (__VLS_ctx.$t('mint.field.tags'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "tag-input-wrapper" },
        });
        /** @type {__VLS_StyleScopedClasses['tag-input-wrapper']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "tag-badges" },
        });
        /** @type {__VLS_StyleScopedClasses['tag-badges']} */ ;
        for (const [tag, i] of __VLS_vFor((__VLS_ctx.draft.tags))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                key: (tag),
                ...{ class: "tag-badge" },
            });
            /** @type {__VLS_StyleScopedClasses['tag-badge']} */ ;
            (tag);
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.isOpen))
                            return;
                        if (!(__VLS_ctx.draft))
                            return;
                        __VLS_ctx.removeTag(i);
                        // @ts-ignore
                        [$t, $t, $t, $t, draft, engineConnected, calibrateKomi, calibrateKomi, calibrationVisits, removeTag,];
                    } },
                ...{ class: "tag-remove" },
            });
            /** @type {__VLS_StyleScopedClasses['tag-remove']} */ ;
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onKeydown: (__VLS_ctx.handleTagKeydown) },
            ...{ onFocus: (...[$event]) => {
                    if (!(__VLS_ctx.isOpen))
                        return;
                    if (!(__VLS_ctx.draft))
                        return;
                    __VLS_ctx.showSuggestions = true;
                    // @ts-ignore
                    [handleTagKeydown, showSuggestions,];
                } },
            ...{ onBlur: (__VLS_ctx.hideSuggestionsDelayed) },
            type: "text",
            ...{ class: "tag-input" },
            value: (__VLS_ctx.tagInput),
            placeholder: (__VLS_ctx.$t('mint.tags.placeholder')),
        });
        /** @type {__VLS_StyleScopedClasses['tag-input']} */ ;
        if (__VLS_ctx.showSuggestions && __VLS_ctx.filteredTags.length > 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
                ...{ class: "suggestions-list" },
            });
            /** @type {__VLS_StyleScopedClasses['suggestions-list']} */ ;
            for (const [sugg] of __VLS_vFor((__VLS_ctx.filteredTags))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                    ...{ onMousedown: (...[$event]) => {
                            if (!(__VLS_ctx.isOpen))
                                return;
                            if (!(__VLS_ctx.draft))
                                return;
                            if (!(__VLS_ctx.showSuggestions && __VLS_ctx.filteredTags.length > 0))
                                return;
                            __VLS_ctx.addTag(sugg);
                            // @ts-ignore
                            [$t, showSuggestions, hideSuggestionsDelayed, tagInput, filteredTags, filteredTags, addTag,];
                        } },
                    key: (sugg),
                });
                (sugg);
                // @ts-ignore
                [];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('mint.tags.hint'));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-footer" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-footer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.close) },
        ...{ class: "btn-cancel" },
        disabled: (__VLS_ctx.isLoading),
    });
    /** @type {__VLS_StyleScopedClasses['btn-cancel']} */ ;
    (__VLS_ctx.$t('mint.button.cancel'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.submit) },
        ...{ class: "btn-submit" },
        disabled: (__VLS_ctx.isLoading),
    });
    /** @type {__VLS_StyleScopedClasses['btn-submit']} */ ;
    (__VLS_ctx.isLoading ? __VLS_ctx.$t('mint.button.minting') : __VLS_ctx.$t('mint.button.mint'));
}
// @ts-ignore
[close, $t, $t, $t, $t, isLoading, isLoading, isLoading, submit,];
const __VLS_export = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
});
export default {};
