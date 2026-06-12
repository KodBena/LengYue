/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { store, dismissSystemMessage, clearSystemMessages } from '../../store';
const hasMessages = computed(() => store.engine.messages.length > 0);
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['clear-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "system-log-panel" },
});
/** @type {__VLS_StyleScopedClasses['system-log-panel']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "panel-header" },
});
/** @type {__VLS_StyleScopedClasses['panel-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "title" },
});
/** @type {__VLS_StyleScopedClasses['title']} */ ;
(__VLS_ctx.$t('systemLog.title'));
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.clearSystemMessages) },
    ...{ class: "clear-btn" },
    disabled: (!__VLS_ctx.hasMessages),
});
/** @type {__VLS_StyleScopedClasses['clear-btn']} */ ;
(__VLS_ctx.$t('systemLog.clearAll'));
if (__VLS_ctx.hasMessages) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "messages-list" },
    });
    /** @type {__VLS_StyleScopedClasses['messages-list']} */ ;
    for (const [msg] of __VLS_vFor((__VLS_ctx.store.engine.messages))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (msg.id),
            ...{ class: "message-row" },
            ...{ class: (`msg-${msg.type}`) },
        });
        /** @type {__VLS_StyleScopedClasses['message-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "msg-icon" },
        });
        /** @type {__VLS_StyleScopedClasses['msg-icon']} */ ;
        (msg.type === 'error' ? '❌' : (msg.type === 'warning' ? '⚠️' : 'ℹ️'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "msg-content" },
        });
        /** @type {__VLS_StyleScopedClasses['msg-content']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "msg-time" },
        });
        /** @type {__VLS_StyleScopedClasses['msg-time']} */ ;
        (new Date(msg.timestamp).toLocaleTimeString());
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "msg-text" },
        });
        /** @type {__VLS_StyleScopedClasses['msg-text']} */ ;
        (msg.text);
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.hasMessages))
                        return;
                    __VLS_ctx.dismissSystemMessage(msg.id);
                    // @ts-ignore
                    [$t, $t, clearSystemMessages, hasMessages, hasMessages, store, dismissSystemMessage,];
                } },
            ...{ class: "dismiss-btn" },
        });
        /** @type {__VLS_StyleScopedClasses['dismiss-btn']} */ ;
        // @ts-ignore
        [];
    }
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "empty-dot" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-dot']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "empty-text" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-text']} */ ;
    (__VLS_ctx.$t('systemLog.noMessages'));
}
// @ts-ignore
[$t,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
