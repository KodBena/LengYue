/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * src/components/editors/AnalysisControls.vue
 * Per-board analysis control surface — engine status, palette
 * picker, ledger purge, server-side bundle persistence
 * (Save / Discard with reactive summary subtitle), move-filter
 * threshold, and the AnalysisDashboard chart cluster.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { store } from '../../store';
import { mutateProfile } from '../../store/profile-owner';
import { ledger } from '../../state/analysis-ledger';
import { useAnalysisPersistence } from '../../composables/analysis/useAnalysisPersistence';
import AnalysisDashboard from '../charts/AnalysisDashboard.vue';
const { t } = useI18n();
const props = defineProps();
const persist = useAnalysisPersistence(() => props.boardId);
const palettes = computed(() => store.profile.settings.engine.katago.analysis_env.palettes);
// ── Owner-routed v-model targets ──────────────────────────────────────────
//
// The five profile-settings leaves this editor binds were template
// v-models writing PROFILE state directly — outside ADR-0001's
// session.ui template-toggle sanction, carried as annotated
// store-write-needs-owner exemptions until the subtree got a real
// owner (work-status item settings-profile-mutator-owner). Each leaf
// is now a WritableComputed: the getter reads the store (this editor
// displays the value — ADR-0010 read-locality), the setter routes the
// identical leaf assignment through `mutateProfile`, so v-model
// semantics (including the .number modifier's coercion, applied
// before the setter runs) and SyncService's deep-watch observability
// are unchanged.
const activePaletteId = computed({
    get: () => store.profile.settings.engine.katago.analysis_env.activePaletteId,
    set: (v) => mutateProfile((p) => {
        p.settings.engine.katago.analysis_env.activePaletteId = v;
    }),
});
const adaptiveEnabled = computed({
    get: () => store.profile.settings.engine.katago.adaptiveReevaluate.enabled,
    set: (v) => mutateProfile((p) => {
        p.settings.engine.katago.adaptiveReevaluate.enabled = v;
    }),
});
const adaptiveWorstQuantile = computed({
    get: () => store.profile.settings.engine.katago.adaptiveReevaluate.worstQuantile,
    set: (v) => mutateProfile((p) => {
        p.settings.engine.katago.adaptiveReevaluate.worstQuantile = v;
    }),
});
const adaptiveExtraVisits = computed({
    get: () => store.profile.settings.engine.katago.adaptiveReevaluate.extraVisits,
    set: (v) => mutateProfile((p) => {
        p.settings.engine.katago.adaptiveReevaluate.extraVisits = v;
    }),
});
const adaptiveValueBinding = computed({
    get: () => store.profile.settings.engine.katago.adaptiveReevaluate.valueBinding,
    set: (v) => mutateProfile((p) => {
        p.settings.engine.katago.adaptiveReevaluate.valueBinding = v;
    }),
});
// Adaptive-reevaluate UI is gated on the proxy actually advertising
// the capability. When the proxy doesn't advertise (legacy proxies
// or PROXY_ADVERTISE_CAPABILITIES=false), no UI is shown — the
// SPA's wire opt-in falls back to the proxy's legacy auto-engage
// path which is the right semantic for non-advertising proxies.
// The registry values stay populated regardless (so a user who
// configures here, disconnects, and reconnects to an advertising
// proxy gets their config back).
const adaptiveAdvertised = computed(() => {
    const caps = store.engine.info.capabilities;
    return caps !== null && 'adaptive_reevaluate' in caps;
});
// v1.0.26 — list of `learned_*` value-binding versions advertised by
// the proxy. Empty array means the proxy doesn't host any learned
// predictor (either lightgbm not installed, no bundled models, or
// pre-v1.0.26 proxy); the dropdown only shows the "default"
// (built-in) option in that case. The read is cast-free:
// `available_value_bindings` is declared on the capability mirror
// (`AdaptiveReevaluateAdvertisedMetadata` in `engine/katago/types.ts`)
// and validated once at probe time in
// `version-probe.ts::parseVersionResponse` — a mismatched
// advertisement degrades the capability there instead of reaching
// this computed as a type-level lie.
const availableLearnedBindings = computed(() => {
    const list = store.engine.info.capabilities?.adaptive_reevaluate?.available_value_bindings ?? [];
    return list.filter((vb) => vb.startsWith('learned_'));
});
// ── Persistence UI state ──────────────────────────────────────────────────
//
// `summary` is reactive on the service's per-board summaries Map.
// A successful save() / discard() / refreshSummaries() flips this
// computed and the subtitle updates without manual invalidation.
// `saving` is purely local — disables the Save button during the
// PUT round-trip. `lastError` shows the most recent typed error
// inline; cleared on the next attempt. `autoSave` reflects the
// registry toggle; the Save button stays available even when
// auto-save is on (relabelled "Save now" to imply throttle
// bypass), while a small "AUTO" badge advertises the policy in
// the title row. `autoSaveError` surfaces the persistent-error
// pause state owned by useAutoSaveAnalyses via the service's
// reactive per-board slot.
const saving = ref(false);
const lastError = ref(null);
const summary = persist.summary;
const autoSave = computed(() => store.profile.settings.engine.katago.analysisAutoSave);
const autoSaveError = persist.autoSaveError;
const autoSaveErrorText = computed(() => {
    const err = autoSaveError.value;
    if (!err)
        return null;
    return t('analysis.persist.autoSavePaused', { reason: describeError(err) });
});
const summarySubtitle = computed(() => {
    const s = summary.value;
    if (!s)
        return t('analysis.persist.notSaved');
    // For v2-stored bundles the backend reports the SPA-asserted
    // pre-compression byte size; surface the savings ratio so the
    // user sees the payoff of the projected/quantised scheme. For
    // v1 bundles (null uncompressedByteSize), the basic line still
    // shows just the stored size — the v1 codec has no honest
    // "before" value to compare against from the SPA's POV.
    if (typeof s.uncompressedByteSize === 'number' &&
        s.uncompressedByteSize > s.storedByteSize) {
        const savings = Math.round((1 - s.storedByteSize / s.uncompressedByteSize) * 100);
        return t('analysis.persist.savedSummaryWithSavings', {
            count: s.recordCount,
            size: formatBytes(s.storedByteSize),
            uncompressed: formatBytes(s.uncompressedByteSize),
            savings,
        });
    }
    return t('analysis.persist.savedSummary', {
        count: s.recordCount,
        size: formatBytes(s.storedByteSize),
    });
});
function formatBytes(n) {
    if (n < 1024)
        return `${n} B`;
    if (n < 1024 * 1024)
        return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024)
        return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function isStorageError(err) {
    return typeof err === 'object' && err !== null && 'kind' in err && 'status' in err;
}
function describeError(err) {
    if (isStorageError(err)) {
        if (err.kind === 'bundle_too_large') {
            return t('analysis.persist.errorTooLarge', {
                size: formatBytes(err.requestBytes),
                cap: formatBytes(err.capBytes),
            });
        }
        if (err.kind === 'user_quota_exceeded') {
            return t('analysis.persist.errorQuota', {
                current: formatBytes(err.currentBytes),
                quota: formatBytes(err.quotaBytes),
            });
        }
        if (err.kind === 'unknown_scheme') {
            return t('analysis.persist.errorUnknownScheme');
        }
    }
    return t('analysis.persist.errorGeneric');
}
async function onSave() {
    saving.value = true;
    lastError.value = null;
    try {
        await persist.save();
    }
    catch (err) {
        lastError.value = describeError(err);
    }
    finally {
        saving.value = false;
    }
}
async function onDiscard() {
    if (!confirm(t('analysis.persist.confirmDiscard')))
        return;
    try {
        await persist.discard();
        lastError.value = null;
    }
    catch (err) {
        lastError.value = describeError(err);
    }
}
function purgeLedger() {
    if (confirm(t('analysis.confirmPurge'))) {
        persist.stopAnalysis();
        ledger.purgeBoard(props.boardId);
    }
}
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['status-indicator']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-row']} */ ;
/** @type {__VLS_StyleScopedClasses['adaptive-input']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "tab-padding" },
});
/** @type {__VLS_StyleScopedClasses['tab-padding']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "header-row" },
});
/** @type {__VLS_StyleScopedClasses['header-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
(__VLS_ctx.$t('analysis.engineLabel'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "status-indicator" },
    ...{ class: ({ 'connected': __VLS_ctx.store.engine.status === 'connected' }) },
});
/** @type {__VLS_StyleScopedClasses['status-indicator']} */ ;
/** @type {__VLS_StyleScopedClasses['connected']} */ ;
(__VLS_ctx.store.engine.status === 'connected' ? __VLS_ctx.$t('analysis.engineConnected') : __VLS_ctx.$t('analysis.engineOffline'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "palette-selector" },
});
/** @type {__VLS_StyleScopedClasses['palette-selector']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
(__VLS_ctx.$t('analysis.paletteLabel'));
__VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
    value: (__VLS_ctx.activePaletteId),
    ...{ class: "dark-select" },
});
/** @type {__VLS_StyleScopedClasses['dark-select']} */ ;
for (const [p] of __VLS_vFor((__VLS_ctx.palettes))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        key: (p.id),
        value: (p.id),
    });
    (p.name);
    // @ts-ignore
    [$t, $t, $t, $t, store, store, activePaletteId, palettes,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.purgeLedger) },
    ...{ class: "toolbar-btn-sm warning-btn" },
    title: (__VLS_ctx.$t('analysis.purgeTooltip')),
});
/** @type {__VLS_StyleScopedClasses['toolbar-btn-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['warning-btn']} */ ;
(__VLS_ctx.$t('analysis.purge'));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "analysis-config-box move-filter-box" },
});
/** @type {__VLS_StyleScopedClasses['analysis-config-box']} */ ;
/** @type {__VLS_StyleScopedClasses['move-filter-box']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "settings-row" },
});
/** @type {__VLS_StyleScopedClasses['settings-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    ...{ class: "label-with-value" },
});
/** @type {__VLS_StyleScopedClasses['label-with-value']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.$t('analysis.moveFilter'));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "value-badge" },
});
/** @type {__VLS_StyleScopedClasses['value-badge']} */ ;
((__VLS_ctx.store.session.ui.moveFilterThreshold * 100).toFixed(0));
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "hint" },
});
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
(__VLS_ctx.$t('analysis.moveFilter.movedNotice'));
if (__VLS_ctx.adaptiveAdvertised) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "analysis-config-box adaptive-box" },
    });
    /** @type {__VLS_StyleScopedClasses['analysis-config-box']} */ ;
    /** @type {__VLS_StyleScopedClasses['adaptive-box']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "settings-row" },
    });
    /** @type {__VLS_StyleScopedClasses['settings-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "checkbox-row" },
    });
    /** @type {__VLS_StyleScopedClasses['checkbox-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "checkbox",
    });
    (__VLS_ctx.adaptiveEnabled);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.$t('analysis.adaptive.enabled'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "info-icon" },
        title: (__VLS_ctx.$t('analysis.adaptive.tooltip')),
    });
    /** @type {__VLS_StyleScopedClasses['info-icon']} */ ;
    if (__VLS_ctx.adaptiveEnabled) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "adaptive-fields" },
        });
        /** @type {__VLS_StyleScopedClasses['adaptive-fields']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "label-with-value adaptive-field-row" },
        });
        /** @type {__VLS_StyleScopedClasses['label-with-value']} */ ;
        /** @type {__VLS_StyleScopedClasses['adaptive-field-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('analysis.adaptive.worstQuantile'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            min: "0",
            max: "1",
            step: "0.01",
            ...{ class: "dark-input adaptive-input" },
        });
        (__VLS_ctx.adaptiveWorstQuantile);
        /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        /** @type {__VLS_StyleScopedClasses['adaptive-input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "label-with-value adaptive-field-row" },
        });
        /** @type {__VLS_StyleScopedClasses['label-with-value']} */ ;
        /** @type {__VLS_StyleScopedClasses['adaptive-field-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('analysis.adaptive.extraVisits'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            min: "0",
            step: "100",
            ...{ class: "dark-input adaptive-input" },
        });
        (__VLS_ctx.adaptiveExtraVisits);
        /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
        /** @type {__VLS_StyleScopedClasses['adaptive-input']} */ ;
        if (__VLS_ctx.availableLearnedBindings.length > 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                ...{ class: "label-with-value adaptive-field-row" },
            });
            /** @type {__VLS_StyleScopedClasses['label-with-value']} */ ;
            /** @type {__VLS_StyleScopedClasses['adaptive-field-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (__VLS_ctx.$t('analysis.adaptive.valueBinding.label'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                value: (__VLS_ctx.adaptiveValueBinding),
                ...{ class: "dark-input adaptive-input" },
            });
            /** @type {__VLS_StyleScopedClasses['dark-input']} */ ;
            /** @type {__VLS_StyleScopedClasses['adaptive-input']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                value: "",
            });
            (__VLS_ctx.$t('analysis.adaptive.valueBinding.default'));
            for (const [vb] of __VLS_vFor((__VLS_ctx.availableLearnedBindings))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (vb),
                    value: (vb),
                });
                (__VLS_ctx.$t('analysis.adaptive.valueBinding.learnedLabel', { version: vb }));
                // @ts-ignore
                [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, store, purgeLedger, adaptiveAdvertised, adaptiveEnabled, adaptiveEnabled, adaptiveWorstQuantile, adaptiveExtraVisits, availableLearnedBindings, availableLearnedBindings, adaptiveValueBinding,];
            }
            if (__VLS_ctx.adaptiveValueBinding.startsWith('learned_')) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "info-icon" },
                    title: (__VLS_ctx.$t('analysis.adaptive.valueBinding.experimentalTooltip')),
                });
                /** @type {__VLS_StyleScopedClasses['info-icon']} */ ;
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('analysis.adaptive.hint'));
    }
}
if (__VLS_ctx.store.profile.settings.engine.katago.analysisStorageEnabled) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "analysis-config-box persist-box" },
    });
    /** @type {__VLS_StyleScopedClasses['analysis-config-box']} */ ;
    /** @type {__VLS_StyleScopedClasses['persist-box']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "settings-row" },
    });
    /** @type {__VLS_StyleScopedClasses['settings-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "label-with-value" },
    });
    /** @type {__VLS_StyleScopedClasses['label-with-value']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "persist-title-row" },
    });
    /** @type {__VLS_StyleScopedClasses['persist-title-row']} */ ;
    (__VLS_ctx.$t('analysis.persist.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "experimental-tag" },
    });
    /** @type {__VLS_StyleScopedClasses['experimental-tag']} */ ;
    (__VLS_ctx.$t('analysis.persist.experimentalTag'));
    if (__VLS_ctx.autoSave) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "auto-badge" },
        });
        /** @type {__VLS_StyleScopedClasses['auto-badge']} */ ;
        (__VLS_ctx.$t('analysis.persist.autoSaveLabel'));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "info-icon" },
        title: (__VLS_ctx.$t('analysis.persist.tooltip')),
    });
    /** @type {__VLS_StyleScopedClasses['info-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value-badge" },
    });
    /** @type {__VLS_StyleScopedClasses['value-badge']} */ ;
    (__VLS_ctx.summarySubtitle);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "persist-btn-row" },
    });
    /** @type {__VLS_StyleScopedClasses['persist-btn-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.onSave) },
        ...{ class: "toolbar-btn-sm" },
        disabled: (__VLS_ctx.saving),
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn-sm']} */ ;
    (__VLS_ctx.saving
        ? __VLS_ctx.$t('analysis.persist.saving')
        : (__VLS_ctx.autoSave ? __VLS_ctx.$t('analysis.persist.saveNow') : __VLS_ctx.$t('analysis.persist.save')));
    if (__VLS_ctx.summary) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_ctx.onDiscard) },
            ...{ class: "toolbar-btn-sm warning-btn" },
        });
        /** @type {__VLS_StyleScopedClasses['toolbar-btn-sm']} */ ;
        /** @type {__VLS_StyleScopedClasses['warning-btn']} */ ;
        (__VLS_ctx.$t('analysis.persist.discard'));
    }
    if (__VLS_ctx.autoSaveErrorText) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint error-hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        /** @type {__VLS_StyleScopedClasses['error-hint']} */ ;
        (__VLS_ctx.autoSaveErrorText);
    }
    if (__VLS_ctx.lastError) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint error-hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        /** @type {__VLS_StyleScopedClasses['error-hint']} */ ;
        (__VLS_ctx.lastError);
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "chart-container-outer" },
});
/** @type {__VLS_StyleScopedClasses['chart-container-outer']} */ ;
const __VLS_0 = AnalysisDashboard;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    key: (__VLS_ctx.boardId),
    boardId: (__VLS_ctx.boardId),
}));
const __VLS_2 = __VLS_1({
    key: (__VLS_ctx.boardId),
    boardId: (__VLS_ctx.boardId),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
// @ts-ignore
[$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, store, adaptiveValueBinding, autoSave, autoSave, summarySubtitle, onSave, saving, saving, summary, onDiscard, autoSaveErrorText, autoSaveErrorText, lastError, lastError, boardId, boardId,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
