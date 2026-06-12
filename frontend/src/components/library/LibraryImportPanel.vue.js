/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
const props = defineProps();
function onDrop(ev) {
    ev.preventDefault();
    if (ev.dataTransfer?.items) {
        void props.imp.dropItems(ev.dataTransfer.items);
    }
}
function onDragOver(ev) {
    ev.preventDefault();
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
/** @type {__VLS_StyleScopedClasses['library-import-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['library-import-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['is-active']} */ ;
/** @type {__VLS_StyleScopedClasses['import-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onDrop: (__VLS_ctx.onDrop) },
    ...{ onDragover: (__VLS_ctx.onDragOver) },
    ...{ class: "library-import-panel" },
    ...{ class: ({ 'is-active': __VLS_ctx.imp.phase.value !== 'idle' }) },
});
/** @type {__VLS_StyleScopedClasses['library-import-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['is-active']} */ ;
if (__VLS_ctx.imp.phase.value === 'idle') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "import-idle" },
    });
    /** @type {__VLS_StyleScopedClasses['import-idle']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "import-hint" },
    });
    /** @type {__VLS_StyleScopedClasses['import-hint']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "import-buttons" },
    });
    /** @type {__VLS_StyleScopedClasses['import-buttons']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.imp.pickFiles) },
        ...{ class: "import-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['import-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.imp.pickDirectory) },
        ...{ class: "import-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['import-btn']} */ ;
}
else if (__VLS_ctx.imp.phase.value === 'reading') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "import-progress" },
    });
    /** @type {__VLS_StyleScopedClasses['import-progress']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.imp.progress.filesRead);
    (__VLS_ctx.imp.progress.filesTotal);
}
else if (__VLS_ctx.imp.phase.value === 'uploading') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "import-progress" },
    });
    /** @type {__VLS_StyleScopedClasses['import-progress']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.imp.progress.chunksUploaded);
    (__VLS_ctx.imp.progress.chunksTotal);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "import-counts" },
    });
    /** @type {__VLS_StyleScopedClasses['import-counts']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "ok" },
    });
    /** @type {__VLS_StyleScopedClasses['ok']} */ ;
    (__VLS_ctx.imp.progress.counts.created);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.imp.progress.counts.deduplicated);
    if (__VLS_ctx.imp.progress.counts.errored > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "err" },
        });
        /** @type {__VLS_StyleScopedClasses['err']} */ ;
        (__VLS_ctx.imp.progress.counts.errored);
    }
}
else if (__VLS_ctx.imp.phase.value === 'done') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "import-done" },
    });
    /** @type {__VLS_StyleScopedClasses['import-done']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.imp.progress.counts.created);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "muted" },
    });
    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    (__VLS_ctx.imp.progress.counts.deduplicated);
    if (__VLS_ctx.imp.progress.counts.errored > 0) {
        (__VLS_ctx.imp.progress.counts.errored);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.imp.reset) },
        ...{ class: "import-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['import-btn']} */ ;
}
else if (__VLS_ctx.imp.phase.value === 'errored') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "import-error" },
    });
    /** @type {__VLS_StyleScopedClasses['import-error']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "err" },
    });
    /** @type {__VLS_StyleScopedClasses['err']} */ ;
    (__VLS_ctx.imp.errorMessage.value);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.imp.reset) },
        ...{ class: "import-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['import-btn']} */ ;
}
// @ts-ignore
[onDrop, onDragOver, imp, imp, imp, imp, imp, imp, imp, imp, imp, imp, imp, imp, imp, imp, imp, imp, imp, imp, imp, imp, imp, imp, imp,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
