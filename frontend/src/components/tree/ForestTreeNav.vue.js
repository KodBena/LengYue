/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
const props = defineProps();
// Render-cap threshold: a game whose root count exceeds this gets
// its first VIRT_THRESHOLD roots rendered plus a "+ N more"
// affordance instead of all roots DOM-mounted at once. Render-cap
// (vs. true virtual scrolling) is sufficient because the user's
// recovery move is to refine the parent game selection rather than
// scroll a long list — file-manager idiom expects a manageable child
// count per node.
const VIRT_THRESHOLD = 50;
function isExpanded(game) {
    return props.nav.expanded.value.has(game.nodeId);
}
function isSelected(target) {
    const sel = props.nav.selection.value;
    if (!sel || sel.kind !== target.kind)
        return false;
    if (sel.kind === 'game' && target.kind === 'game') {
        return sel.gameSourceId === target.gameSourceId;
    }
    if (sel.kind === 'root' && target.kind === 'root') {
        return sel.rootCardId === target.rootCardId;
    }
    return false;
}
function selectGame(game) {
    props.nav.select({ kind: 'game', gameSourceId: game.gameSourceId });
}
function selectRoot(rootCardId) {
    props.nav.select({ kind: 'root', rootCardId });
}
function visibleRoots(game) {
    return game.roots.length <= VIRT_THRESHOLD
        ? game.roots
        : game.roots.slice(0, VIRT_THRESHOLD);
}
function hiddenCount(game) {
    return Math.max(0, game.roots.length - VIRT_THRESHOLD);
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
/** @type {__VLS_StyleScopedClasses['game-row']} */ ;
/** @type {__VLS_StyleScopedClasses['game-row']} */ ;
/** @type {__VLS_StyleScopedClasses['chevron-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['root-row']} */ ;
/** @type {__VLS_StyleScopedClasses['root-row']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "forest-tree-nav" },
});
/** @type {__VLS_StyleScopedClasses['forest-tree-nav']} */ ;
if (__VLS_ctx.nav.nodes.value.length === 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-state" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
    (__VLS_ctx.$t('cards.browse.noGames'));
}
for (const [game] of __VLS_vFor((__VLS_ctx.nav.nodes.value))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (game.nodeId),
        ...{ class: "game-block" },
    });
    /** @type {__VLS_StyleScopedClasses['game-block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectGame(game);
                // @ts-ignore
                [nav, nav, $t, selectGame,];
            } },
        ...{ class: "game-row" },
        ...{ class: ({ selected: __VLS_ctx.isSelected({ kind: 'game', gameSourceId: game.gameSourceId }) }) },
    });
    /** @type {__VLS_StyleScopedClasses['game-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['selected']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.nav.toggle(game.nodeId);
                // @ts-ignore
                [nav, isSelected,];
            } },
        ...{ class: "chevron-btn" },
        title: (__VLS_ctx.isExpanded(game) ? __VLS_ctx.$t('cards.browse.collapse') : __VLS_ctx.$t('cards.browse.expand')),
    });
    /** @type {__VLS_StyleScopedClasses['chevron-btn']} */ ;
    (__VLS_ctx.isExpanded(game) ? '▾' : '▸');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "game-meta" },
    });
    /** @type {__VLS_StyleScopedClasses['game-meta']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "game-title" },
    });
    /** @type {__VLS_StyleScopedClasses['game-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "game-title-text" },
    });
    /** @type {__VLS_StyleScopedClasses['game-title-text']} */ ;
    (game.title);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "game-id" },
        title: (__VLS_ctx.$t('cards.browse.gameIdTooltip', ['${N}'])),
    });
    /** @type {__VLS_StyleScopedClasses['game-id']} */ ;
    (game.gameSourceId);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "game-aggregate" },
    });
    /** @type {__VLS_StyleScopedClasses['game-aggregate']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.$t('cards.browse.rootCount', game.aggregate.rootCount));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        title: (__VLS_ctx.$t('cards.browse.statTotalCards')),
    });
    (game.aggregate.totalCards);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        title: (__VLS_ctx.$t('cards.browse.statTotalReviews')),
    });
    (game.aggregate.totalReviews);
    if (game.aggregate.totalReviews > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            title: (__VLS_ctx.$t('cards.browse.statAverageRecallWeighted')),
        });
        (game.aggregate.averageRecall.toFixed(2));
    }
    if (__VLS_ctx.isExpanded(game)) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "root-list" },
        });
        /** @type {__VLS_StyleScopedClasses['root-list']} */ ;
        for (const [root] of __VLS_vFor((__VLS_ctx.visibleRoots(game)))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.isExpanded(game)))
                            return;
                        __VLS_ctx.selectRoot(root.rootCardId);
                        // @ts-ignore
                        [$t, $t, $t, $t, $t, $t, $t, isExpanded, isExpanded, isExpanded, visibleRoots, selectRoot,];
                    } },
                key: (root.nodeId),
                ...{ class: "root-row" },
                ...{ class: ({ selected: __VLS_ctx.isSelected({ kind: 'root', rootCardId: root.rootCardId }) }) },
            });
            /** @type {__VLS_StyleScopedClasses['root-row']} */ ;
            /** @type {__VLS_StyleScopedClasses['selected']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "root-title" },
            });
            /** @type {__VLS_StyleScopedClasses['root-title']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "root-title-text" },
            });
            /** @type {__VLS_StyleScopedClasses['root-title-text']} */ ;
            (root.stat.description || __VLS_ctx.$t('cards.browse.unnamedRoot'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "root-id" },
                title: (__VLS_ctx.$t('cards.browse.rootIdTooltip')),
            });
            /** @type {__VLS_StyleScopedClasses['root-id']} */ ;
            (root.rootCardId);
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "root-meta" },
            });
            /** @type {__VLS_StyleScopedClasses['root-meta']} */ ;
            (root.stat.playerBlack || __VLS_ctx.$t('cards.browse.unknownPlayer'));
            (__VLS_ctx.$t('cards.browse.versus'));
            (root.stat.playerWhite || __VLS_ctx.$t('cards.browse.unknownPlayer'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "root-stats" },
            });
            /** @type {__VLS_StyleScopedClasses['root-stats']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                title: (__VLS_ctx.$t('cards.browse.statTotalCards')),
            });
            (root.stat.totalCards);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                title: (__VLS_ctx.$t('cards.browse.statTotalReviews')),
            });
            (root.stat.totalReviews);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                title: (__VLS_ctx.$t('cards.browse.statAverageRecall')),
            });
            (root.stat.averageRecall.toFixed(2));
            // @ts-ignore
            [$t, $t, $t, $t, $t, $t, $t, $t, isSelected,];
        }
        if (__VLS_ctx.hiddenCount(game) > 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "more-affordance" },
            });
            /** @type {__VLS_StyleScopedClasses['more-affordance']} */ ;
            (__VLS_ctx.$t('cards.browse.moreAffordance', { n: __VLS_ctx.hiddenCount(game) }));
        }
    }
    // @ts-ignore
    [$t, hiddenCount, hiddenCount,];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
