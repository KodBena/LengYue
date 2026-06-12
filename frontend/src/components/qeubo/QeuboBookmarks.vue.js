/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQeubo, paramNameForKnobId } from '../../composables/useQeubo';
import { pushSystemMessage, store } from '../../store';
const { t } = useI18n();
const q = useQeubo();
const bookmarks = computed(() => {
    const list = store.profile.qeuboPinnedBookmarks ?? [];
    // Newest first — bookmarks are pushed in chronological order;
    // the user most likely wants their recent work surfaced.
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
});
function formatDate(ts) {
    return new Date(ts).toLocaleString();
}
/**
 * Compact one-line summary of a bookmark's parameters. The store
 * shape is KnobId-keyed (`qeubo.<name>`) with value vectors; the
 * display strips back to the bare param name and renders the value
 * (a scalar for the length-1 vectors qEUBO produces today, or a
 * bracketed list for a vector knob). Sorted by param name for
 * stability across reads; numbers up to 4 decimals, trailing zeros
 * trimmed.
 */
function formatParameters(params) {
    // Object.entries on Record<KnobId, number[]> widens the key to string;
    // re-brand the entry tuples to the declared [KnobId, number[]] shape.
    const entries = Object.entries(params)
        .map(([knobId, values]) => [paramNameForKnobId(knobId), values])
        .sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0)
        return t('qeuboBookmarks.noParameters');
    return entries
        .map(([name, values]) => `${name}=${formatVector(values)}`)
        .join(', ');
}
function formatVector(values) {
    const rendered = values.map((v) => trimZeros(v.toFixed(4)));
    return rendered.length === 1 ? rendered[0] : `[${rendered.join(', ')}]`;
}
function trimZeros(s) {
    if (!s.includes('.'))
        return s;
    return s.replace(/\.?0+$/, '') || '0';
}
function onNewFromCurrent() {
    const name = window.prompt(t('qeubo.prompt.bookmarkName'));
    if (name === null)
        return;
    try {
        q.pinCurrent(name);
        pushSystemMessage('info', t('qeubo.systemMessage.bookmarkSaved', { name: name.trim() }));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        pushSystemMessage('error', t('qeubo.systemMessage.pinFailed', { msg }));
    }
}
function onApply(b) {
    q.applyBookmark(b.id);
    pushSystemMessage('info', t('qeuboBookmarks.systemMessage.applied', { name: b.name }));
}
function onRename(b) {
    const next = window.prompt(t('qeuboBookmarks.prompt.newName'), b.name);
    if (next === null)
        return;
    try {
        q.renameBookmark(b.id, next);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        pushSystemMessage('error', t('qeuboBookmarks.systemMessage.renameFailed', { msg }));
    }
}
function onDelete(b) {
    if (!window.confirm(t('qeuboBookmarks.confirm.delete', { name: b.name })))
        return;
    q.deleteBookmark(b.id);
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['bookmark-row']} */ ;
/** @type {__VLS_StyleScopedClasses['apply-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "qeubo-bookmarks" },
});
/** @type {__VLS_StyleScopedClasses['qeubo-bookmarks']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "bookmarks-header" },
});
/** @type {__VLS_StyleScopedClasses['bookmarks-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "hint" },
});
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
(__VLS_ctx.$t('qeuboBookmarks.savedCount', { n: __VLS_ctx.bookmarks.length }));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.onNewFromCurrent) },
    type: "button",
    ...{ class: "new-btn" },
    title: (__VLS_ctx.$t('qeuboBookmarks.tooltip.newFromCurrent')),
});
/** @type {__VLS_StyleScopedClasses['new-btn']} */ ;
(__VLS_ctx.$t('qeuboBookmarks.button.newFromCurrent'));
if (__VLS_ctx.bookmarks.length === 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
    i18nT;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        keypath: "qeuboBookmarks.emptyState",
        tag: "span",
    }));
    const __VLS_2 = __VLS_1({
        keypath: "qeuboBookmarks.emptyState",
        tag: "span",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    const { default: __VLS_5 } = __VLS_3.slots;
    {
        const { code: __VLS_6 } = __VLS_3.slots;
        __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
        // @ts-ignore
        [$t, $t, $t, bookmarks, bookmarks, onNewFromCurrent,];
    }
    // @ts-ignore
    [];
    var __VLS_3;
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "bookmark-list" },
    });
    /** @type {__VLS_StyleScopedClasses['bookmark-list']} */ ;
    for (const [b] of __VLS_vFor((__VLS_ctx.bookmarks))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
            key: (b.id),
            ...{ class: "bookmark-row" },
        });
        /** @type {__VLS_StyleScopedClasses['bookmark-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "bookmark-meta" },
        });
        /** @type {__VLS_StyleScopedClasses['bookmark-meta']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "bookmark-name" },
        });
        /** @type {__VLS_StyleScopedClasses['bookmark-name']} */ ;
        (b.name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "bookmark-date" },
        });
        /** @type {__VLS_StyleScopedClasses['bookmark-date']} */ ;
        (__VLS_ctx.formatDate(b.createdAt));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "bookmark-params" },
        });
        /** @type {__VLS_StyleScopedClasses['bookmark-params']} */ ;
        (__VLS_ctx.formatParameters(b.parameters));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "bookmark-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['bookmark-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.bookmarks.length === 0))
                        return;
                    __VLS_ctx.onApply(b);
                    // @ts-ignore
                    [bookmarks, formatDate, formatParameters, onApply,];
                } },
            type: "button",
            ...{ class: "apply-btn" },
            title: (__VLS_ctx.$t('qeuboBookmarks.tooltip.apply')),
        });
        /** @type {__VLS_StyleScopedClasses['apply-btn']} */ ;
        (__VLS_ctx.$t('qeuboBookmarks.button.apply'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.bookmarks.length === 0))
                        return;
                    __VLS_ctx.onRename(b);
                    // @ts-ignore
                    [$t, $t, onRename,];
                } },
            type: "button",
            ...{ class: "rename-btn" },
            title: (__VLS_ctx.$t('qeuboBookmarks.tooltip.rename')),
        });
        /** @type {__VLS_StyleScopedClasses['rename-btn']} */ ;
        (__VLS_ctx.$t('qeuboBookmarks.button.rename'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.bookmarks.length === 0))
                        return;
                    __VLS_ctx.onDelete(b);
                    // @ts-ignore
                    [$t, $t, onDelete,];
                } },
            type: "button",
            ...{ class: "delete-btn" },
            title: (__VLS_ctx.$t('qeuboBookmarks.tooltip.delete')),
        });
        /** @type {__VLS_StyleScopedClasses['delete-btn']} */ ;
        // @ts-ignore
        [$t,];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
