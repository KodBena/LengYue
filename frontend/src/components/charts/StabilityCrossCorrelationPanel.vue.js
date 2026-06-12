/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, computed } from 'vue';
import { useStabilityCrossCorrelations, } from '../../composables/analysis/useStabilityCrossCorrelations';
import { STABILITY_EXTRACTOR_LABELS, DEFAULT_EXTRACTOR_ID } from '../../engine/analysis/stability-extractors';
import { STABILITY_METRIC_LABELS, DEFAULT_METRIC_ID } from '../../lib/stability-trajectory';
import { injectAnalysisContext } from '../../composables/analysis/useAnalysisContext';
// Phase-0 projection seam: self-source the variation path from the
// injected AnalysisContext rather than a prop.
const ctx = injectAnalysisContext();
const variationPath = ctx.variationPath;
const expanded = ref(false);
// Fixed-axis selections — defaults match StabilityPanel's so the
// two views start coherent, but they're independently mutable.
const fixedExtractor = ref(DEFAULT_EXTRACTOR_ID);
const fixedMetric = ref(DEFAULT_METRIC_ID);
const extractorChoices = computed(() => Array.from(STABILITY_EXTRACTOR_LABELS, ([id, label]) => ({ id, label })));
const metricChoices = computed(() => Array.from(STABILITY_METRIC_LABELS, ([id, label]) => ({ id, label })));
const correlations = useStabilityCrossCorrelations(variationPath, fixedExtractor, fixedMetric);
/**
 * Cell tint for a correlation value. Sign drives hue (blue=positive,
 * red=negative); magnitude drives alpha (zero correlation → fully
 * transparent, |r|=1 → fully saturated). Returns an rgba() that
 * lays over the panel's --surface-0 base. NaN cells get no tint.
 */
function cellStyle(r) {
    if (!Number.isFinite(r))
        return { background: 'transparent' };
    const alpha = Math.min(1, Math.abs(r)) * 0.55;
    if (r >= 0) {
        return { background: `rgba(60, 130, 220, ${alpha})` };
    }
    return { background: `rgba(220, 70, 70, ${alpha})` };
}
function formatCell(r) {
    if (!Number.isFinite(r))
        return '—';
    // Two decimals is the standard correlation-matrix resolution;
    // a leading sign for negative values keeps the column widths
    // aligned with positives.
    const s = r.toFixed(2);
    return r >= 0 ? `+${s}` : s;
}
function cellTitle(r, n, rowLabel, colLabel) {
    if (!Number.isFinite(r)) {
        return `${rowLabel} × ${colLabel}: undefined (insufficient data, n=${n})`;
    }
    return `${rowLabel} × ${colLabel}: r = ${r.toFixed(3)}, n = ${n}`;
}
/**
 * Truncate a label to fit the header cells without overflowing.
 * The full label still appears in the title attribute on hover.
 */
function shortId(id) {
    // The registry keys are already short — return as-is. Wrapper
    // exists so a future change to longer keys can centralise the
    // truncation logic without touching the template.
    return id;
}
function matrixCaption(kind) {
    if (kind === 'extractor') {
        const m = STABILITY_METRIC_LABELS.get(fixedMetric.value) ?? fixedMetric.value;
        return `Extractor × Extractor (metric held fixed: ${m})`;
    }
    const e = STABILITY_EXTRACTOR_LABELS.get(fixedExtractor.value) ?? fixedExtractor.value;
    return `Metric × Metric (extractor held fixed: ${e})`;
}
function diagonalN(matrix, idx) {
    // Diagonal entry's n is the number of finite samples in that
    // row's series — the per-row confidence diagnostic.
    return matrix.matrix[idx]?.[idx]?.n ?? 0;
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['header']} */ ;
/** @type {__VLS_StyleScopedClasses['controls']} */ ;
/** @type {__VLS_StyleScopedClasses['select']} */ ;
/** @type {__VLS_StyleScopedClasses['select']} */ ;
/** @type {__VLS_StyleScopedClasses['corr']} */ ;
/** @type {__VLS_StyleScopedClasses['corr']} */ ;
/** @type {__VLS_StyleScopedClasses['corr']} */ ;
/** @type {__VLS_StyleScopedClasses['corr']} */ ;
/** @type {__VLS_StyleScopedClasses['corr']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section" },
});
/** @type {__VLS_StyleScopedClasses['section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.expanded = !__VLS_ctx.expanded;
            // @ts-ignore
            [expanded, expanded,];
        } },
    ...{ class: "header" },
});
/** @type {__VLS_StyleScopedClasses['header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "title" },
});
/** @type {__VLS_StyleScopedClasses['title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "chevron" },
});
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
(__VLS_ctx.expanded ? '▼' : '▶');
if (__VLS_ctx.expanded) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "content" },
    });
    /** @type {__VLS_StyleScopedClasses['content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "controls" },
    });
    /** @type {__VLS_StyleScopedClasses['controls']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "control-label" },
    });
    /** @type {__VLS_StyleScopedClasses['control-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ class: "select" },
        value: (__VLS_ctx.fixedMetric),
    });
    /** @type {__VLS_StyleScopedClasses['select']} */ ;
    for (const [c] of __VLS_vFor((__VLS_ctx.metricChoices))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (c.id),
            value: (c.id),
        });
        (c.label);
        // @ts-ignore
        [expanded, expanded, fixedMetric, metricChoices,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "control-label" },
    });
    /** @type {__VLS_StyleScopedClasses['control-label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        ...{ class: "select" },
        value: (__VLS_ctx.fixedExtractor),
    });
    /** @type {__VLS_StyleScopedClasses['select']} */ ;
    for (const [c] of __VLS_vFor((__VLS_ctx.extractorChoices))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (c.id),
            value: (c.id),
        });
        (c.label);
        // @ts-ignore
        [fixedExtractor, extractorChoices,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "matrix-block" },
    });
    /** @type {__VLS_StyleScopedClasses['matrix-block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "caption" },
    });
    /** @type {__VLS_StyleScopedClasses['caption']} */ ;
    (__VLS_ctx.matrixCaption('extractor'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "corr" },
    });
    /** @type {__VLS_StyleScopedClasses['corr']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "corner" },
    });
    /** @type {__VLS_StyleScopedClasses['corner']} */ ;
    for (const [id, j] of __VLS_vFor((__VLS_ctx.correlations.extractor.ids))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            key: (`eh-${j}`),
            title: (__VLS_ctx.correlations.extractor.labels[j]),
        });
        (__VLS_ctx.shortId(id));
        // @ts-ignore
        [matrixCaption, correlations, correlations, shortId,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    for (const [id, i] of __VLS_vFor((__VLS_ctx.correlations.extractor.ids))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (`er-${i}`),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            title: (`${__VLS_ctx.correlations.extractor.labels[i]} (n = ${__VLS_ctx.diagonalN(__VLS_ctx.correlations.extractor, i)})`),
        });
        (__VLS_ctx.shortId(id));
        for (const [cell, j] of __VLS_vFor((__VLS_ctx.correlations.extractor.matrix[i]))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                key: (`ec-${i}-${j}`),
                ...{ style: (__VLS_ctx.cellStyle(cell.value)) },
                title: (__VLS_ctx.cellTitle(cell.value, cell.n, __VLS_ctx.correlations.extractor.labels[i], __VLS_ctx.correlations.extractor.labels[j])),
            });
            (__VLS_ctx.formatCell(cell.value));
            // @ts-ignore
            [correlations, correlations, correlations, correlations, correlations, correlations, shortId, diagonalN, cellStyle, cellTitle, formatCell,];
        }
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "matrix-block" },
    });
    /** @type {__VLS_StyleScopedClasses['matrix-block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "caption" },
    });
    /** @type {__VLS_StyleScopedClasses['caption']} */ ;
    (__VLS_ctx.matrixCaption('metric'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "corr" },
    });
    /** @type {__VLS_StyleScopedClasses['corr']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "corner" },
    });
    /** @type {__VLS_StyleScopedClasses['corner']} */ ;
    for (const [id, j] of __VLS_vFor((__VLS_ctx.correlations.metric.ids))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            key: (`mh-${j}`),
            title: (__VLS_ctx.correlations.metric.labels[j]),
        });
        (__VLS_ctx.shortId(id));
        // @ts-ignore
        [matrixCaption, correlations, correlations, shortId,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    for (const [id, i] of __VLS_vFor((__VLS_ctx.correlations.metric.ids))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (`mr-${i}`),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            title: (`${__VLS_ctx.correlations.metric.labels[i]} (n = ${__VLS_ctx.diagonalN(__VLS_ctx.correlations.metric, i)})`),
        });
        (__VLS_ctx.shortId(id));
        for (const [cell, j] of __VLS_vFor((__VLS_ctx.correlations.metric.matrix[i]))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                key: (`mc-${i}-${j}`),
                ...{ style: (__VLS_ctx.cellStyle(cell.value)) },
                title: (__VLS_ctx.cellTitle(cell.value, cell.n, __VLS_ctx.correlations.metric.labels[i], __VLS_ctx.correlations.metric.labels[j])),
            });
            (__VLS_ctx.formatCell(cell.value));
            // @ts-ignore
            [correlations, correlations, correlations, correlations, correlations, correlations, shortId, diagonalN, cellStyle, cellTitle, formatCell,];
        }
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "legend" },
    });
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
