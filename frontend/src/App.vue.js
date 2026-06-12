/// <reference types="../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * src/App.vue
 *
 * Root application component. Provides the top-level layout — the
 * resizable board/control-panel split, the tab bar, and workspace
 * auth scaffolding. The <style> block carries App-local chrome only;
 * the shared chrome classes other components consume live in
 * assets/css/shared-chrome.css (imported below, relocated 2026-06-11
 * so editing this file cannot silently restyle distant components).
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { ref as vueRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMetadata } from './composables/auth-app/useMetadata';
import { useSgfLoader } from './composables/sgf/useSgfLoader';
import { useSgfDownload } from './composables/sgf/useSgfDownload';
import { useEngineControls } from './composables/useEngineControls';
import { useUserIORegistry } from './composables/useUserIORegistry';
import { useAuth } from './composables/auth-app/useAuth';
import { workspaceIdentityKey } from './composables/auth-app/workspace-identity-key';
import { useResizablePanel } from './composables/chrome/useResizablePanel';
import { useDirtyBoardGuard } from './composables/board/useDirtyBoardGuard';
import { useAppBootstrap } from './composables/auth-app/useAppBootstrap';
import { useTransientLogReveal } from './composables/useTransientLogReveal';
import { store, activeBoard, mutateBoard, pushSystemMessage, } from './store';
import { navigateTo } from './engine/navigator';
import { KATAGO_WS_URL } from './config/env';
import { usePlayMatch } from './composables/board/usePlayFromPosition';
import { useEngineResponder } from './composables/board/useEngineResponder';
import { useBoardMoveRouting } from './composables/board/useBoardMoveRouting';
import { usePlayVsEngine } from './composables/board/usePlayVsEngine';
import { useFollowMePonder } from './composables/board/useFollowMePonder';
import BoardWidget from './components/board/BoardWidget.vue';
import SidebarWidget from './components/chrome/SidebarWidget.vue';
import TreeWidget from './components/tree/TreeWidget.vue';
import TabWidget from './components/chrome/TabWidget.vue';
import SettingsTab from './components/SettingsTab.vue';
import AnalysisControls from './components/editors/AnalysisControls.vue';
import Toolbar from './components/chrome/Toolbar.vue';
import StatusBar from './components/board/StatusBar.vue';
import MintCardModal from './components/modals/MintCardModal.vue';
import ConfirmLoadModal from './components/modals/ConfirmLoadModal.vue';
import EngineMatchModal from './components/modals/EngineMatchModal.vue';
import PlayEngineModal from './components/modals/PlayEngineModal.vue';
import ForestDirectory from './components/tree/ForestDirectory.vue';
import LibraryTab from './components/library/LibraryTab.vue';
import SystemLogPanel from './components/chrome/SystemLogPanel.vue';
import RootErrorBoundary from './components/chrome/RootErrorBoundary.vue';
import LocalePicker from './components/chrome/LocalePicker.vue';
import { useReviewSession } from './composables/review/useReviewSession';
import ColorDebugStrip from './components/charts/ColorDebugStrip.vue';
import QeuboBookmarks from './components/qeubo/QeuboBookmarks.vue';
import KnobRegistryEditor from './components/KnobRegistryEditor.vue';
useUserIORegistry();
const { t } = useI18n();
const { openFileDialog } = useSgfLoader();
const { downloadActiveBoard } = useSgfDownload();
const engineControls = useEngineControls();
const metadata = useMetadata(activeBoard);
const auth = useAuth();
const activeBoardId = computed(() => activeBoard.value?.id ?? null);
// Identity key for the control panel. Remounts the Cards / Library tabs
// when the logged-in identity changes, so user B never sees user A's
// component-instance fetched data (ForestDirectory's `roots`, LibraryTab's
// query/preview state) — the leak `resetWorkspace`'s cache registry can't
// reach, since that state lives in component instances, not module scope.
// Derivation (and why username, not userId) in workspace-identity-key.ts.
const controlPanelIdentityKey = computed(() => workspaceIdentityKey(auth.state.value));
const reviewSession = useReviewSession(activeBoardId);
const mintModalRef = vueRef(null);
const matchModalRef = vueRef(null);
const playModalRef = vueRef(null);
// "Play vs engine" responder — watches the active board's cursor +
// games map and fires engine responses at engine-turn nodes inside
// a game-root's descendant tree. Mounted at App scope so the
// watcher lives for the app lifetime; identity-flip teardown is
// handled by `resetWorkspace`'s `boards = [createInitialBoard()]`
// which bumps `boardsSetVersion` and (through the responder's
// `gamesKey` fingerprint) re-evaluates from scratch. See
// `useEngineResponder` and the play-vs-engine worklog for the
// trigger contract.
const engineResponder = useEngineResponder();
// Engine-vs-engine match controls. Lifecycle is independent of the
// singleton analysis-service: `usePlayMatch.start` opens its own
// WebSocket via `connectFresh` (matches the proxy's MAX_SESSIONS=256
// per-connection budget), runs the alternating queries, closes when
// done or stopped. The Toolbar's MATCH button toggles between
// "open the modal" (idle) and "request cooperative stop" (running)
// based on `matchControls.isRunning`.
const matchControls = usePlayMatch(activeBoardId);
function triggerMatch() {
    if (activeBoardId.value) {
        matchModalRef.value?.open();
    }
}
function handleStartMatch(opts) {
    // Match opens its own WS to the same URL the singleton uses (or
    // would use after Connect). The `||` (not `??`) is intentional so
    // an empty-string profile setting falls through to the env-var
    // default — same convention as analysis-service's `connect()`.
    const url = store.profile.settings.engine.katago.url || KATAGO_WS_URL;
    matchControls.start({
        katagoUrl: url,
        numMoves: opts.numMoves,
        black: opts.black,
        white: opts.white,
    }).catch((err) => {
        pushSystemMessage('error', t('match.failed', { error: err.message }));
    });
}
function handleStopMatch() {
    matchControls.stop();
}
// ── "Play vs Engine" wiring ──────────────────────────────────────────────────
//
// Modal surface lives in `PlayEngineModal.vue`; per-board game-root
// entries live on `BoardState.games` (schema 52). App.vue owns the
// modal ref and the open trigger, matching the existing modal pattern
// (MintCardModal, EngineMatchModal, ConfirmLoadModal); the game-session
// policy (start/end/heads + the synchronous engine kick when the start
// position is the engine's turn) lives in `usePlayVsEngine`.
function triggerPlay() {
    if (activeBoardId.value) {
        playModalRef.value?.open();
    }
}
const { handleStartGame, handleEndGame, activeBoardGameHeadIds } = usePlayVsEngine(engineResponder);
// "Follow Me" ponder watcher — restarts pondering on same-board
// navigation (board switches deliberately excluded). Watcher scope:
// App lifetime. See the composable for the trigger contract.
useFollowMePonder();
function triggerMint() {
    if (activeBoardId.value) {
        mintModalRef.value?.open(activeBoardId.value);
    }
}
function handleUpdateKomi(newKomi) {
    if (!activeBoard.value || isNaN(newKomi))
        return;
    mutateBoard(activeBoard.value.id, draft => {
        const root = draft.nodes[draft.rootNodeId];
        if (root) {
            root.properties['KM'] = [newKomi.toString()];
        }
    });
}
const confirmLoadModalRef = vueRef(null);
const { handleLoadCard, handleLoadLibraryGame, handleLoadLibraryGameInNewBoard, } = useDirtyBoardGuard(confirmLoadModalRef);
const { startResize } = useResizablePanel();
const { sync } = useAppBootstrap(auth);
// Transient auto-reveal of the system-log panel on error/warning
// arrivals when `systemLogExpanded` is false. See the composable for
// the UX rationale and timer mechanics.
const transientLogReveal = useTransientLogReveal();
// Computed so the labels re-evaluate on locale change. The TabWidget
// renders `tab.label` directly; Vue's reactivity passes through the
// prop, so a locale flip propagates without per-tab re-mounting.
const controlTabs = computed(() => [
    { id: 'library', label: t('app.tabs.library') },
    { id: 'cards', label: t('app.tabs.cards') },
    { id: 'settings', label: t('app.tabs.settings') },
    { id: 'analysis', label: t('app.tabs.analysis') },
    { id: 'other', label: t('app.tabs.other') },
]);
// Board-mutation entry points (click-to-play + paste-PV), routed
// through the grading-integrity gate: AWAITING_MOVE moves go to the
// review session's graded single-move handler, transient SR states
// refuse board mutation, and free play (with the play-vs-engine
// head trigger) is an IDLE/FINISHED-only affordance. Policy +
// rationale live in the composable; tier-3 tests pin the gating.
const { handleBoardMove, handlePastePv } = useBoardMoveRouting(reviewSession, engineResponder);
// Tightened from `nodeId: string` to `nodeId: NodeId` to match
// TreeWidget's tightened `select-node` emit signature. The handler
// now receives the branded type directly; navigateTo (which expects
// NodeId) is satisfied without a cast.
function handleNodeSelect(nodeId) {
    if (!activeBoard.value)
        return;
    mutateBoard(activeBoard.value.id, draft => navigateTo(draft, nodeId));
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
const __VLS_0 = RootErrorBoundary || RootErrorBoundary;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_5;
const { default: __VLS_6 } = __VLS_3.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "main-area",
});
const __VLS_7 = MintCardModal;
// @ts-ignore
const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
    ref: "mintModalRef",
}));
const __VLS_9 = __VLS_8({
    ref: "mintModalRef",
}, ...__VLS_functionalComponentArgsRest(__VLS_8));
var __VLS_12;
var __VLS_10;
const __VLS_14 = ConfirmLoadModal;
// @ts-ignore
const __VLS_15 = __VLS_asFunctionalComponent1(__VLS_14, new __VLS_14({
    ref: "confirmLoadModalRef",
}));
const __VLS_16 = __VLS_15({
    ref: "confirmLoadModalRef",
}, ...__VLS_functionalComponentArgsRest(__VLS_15));
var __VLS_19;
var __VLS_17;
const __VLS_21 = EngineMatchModal;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({
    ...{ 'onStartMatch': {} },
    ref: "matchModalRef",
}));
const __VLS_23 = __VLS_22({
    ...{ 'onStartMatch': {} },
    ref: "matchModalRef",
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
let __VLS_26;
const __VLS_27 = {
    ...{ startMatch: {} },
    onStartMatch: (__VLS_ctx.handleStartMatch),
};
var __VLS_28;
var __VLS_24;
var __VLS_25;
const __VLS_30 = PlayEngineModal;
// @ts-ignore
const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({
    ...{ 'onStartGame': {} },
    ...{ 'onEndGame': {} },
    ref: "playModalRef",
}));
const __VLS_32 = __VLS_31({
    ...{ 'onStartGame': {} },
    ...{ 'onEndGame': {} },
    ref: "playModalRef",
}, ...__VLS_functionalComponentArgsRest(__VLS_31));
let __VLS_35;
const __VLS_36 = {
    ...{ startGame: {} },
    onStartGame: (__VLS_ctx.handleStartGame),
    ...{ endGame: {} },
    onEndGame: (__VLS_ctx.handleEndGame),
};
var __VLS_37;
var __VLS_33;
var __VLS_34;
const __VLS_39 = SidebarWidget;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent1(__VLS_39, new __VLS_39({
    ...{ 'onLoadSgf': {} },
    ...{ 'onSaveSgf': {} },
}));
const __VLS_41 = __VLS_40({
    ...{ 'onLoadSgf': {} },
    ...{ 'onSaveSgf': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_40));
let __VLS_44;
const __VLS_45 = {
    ...{ loadSgf: {} },
    onLoadSgf: (__VLS_ctx.openFileDialog),
    ...{ saveSgf: {} },
    onSaveSgf: (__VLS_ctx.downloadActiveBoard),
};
__VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.store.session.ui.sidebarExpanded) }, null, null);
var __VLS_42;
var __VLS_43;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "main-workspace",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "top-nav-bar" },
});
/** @type {__VLS_StyleScopedClasses['top-nav-bar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.store.session.ui.sidebarExpanded = !__VLS_ctx.store.session.ui.sidebarExpanded;
            // @ts-ignore
            [handleStartMatch, handleStartGame, handleEndGame, openFileDialog, downloadActiveBoard, store, store, store,];
        } },
    ...{ class: "collapse-btn" },
    title: (__VLS_ctx.$t('app.chrome.toggleSidebar')),
});
/** @type {__VLS_StyleScopedClasses['collapse-btn']} */ ;
(__VLS_ctx.store.session.ui.sidebarExpanded ? '◀' : '▶');
const __VLS_46 = Toolbar;
// @ts-ignore
const __VLS_47 = __VLS_asFunctionalComponent1(__VLS_46, new __VLS_46({
    ...{ 'onToggleEngine': {} },
    ...{ 'onMintCard': {} },
    ...{ 'onOpenMatch': {} },
    ...{ 'onStopMatch': {} },
    ...{ 'onOpenPlay': {} },
    isMatchRunning: (__VLS_ctx.matchControls.isRunning.value),
    ...{ style: {} },
}));
const __VLS_48 = __VLS_47({
    ...{ 'onToggleEngine': {} },
    ...{ 'onMintCard': {} },
    ...{ 'onOpenMatch': {} },
    ...{ 'onStopMatch': {} },
    ...{ 'onOpenPlay': {} },
    isMatchRunning: (__VLS_ctx.matchControls.isRunning.value),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_47));
let __VLS_51;
const __VLS_52 = {
    ...{ toggleEngine: {} },
    onToggleEngine: (__VLS_ctx.engineControls.toggle),
    ...{ mintCard: {} },
    onMintCard: (__VLS_ctx.triggerMint),
    ...{ openMatch: {} },
    onOpenMatch: (__VLS_ctx.triggerMatch),
    ...{ stopMatch: {} },
    onStopMatch: (__VLS_ctx.handleStopMatch),
    ...{ openPlay: {} },
    onOpenPlay: (__VLS_ctx.triggerPlay),
};
var __VLS_49;
var __VLS_50;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "right-toggles" },
});
/** @type {__VLS_StyleScopedClasses['right-toggles']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.store.session.ui.boardExpanded = !__VLS_ctx.store.session.ui.boardExpanded;
            // @ts-ignore
            [store, store, store, $t, matchControls, engineControls, triggerMint, triggerMatch, handleStopMatch, triggerPlay,];
        } },
    ...{ class: "collapse-btn" },
    title: (__VLS_ctx.$t('app.chrome.toggleBoard')),
});
/** @type {__VLS_StyleScopedClasses['collapse-btn']} */ ;
(__VLS_ctx.store.session.ui.boardExpanded ? '▶' : '◀');
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.store.session.ui.treeExpanded = !__VLS_ctx.store.session.ui.treeExpanded;
            // @ts-ignore
            [store, store, store, $t,];
        } },
    ...{ class: "collapse-btn" },
    title: (__VLS_ctx.$t('app.chrome.toggleTree')),
});
/** @type {__VLS_StyleScopedClasses['collapse-btn']} */ ;
(__VLS_ctx.store.session.ui.treeExpanded ? '▶' : '◀');
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.store.session.ui.controlsExpanded = !__VLS_ctx.store.session.ui.controlsExpanded;
            // @ts-ignore
            [store, store, store, $t,];
        } },
    ...{ class: "collapse-btn" },
    title: (__VLS_ctx.$t('app.chrome.toggleControls')),
});
/** @type {__VLS_StyleScopedClasses['collapse-btn']} */ ;
(__VLS_ctx.store.session.ui.controlsExpanded ? '▶' : '◀');
const __VLS_53 = LocalePicker;
// @ts-ignore
const __VLS_54 = __VLS_asFunctionalComponent1(__VLS_53, new __VLS_53({}));
const __VLS_55 = __VLS_54({}, ...__VLS_functionalComponentArgsRest(__VLS_54));
if (__VLS_ctx.store.session.ui.systemLogExpanded || __VLS_ctx.transientLogReveal) {
    const __VLS_58 = SystemLogPanel;
    // @ts-ignore
    const __VLS_59 = __VLS_asFunctionalComponent1(__VLS_58, new __VLS_58({}));
    const __VLS_60 = __VLS_59({}, ...__VLS_functionalComponentArgsRest(__VLS_59));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "split-workspace",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "board-column",
    ...{ style: (__VLS_ctx.store.session.ui.boardSquareMaxWidthPx
            ? { '--board-target-px': __VLS_ctx.store.session.ui.boardSquareMaxWidthPx + 'px' }
            : {}) },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.store.session.ui.boardExpanded) }, null, null);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "content",
});
if (__VLS_ctx.activeBoard) {
    const __VLS_63 = BoardWidget;
    // @ts-ignore
    const __VLS_64 = __VLS_asFunctionalComponent1(__VLS_63, new __VLS_63({
        ...{ 'onMove': {} },
        ...{ 'onPastePv': {} },
        key: (__VLS_ctx.activeBoard.id),
        state: (__VLS_ctx.activeBoard),
    }));
    const __VLS_65 = __VLS_64({
        ...{ 'onMove': {} },
        ...{ 'onPastePv': {} },
        key: (__VLS_ctx.activeBoard.id),
        state: (__VLS_ctx.activeBoard),
    }, ...__VLS_functionalComponentArgsRest(__VLS_64));
    let __VLS_68;
    const __VLS_69 = {
        ...{ move: {} },
        onMove: (__VLS_ctx.handleBoardMove),
        ...{ pastePv: {} },
        onPastePv: (__VLS_ctx.handlePastePv),
    };
    var __VLS_66;
    var __VLS_67;
}
if (__VLS_ctx.activeBoard) {
    const __VLS_70 = StatusBar;
    // @ts-ignore
    const __VLS_71 = __VLS_asFunctionalComponent1(__VLS_70, new __VLS_70({
        ...{ 'onUpdateKomi': {} },
        board: (__VLS_ctx.activeBoard),
        metadata: (__VLS_ctx.metadata),
    }));
    const __VLS_72 = __VLS_71({
        ...{ 'onUpdateKomi': {} },
        board: (__VLS_ctx.activeBoard),
        metadata: (__VLS_ctx.metadata),
    }, ...__VLS_functionalComponentArgsRest(__VLS_71));
    let __VLS_75;
    const __VLS_76 = {
        ...{ updateKomi: {} },
        onUpdateKomi: (__VLS_ctx.handleUpdateKomi),
    };
    var __VLS_73;
    var __VLS_74;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "vue-tree-panel",
});
__VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.store.session.ui.treeExpanded) }, null, null);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "tree-panel-header",
});
(__VLS_ctx.$t('app.chrome.gameTreePanelHeader'));
if (__VLS_ctx.activeBoard) {
    const __VLS_77 = TreeWidget;
    // @ts-ignore
    const __VLS_78 = __VLS_asFunctionalComponent1(__VLS_77, new __VLS_77({
        ...{ 'onSelectNode': {} },
        nodes: (__VLS_ctx.activeBoard.nodes),
        boardId: (__VLS_ctx.activeBoard.id),
        gameHeadIds: (__VLS_ctx.activeBoardGameHeadIds),
    }));
    const __VLS_79 = __VLS_78({
        ...{ 'onSelectNode': {} },
        nodes: (__VLS_ctx.activeBoard.nodes),
        boardId: (__VLS_ctx.activeBoard.id),
        gameHeadIds: (__VLS_ctx.activeBoardGameHeadIds),
    }, ...__VLS_functionalComponentArgsRest(__VLS_78));
    let __VLS_82;
    const __VLS_83 = {
        ...{ selectNode: {} },
        onSelectNode: (__VLS_ctx.handleNodeSelect),
    };
    var __VLS_80;
    var __VLS_81;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onMousedown: (__VLS_ctx.startResize) },
    ...{ class: "panel-resizer" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.store.session.ui.controlsExpanded) }, null, null);
/** @type {__VLS_StyleScopedClasses['panel-resizer']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "control-panel",
    ...{ style: ({ flex: '1 1 0', minWidth: '220px' }) },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.store.session.ui.controlsExpanded) }, null, null);
const __VLS_84 = TabWidget || TabWidget;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent1(__VLS_84, new __VLS_84({
    key: (__VLS_ctx.controlPanelIdentityKey),
    tabs: (__VLS_ctx.controlTabs),
    modelValue: __VLS_ctx.store.session.ui.activeTab /* widen the tab-id union to TabWidget's string v-model */,
}));
const __VLS_86 = __VLS_85({
    key: (__VLS_ctx.controlPanelIdentityKey),
    tabs: (__VLS_ctx.controlTabs),
    modelValue: __VLS_ctx.store.session.ui.activeTab /* widen the tab-id union to TabWidget's string v-model */,
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
const { default: __VLS_89 } = __VLS_87.slots;
{
    const { library: __VLS_90 } = __VLS_87.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ style: {} },
    });
    const __VLS_91 = LibraryTab;
    // @ts-ignore
    const __VLS_92 = __VLS_asFunctionalComponent1(__VLS_91, new __VLS_91({
        ...{ 'onOpenLibraryGame': {} },
        ...{ 'onOpenLibraryGameNewTab': {} },
    }));
    const __VLS_93 = __VLS_92({
        ...{ 'onOpenLibraryGame': {} },
        ...{ 'onOpenLibraryGameNewTab': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_92));
    let __VLS_96;
    const __VLS_97 = {
        ...{ openLibraryGame: {} },
        onOpenLibraryGame: (__VLS_ctx.handleLoadLibraryGame),
        ...{ openLibraryGameNewTab: {} },
        onOpenLibraryGameNewTab: (__VLS_ctx.handleLoadLibraryGameInNewBoard),
    };
    var __VLS_94;
    var __VLS_95;
    // @ts-ignore
    [store, store, store, store, store, store, store, store, store, $t, $t, transientLogReveal, activeBoard, activeBoard, activeBoard, activeBoard, activeBoard, activeBoard, activeBoard, activeBoard, handleBoardMove, handlePastePv, metadata, handleUpdateKomi, activeBoardGameHeadIds, handleNodeSelect, startResize, controlPanelIdentityKey, controlTabs, handleLoadLibraryGame, handleLoadLibraryGameInNewBoard,];
}
{
    const { cards: __VLS_98 } = __VLS_87.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ style: {} },
    });
    const __VLS_99 = ForestDirectory;
    // @ts-ignore
    const __VLS_100 = __VLS_asFunctionalComponent1(__VLS_99, new __VLS_99({
        ...{ 'onLoadCard': {} },
    }));
    const __VLS_101 = __VLS_100({
        ...{ 'onLoadCard': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_100));
    let __VLS_104;
    const __VLS_105 = {
        ...{ loadCard: {} },
        onLoadCard: (__VLS_ctx.handleLoadCard),
    };
    var __VLS_102;
    var __VLS_103;
    // @ts-ignore
    [handleLoadCard,];
}
{
    const { settings: __VLS_106 } = __VLS_87.slots;
    const __VLS_107 = SettingsTab;
    // @ts-ignore
    const __VLS_108 = __VLS_asFunctionalComponent1(__VLS_107, new __VLS_107({
        ...{ 'onForceSave': {} },
    }));
    const __VLS_109 = __VLS_108({
        ...{ 'onForceSave': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_108));
    let __VLS_112;
    const __VLS_113 = {
        ...{ forceSave: {} },
        onForceSave: (...[$event]) => {
            __VLS_ctx.sync.forceSave();
            // @ts-ignore
            [sync,];
        },
    };
    var __VLS_110;
    var __VLS_111;
    // @ts-ignore
    [];
}
{
    const { analysis: __VLS_114 } = __VLS_87.slots;
    if (__VLS_ctx.activeBoard) {
        const __VLS_115 = AnalysisControls;
        // @ts-ignore
        const __VLS_116 = __VLS_asFunctionalComponent1(__VLS_115, new __VLS_115({
            boardId: (__VLS_ctx.activeBoard.id),
        }));
        const __VLS_117 = __VLS_116({
            boardId: (__VLS_ctx.activeBoard.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_116));
    }
    // @ts-ignore
    [activeBoard, activeBoard,];
}
{
    const { other: __VLS_120 } = __VLS_87.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tab-padding" },
    });
    /** @type {__VLS_StyleScopedClasses['tab-padding']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
        ...{ class: "sub-header" },
    });
    /** @type {__VLS_StyleScopedClasses['sub-header']} */ ;
    (__VLS_ctx.$t('other.section.knobRegistry'));
    const __VLS_121 = KnobRegistryEditor;
    // @ts-ignore
    const __VLS_122 = __VLS_asFunctionalComponent1(__VLS_121, new __VLS_121({}));
    const __VLS_123 = __VLS_122({}, ...__VLS_functionalComponentArgsRest(__VLS_122));
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
        ...{ class: "sub-header section-divider" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['sub-header']} */ ;
    /** @type {__VLS_StyleScopedClasses['section-divider']} */ ;
    (__VLS_ctx.$t('other.section.gradientCalibration'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hue-slider-hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hue-slider-hint']} */ ;
    (__VLS_ctx.$t('other.label.gradientCalibrationNotice'));
    const __VLS_126 = ColorDebugStrip;
    // @ts-ignore
    const __VLS_127 = __VLS_asFunctionalComponent1(__VLS_126, new __VLS_126({
        steps: (500),
    }));
    const __VLS_128 = __VLS_127({
        steps: (500),
    }, ...__VLS_functionalComponentArgsRest(__VLS_127));
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
        ...{ class: "sub-header section-divider" },
        ...{ style: {} },
    });
    /** @type {__VLS_StyleScopedClasses['sub-header']} */ ;
    /** @type {__VLS_StyleScopedClasses['section-divider']} */ ;
    (__VLS_ctx.$t('other.section.qeuboBookmarks'));
    const __VLS_131 = QeuboBookmarks;
    // @ts-ignore
    const __VLS_132 = __VLS_asFunctionalComponent1(__VLS_131, new __VLS_131({}));
    const __VLS_133 = __VLS_132({}, ...__VLS_functionalComponentArgsRest(__VLS_132));
    // @ts-ignore
    [$t, $t, $t, $t,];
}
// @ts-ignore
[];
var __VLS_87;
// @ts-ignore
[];
var __VLS_3;
// @ts-ignore
var __VLS_13 = __VLS_12, __VLS_20 = __VLS_19, __VLS_29 = __VLS_28, __VLS_38 = __VLS_37;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
