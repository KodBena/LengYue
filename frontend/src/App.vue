<script setup lang="ts">
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
import { computed, watch } from 'vue';
import { ref as vueRef } from 'vue';
import { useI18n } from 'vue-i18n';

import { useMetadata }       from './composables/auth-app/useMetadata';
import { useSgfLoader }      from './composables/sgf/useSgfLoader';
import { useSgfDownload }    from './composables/sgf/useSgfDownload';
import { useEngineControls } from './composables/useEngineControls';
import { useUserIORegistry } from './composables/useUserIORegistry';
import { useAuth }           from './composables/auth-app/useAuth';
import { workspaceIdentityKey } from './composables/auth-app/workspace-identity-key';
import { useResizablePanel, CONTROL_PANEL_MIN_WIDTH_PX } from './composables/chrome/useResizablePanel';
import { useDirtyBoardGuard } from './composables/board/useDirtyBoardGuard';
import { useAppBootstrap } from './composables/auth-app/useAppBootstrap';
import { useTransientLogReveal } from './composables/useTransientLogReveal';
import { mintDialogRequestCount } from './composables/useMintDialogSignal';
import { passRequestCount } from './composables/board/usePassSignal';
import { setupWizardOpen, openSetupWizard } from './composables/useSetupWizardSignal';
import {
  store,
  activeBoard,
  mutateBoard,
  pushSystemMessage,
  touchSession,
} from './store';

import type { BoardId, NodeId, UISession }   from './types';
import { navigateTo }     from './engine/navigator';
import type { RulesetName } from './engine/rulesets';

import { KATAGO_WS_URL } from './config/env';
import { usePlayMatch } from './composables/board/usePlayFromPosition';
import { useEngineResponder } from './composables/board/useEngineResponder';
import { useBoardMoveRouting } from './composables/board/useBoardMoveRouting';
import { usePlayVsEngine } from './composables/board/usePlayVsEngine';
import { useKnownPositionNodes } from './composables/board/useKnownPositionNodes';
import { useFollowMePonder } from './composables/board/useFollowMePonder';

import BoardWidget      from './components/board/BoardWidget.vue';
import SidebarWidget    from './components/chrome/SidebarWidget.vue';
import TreeWidget       from './components/tree/TreeWidget.vue';
import TabWidget        from './components/chrome/TabWidget.vue';
import SettingsTab      from './components/SettingsTab.vue';
import AnalysisControls from './components/editors/AnalysisControls.vue';
import Toolbar          from './components/chrome/Toolbar.vue';
import StatusBar        from './components/board/StatusBar.vue';
import MintCardModal    from './components/modals/MintCardModal.vue';
import LearnPathModal   from './components/modals/LearnPathModal.vue';
import { getPendingMintNodeIds } from './composables/cards/learn-path-pending-markers';
import ConfirmLoadModal from './components/modals/ConfirmLoadModal.vue';
import EngineMatchModal from './components/modals/EngineMatchModal.vue';
import PlayEngineModal  from './components/modals/PlayEngineModal.vue';
import SetupWizardModal from './components/wizard/SetupWizardModal.vue';
import AppConfirmDialog from './components/modals/AppConfirmDialog.vue';
import AppPromptDialog  from './components/modals/AppPromptDialog.vue';
import ForestDirectory  from './components/tree/ForestDirectory.vue';
import LibraryTab       from './components/library/LibraryTab.vue';
import SystemLogPanel   from './components/chrome/SystemLogPanel.vue';
import RootErrorBoundary from './components/chrome/RootErrorBoundary.vue';
import LocalePicker     from './components/chrome/LocalePicker.vue';

import { useReviewSession } from './composables/review/useReviewSession';
import ColorDebugStrip  from './components/charts/ColorDebugStrip.vue';
import QeuboBookmarks   from './components/qeubo/QeuboBookmarks.vue';
import KnobRegistryEditor from './components/KnobRegistryEditor.vue';
import VisitsLerpConfig from './components/VisitsLerpConfig.vue';
import PerQueryOverridesConfig from './components/PerQueryOverridesConfig.vue';

useUserIORegistry();

const { t } = useI18n();
const { openFileDialog } = useSgfLoader();
const { downloadActiveBoard } = useSgfDownload();
const engineControls     = useEngineControls();
const metadata           = useMetadata(activeBoard);
const auth               = useAuth();

const activeBoardId = computed<BoardId | null>(() => activeBoard.value?.id ?? null);
// "Learn this path" pre-mint markers (ledger row 718) — reads the
// module-scope registry `LearnPathModal` writes to via `useLearnPath`;
// see `learn-path-pending-markers.ts` for why this lives at module
// scope rather than as a prop threaded from the modal (siblings, not
// parent/child).
const activeBoardPendingMintIds = computed(() =>
  activeBoardId.value ? getPendingMintNodeIds(activeBoardId.value) : undefined,
);

// Identity key for the control panel. Remounts the Cards / Library tabs
// when the logged-in identity changes, so user B never sees user A's
// component-instance fetched data (ForestDirectory's `roots`, LibraryTab's
// query/preview state) — the leak `resetWorkspace`'s cache registry can't
// reach, since that state lives in component instances, not module scope.
// Derivation (and why username, not userId) in workspace-identity-key.ts.
const controlPanelIdentityKey = computed(() => workspaceIdentityKey(auth.state.value));
const reviewSession = useReviewSession(activeBoardId);
const mintModalRef = vueRef<InstanceType<typeof MintCardModal> | null>(null);
const learnPathModalRef = vueRef<InstanceType<typeof LearnPathModal> | null>(null);
const matchModalRef = vueRef<InstanceType<typeof EngineMatchModal> | null>(null);
const playModalRef  = vueRef<InstanceType<typeof PlayEngineModal>  | null>(null);

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

function handleStartMatch(opts: {
  numMoves: number;
  black: { model?: string; maxVisits: number };
  white: { model?: string; maxVisits: number };
}) {
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
  }).catch((err: Error) => {
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

const { handleStartGame, handleEndGame, activeBoardGameHeadIds } =
  usePlayVsEngine(engineResponder);

// card-position-annotations Stage B: the known-position highlight set
// (cache ∩ known-positions) for the active board's tree, passed to
// TreeWidget the same way activeBoardGameHeadIds is.
const { activeBoardKnownPositionNodeIds } = useKnownPositionNodes();

// "Follow Me" ponder watcher — restarts pondering on same-board
// navigation (board switches deliberately excluded). Watcher scope:
// App lifetime. See the composable for the trigger contract.
useFollowMePonder();

function triggerMint() {
  if (activeBoardId.value) {
    mintModalRef.value?.open(activeBoardId.value);
  }
}

// "Learn this path" (wiki #8) — mirrors triggerMint's pattern. The
// modal's own `open()` doesn't need the precondition (loaded-card-at-
// root) checked here; useLearnPath.runLearnPath surfaces a failed
// precondition as a reported error inside the modal.
function triggerLearnPath() {
  if (activeBoardId.value) {
    learnPathModalRef.value?.open(activeBoardId.value);
  }
}

// `card.mint` keybinding entry point: the catalog is module-scope and
// has no component instance to hold `mintModalRef`, so it can't call
// `triggerMint()` directly. It instead bumps `mintDialogRequestCount`
// (`useMintDialogSignal.ts`) and this watcher — living at App scope,
// which does hold the ref — reacts by calling the same `triggerMint()`
// the Toolbar button already dispatches. No cleanup to wire: a Vue
// `watch` registered in `setup` is torn down automatically on unmount
// (umbrella CLAUDE.md's resource-ownership discipline names this as
// the automatically-cleaned case, unlike module-scope subscriptions).
watch(mintDialogRequestCount, () => {
  triggerMint();
});

// First-run setup wizard trigger (ledger slug swz-setup-wizard).
// `store.workspaceLoadState.kind` flips to 'loaded' exactly once
// hydrate has resolved — either a real persisted blob (migrated,
// `onboarding.completed` backfilled `true` by migration 69 → 70) or
// a genuinely fresh profile (never persisted; `completed` stays the
// `defaults.ts` seed of `false`). `{ immediate: true }` covers the
// already-loaded-by-mount-time race (workspaceLoadState can reach
// 'loaded' before this watcher registers, e.g. a synchronous local
// default with no remote fetch in flight); the `kind === 'loaded'`
// guard keeps it a no-op while still 'loading'/'error'. Re-running
// via Settings goes through the same `openSetupWizard()` entry point
// (`useSetupWizardSignal.ts`) and never touches this watcher.
watch(
  () => store.workspaceLoadState.kind,
  (kind) => {
    if (kind === 'loaded' && !store.profile.settings.onboarding.completed) {
      openSetupWizard();
    }
  },
  { immediate: true },
);

function handleUpdateKomi(newKomi: number) {
  if (!activeBoard.value || isNaN(newKomi)) return;
  mutateBoard(activeBoard.value.id, draft => {
    const root = draft.nodes[draft.rootNodeId];
    if (root) {
      root.properties['KM'] = [newKomi.toString()];
    }
  });
}

// Parallel to handleUpdateKomi. `newRules` is one of the four
// ruling-mandated canonical spellings (RulesetName) — StatusBar's
// dropdown only emits values drawn from RULESET_NAMES, so this writes
// the canonical spelling directly to root `RU`, no re-normalization
// needed here.
function handleUpdateRules(newRules: RulesetName) {
  if (!activeBoard.value) return;
  mutateBoard(activeBoard.value.id, draft => {
    const root = draft.nodes[draft.rootNodeId];
    if (root) {
      root.properties['RU'] = [newRules];
    }
  });
}

const confirmLoadModalRef = vueRef<InstanceType<typeof ConfirmLoadModal> | null>(null);
const {
  handleLoadCard,
  handleLoadLibraryGame,
  handleLoadLibraryGameInNewBoard,
} = useDirtyBoardGuard(confirmLoadModalRef);

const { startResizeInner, startResizeOuter, effectiveTreeControlRegionWidthPx } = useResizablePanel();

// Defect 6 (ui-fix-56), preserved as a documented, minor cosmetic
// nicety under the nested-splitter geometry (ledger rows 391/414) —
// see useResizablePanel.ts's header for the two-level nesting model
// this composes with. #split-workspace centers its row content when
// the control panel is toggled off entirely.
//
// Under the nested model this is now LARGELY (not fully) redundant
// with a structural effect: #board-column is `flex: 1 1 auto` and
// #board-square (the actual visual square) is `align-self: center`
// within it, so #board-column growing into freed space already
// re-centers the square WITHIN #board-column's own box, continuously,
// with no discrete class flip. The discrete `justify-content: center`
// here additionally centers the square across the FULL row (including
// the tree-only wrapper's own leftover width when control is hidden)
// rather than only within #board-column's box — the two differ by at
// most half the tree panel's width (~70px at the default 140px),
// judged acceptable to keep as the simpler, already-shipped mechanism
// rather than removing it and accepting that small a asymmetry as a
// visible regression. `!treeExpanded` deliberately does NOT
// participate: hiding the tree alone doesn't strand space the way
// disabling the whole control region does (the wrapper's own binding
// below already un-claims that space structurally).
const splitWorkspaceCentered = computed(() => !store.session.ui.controlsExpanded);

const { sync } = useAppBootstrap(auth);

// Transient auto-reveal of the system-log panel on error/warning
// arrivals when `systemLogExpanded` is false. See the composable for
// the UX rationale and timer mechanics.
const transientLogReveal = useTransientLogReveal();

// Computed so the labels re-evaluate on locale change. The TabWidget
// renders `tab.label` directly; Vue's reactivity passes through the
// prop, so a locale flip propagates without per-tab re-mounting.
const controlTabs = computed(() => [
  { id: 'library',  label: t('app.tabs.library')  },
  { id: 'cards',    label: t('app.tabs.cards')    },
  { id: 'settings', label: t('app.tabs.settings') },
  { id: 'analysis', label: t('app.tabs.analysis') },
  { id: 'other',    label: t('app.tabs.other')    },
]);

// Board-mutation entry points (click-to-play + paste-PV), routed
// through the grading-integrity gate: AWAITING_MOVE moves go to the
// review session's graded single-move handler, transient SR states
// refuse board mutation, and free play (with the play-vs-engine
// head trigger) is an IDLE/FINISHED-only affordance. Policy +
// rationale live in the composable; tier-3 tests pin the gating.
const { handleBoardMove, handlePass, handlePastePv } =
  useBoardMoveRouting(reviewSession, engineResponder);

// Same signal shape as `mintDialogRequestCount` above: the module-
// scope keybindings catalog can't call `handlePass` directly (it
// closes over `reviewSession`/`engineResponder`, both App-setup-
// scoped), so `board.pass`'s handler bumps `passRequestCount` and
// this watcher calls the real handler.
watch(passRequestCount, () => {
  handlePass();
});

// StatusBar's pass-button enabled state: mirrors `handlePass`'s own
// no-op arms (transient SR states, REVIEWED) so the button's
// disabled-ness never lies about what a click would do.
const canPass = computed(() =>
  reviewSession.state.value !== 'LOADING'
  && reviewSession.state.value !== 'ANALYZING'
  && reviewSession.state.value !== 'REVIEWED',
);

// Tightened from `nodeId: string` to `nodeId: NodeId` to match
// TreeWidget's tightened `select-node` emit signature. The handler
// now receives the branded type directly; navigateTo (which expects
// NodeId) is satisfied without a cast.
function handleNodeSelect(nodeId: NodeId): void {
  if (!activeBoard.value) return;
  mutateBoard(activeBoard.value.id, draft => navigateTo(draft, nodeId));
}

// Boolean keys of `UISession` — the only shape the chrome toggle below
// handles (it flips a boolean in place). Keeps the helper from being
// pointed at a non-boolean session field.
type BooleanUiKey = {
  [K in keyof UISession]-?: UISession[K] extends boolean ? K : never;
}[keyof UISession];

// Chrome panel toggle (sidebar / board / tree / controls). These are
// persisted `session.ui` flags, so the toggle bumps `touchSession()` —
// SyncService keys session persistence on the `sessionVersion` counter
// now, not a deep `store.session` watch (see `sessionVersion` in
// `store/index.ts`). Replaces the inline `@click="store.session.ui.X =
// !store.session.ui.X"` template writes, which the counter would not
// observe.
function toggleChrome(key: BooleanUiKey): void {
  store.session.ui[key] = !store.session.ui[key];
  touchSession();
}

// Control-panel active tab — persisted `session.ui.activeTab`. A
// writable computed so the TabWidget v-model write routes through
// `touchSession()` (same session-counter reason as `toggleChrome`).
const activeTab = computed<string>({
  get: () => store.session.ui.activeTab,
  set: (v) => {
    store.session.ui.activeTab = v;
    touchSession();
  },
});

</script>

<template>
  <RootErrorBoundary>
  <div id="main-area">
    <SetupWizardModal v-if="setupWizardOpen" />
    <AppConfirmDialog />
    <AppPromptDialog />
    <MintCardModal ref="mintModalRef" />
    <LearnPathModal ref="learnPathModalRef" />
    <ConfirmLoadModal ref="confirmLoadModalRef" />
    <EngineMatchModal ref="matchModalRef" @start-match="handleStartMatch" />
    <PlayEngineModal
      ref="playModalRef"
      @start-game="handleStartGame"
      @end-game="handleEndGame"
    />
    <SidebarWidget
      v-if="store.workspaceLoadState.kind === 'loaded'"
      v-show="store.session.ui.sidebarExpanded"
      @load-sgf="openFileDialog"
      @save-sgf="downloadActiveBoard"
    />

    <div id="main-workspace">

      <!-- ADR-0019 audit Finding S1: cold-load honest gate. Before
           the workspace fetch has resolved (or resolved to "nothing
           to fetch"), the store's default boards must not be
           rendered as a plausible, interactive workspace — that was
           the audit's phantom-37-boards defect. `store.workspaceLoadState`
           (SyncService-owned, see types/app.ts) drives an exhaustive
           three-way gate over the board/tree/control-panel surfaces:
           chrome (toolbar, tab strip) that could mutate workspace
           state is withheld the same way. The system-log bar and
           modals stay outside the gate — the log is diagnostic-only
           and the modals are inert until a (gated-away) toolbar
           button opens one. -->
      <template v-if="store.workspaceLoadState.kind === 'loaded'">
        <div class="top-nav-bar">
          <button class="collapse-btn" @click="toggleChrome('sidebarExpanded')" :title="$t('app.chrome.toggleSidebar')">
            {{ store.session.ui.sidebarExpanded ? '◀' : '▶' }}
          </button>

          <Toolbar
            :is-match-running="matchControls.isRunning.value"
            @toggle-engine="engineControls.toggle"
            @mint-card="triggerMint"
            @open-match="triggerMatch"
            @stop-match="handleStopMatch"
            @open-play="triggerPlay"
            @open-learn-path="triggerLearnPath"
            style="flex: 1; border-bottom: none;"
          />

          <div class="right-toggles">
            <button class="collapse-btn" @click="toggleChrome('boardExpanded')" :title="$t('app.chrome.toggleBoard')">
              🔲 {{ store.session.ui.boardExpanded ? '▶' : '◀' }}
            </button>
            <button class="collapse-btn" @click="toggleChrome('treeExpanded')" :title="$t('app.chrome.toggleTree')">
              🌲 {{ store.session.ui.treeExpanded ? '▶' : '◀' }}
            </button>
            <button class="collapse-btn" @click="toggleChrome('controlsExpanded')" :title="$t('app.chrome.toggleControls')">
              ⚙️ {{ store.session.ui.controlsExpanded ? '▶' : '◀' }}
            </button>
            <LocalePicker />
          </div>
        </div>

        <!-- Persistent system-log bar. Visible when either:
               (a) `systemLogExpanded` is checked in the Session (UI)
                   registry — the always-on case, or
               (b) `transientLogReveal` is currently flashing — an
                   error- or warning-level message arrived in the
                   last few seconds while `systemLogExpanded` was
                   false. See `composables/useTransientLogReveal.ts`
                   for the timer mechanics.
             Messages continue to accumulate in the store regardless
             of the visibility gate. -->
        <SystemLogPanel
          v-if="store.session.ui.systemLogExpanded || transientLogReveal"
        />

        <div
          id="split-workspace"
          :style="splitWorkspaceCentered ? { justifyContent: 'center' } : {}"
        >

        <!-- resizer-rearch (nested-splitter amendment, ledger row
             391; geometry corrected per the live diagnostic,
             .claude/dispatch-reports/panel-weirdness-live-investigation.md
             §3/§6). #board-column is purely DERIVED — never a second
             writer (C2) — from the row's structural layout, and now
             `flex: 1 1 auto` (TRUE flex-fill, not `0 1 auto`): it
             absorbs 100% of whatever space the tree panel, BOTH
             resizer bars, and the control panel — each an
             independently-owned persisted fact
             (session.ui.treePanelWidthPx, session.ui.controlPanelWidthPx
             — see useResizablePanel.ts) — did NOT claim, CONTINUOUSLY,
             with no cap of its own. This is what makes a resizer bar
             ALWAYS track the cursor 1:1: the diagnostic measured up to
             541px of pointer/divider lag under the prior `flex: 0 1
             auto` shape, because that shape let #board-column stop
             absorbing freed space once its own aspect-ratio square
             saturated, decoupling every bar's screen position (which
             is a function of #board-column's width) from the drag
             past that point. The aspect-ratio SQUARE itself moves down
             one level, to #board-square below — see its own comment
             for why splitting "the row-flex slot" from "the visual
             square" is what fixes this without losing the square. -->
        <div
          id="board-column"
          v-show="store.session.ui.boardExpanded"
        >
          <!-- The visual board square + status bar, centered within
               whatever width #board-column (now unbounded) received.
               `align-self: center` (not the parent's default stretch)
               is what lets `aspect-ratio: 1/1` + `height: 100%` derive
               THIS element's width from its height, independent of
               #board-column's own (now often wider) box — exactly the
               same aspect-ratio-cap mechanism #board-column itself
               used to carry, just no longer coupled to the row's flex
               math. `max-width: 100%` preserves the existing
               overconstrained-viewport behavior: shrinks below the
               natural square (tall-narrow rectangle) rather than
               overflowing, and the board SVG's own preserveAspectRatio
               letterboxes inside it exactly as before. -->
          <div id="board-square">
            <div id="content">
              <BoardWidget
                v-if="activeBoard"
                :key="activeBoard.id"
                :state="activeBoard"
                @move="handleBoardMove"
                @paste-pv="handlePastePv"
              />
            </div>
            <StatusBar
              v-if="activeBoard"
              :board="activeBoard"
              :metadata="metadata"
              :can-pass="canPass"
              @update-komi="handleUpdateKomi"
              @update-rules="handleUpdateRules"
              @pass="handlePass"
            />
          </div>
        </div>

        <!-- OUTER resizer (nested-splitter amendment, ledger row 391;
             geometry per ledger row 414): sits between #board-column
             and #tree-control-wrapper, directly sets
             session.ui.treeControlRegionWidthPx — the WRAPPER's own
             width, never either pane inside it. Gated on
             controlsExpanded (matching the wrapper's own visibility
             below): with the control region entirely collapsed there
             is nothing for this bar to divide board-vs-wrapper room
             for that the tree's own presence doesn't already handle
             via #board-column's flex-fill. -->
        <div v-show="store.session.ui.controlsExpanded" class="panel-resizer" id="resizer-outer" @mousedown="startResizeOuter"></div>

        <!-- The combined tree+control region (nested-splitter
             amendment). TRUE nested flex container — see
             useResizablePanel.ts's header for why this two-level
             nesting (not one flat row with JS-derived widths) is what
             makes BOTH resizer bars track the cursor 1:1. Width bound
             to session.ui.treeControlRegionWidthPx ONLY while
             controlsExpanded — with the control panel hidden, the
             wrapper holds only the tree and should size to ITS
             content (140px default or the user's own
             treePanelWidthPx), not to a stored width that accounted
             for a control panel that isn't currently rendered.

             ui-5-3: reads effectiveTreeControlRegionWidthPx, NOT the
             raw store value — useResizablePanel.ts clamps the
             persisted number against #split-workspace's CURRENT live
             width on every render (not just mid-drag), so a value
             hydrated from a different/wider viewport (or otherwise
             stale/migrated/garbage) can never squeeze #board-column
             below MIN_BOARD_PX ("board restored minimized" after
             upgrading). See useResizablePanel.ts's header for the
             full rationale. -->
        <div
          id="tree-control-wrapper"
          :style="store.session.ui.controlsExpanded && effectiveTreeControlRegionWidthPx !== undefined
            ? { flex: '0 0 auto', width: effectiveTreeControlRegionWidthPx + 'px' }
            : store.session.ui.controlsExpanded
              ? { flex: '1 1 0' }
              : {}"
        >
          <!-- resizer-rearch charter amendment + maintainer constraint
               (ledger row 414): bound to session.ui.treePanelWidthPx —
               undefined until the user first drags the INNER bar
               (natural 140px default, byte-identical to the
               pre-amendment fixed width), an explicit px width after.
               This is the tree pane's ONLY write channel: no
               fit-to-content, no auto-grow on branch expansion or
               navigation — content changes never touch this value.
               See useResizablePanel.ts. -->
          <div
            id="vue-tree-panel"
            v-show="store.session.ui.treeExpanded"
            :style="store.session.ui.treePanelWidthPx !== undefined
              ? { width: store.session.ui.treePanelWidthPx + 'px', flex: '0 0 auto' }
              : {}"
          >
            <div id="tree-panel-header">{{ $t('app.chrome.gameTreePanelHeader') }}</div>
            <TreeWidget
              v-if="activeBoard"
              :nodes="activeBoard.nodes"
              :board-id="activeBoard.id"
              :game-head-ids="activeBoardGameHeadIds"
              :known-position-node-ids="activeBoardKnownPositionNodeIds"
              :review-start-node-id="reviewSession.startingNodeId.value"
              :pending-mint-ids="activeBoardPendingMintIds"
              @select-node="handleNodeSelect"
            />
          </div>

          <!-- INNER resizer (ledger row 414): sits between
               #vue-tree-panel and #control-panel, INSIDE the wrapper.
               Directly sets session.ui.treePanelWidthPx — the tree
               pane's ONE write channel. -->
          <div v-show="store.session.ui.controlsExpanded && store.session.ui.treeExpanded" class="panel-resizer" id="resizer-inner" @mousedown="startResizeInner"></div>

          <!-- CONTROL_PANEL_MIN_WIDTH_PX (useResizablePanel.ts) —
               derived from the tab strip's natural width at the
               smallest legible font scale (4 tabs × ~50px each +
               gaps). The audit's cross-cutting Finding #1 was that
               without a floor, the tab strip's right-most tab fell
               off-screen at 1024×768. Coupled with the iter-17
               container-query threshold (479px) via the Cards-tab
               `.tree-panel`'s 200px usable floor — changing this
               value would invalidate the 479 derivation in
               `ForestDirectory.vue`.

               resizer-rearch geometry fix (ledger row 414): ALWAYS
               `flex: 1 1 0` — pure CSS flex-fill WITHIN the wrapper,
               no JS-derived width, no persisted fact of its own. This
               is what makes #resizer-inner track the cursor 1:1: the
               tree pane is directly dragged, and #control-panel
               absorbs the wrapper-local complement on the bar's OTHER
               side. See useResizablePanel.ts's header for the full
               argument. -->
          <div
            id="control-panel"
            v-show="store.session.ui.controlsExpanded"
            :style="{ flex: '1 1 0', minWidth: CONTROL_PANEL_MIN_WIDTH_PX + 'px' }"
          >
            <TabWidget
              :key="controlPanelIdentityKey"
              :tabs="controlTabs"
              v-model="activeTab"
            >

              <template #library>
                <div style="flex: 1; display: flex; min-height: 0; width: 100%;">
                  <LibraryTab
                    @open-library-game="handleLoadLibraryGame"
                    @open-library-game-new-tab="handleLoadLibraryGameInNewBoard"
                  />
                </div>
              </template>

              <template #cards>
                <div style="flex: 1; display: flex; min-height: 0; width: 100%;">
                  <ForestDirectory @load-card="handleLoadCard" />
                </div>
              </template>

              <template #settings>
                <SettingsTab @force-save="sync.forceSave()" />
              </template>

              <template #analysis>
                <AnalysisControls v-if="activeBoard" :boardId="activeBoard.id" />
              </template>

              <template #other>
                <div class="tab-padding">
                  <h3 class="sub-header">{{ $t('other.section.knobRegistry') }}</h3>
                  <KnobRegistryEditor />

                  <h3 class="sub-header section-divider" style="margin-top: var(--space-loose);">{{ $t('other.section.gradientCalibration') }}</h3>
                  <p class="hue-slider-hint">{{ $t('other.label.gradientCalibrationNotice') }}</p>
                  <ColorDebugStrip :steps="500" />

                  <h3 class="sub-header section-divider" style="margin-top: var(--space-loose);">{{ $t('other.section.visitsLerp') }}</h3>
                  <VisitsLerpConfig />

                  <h3 class="sub-header section-divider" style="margin-top: var(--space-loose);">{{ $t('other.section.perQueryOverrides') }}</h3>
                  <PerQueryOverridesConfig />

                  <h3 class="sub-header section-divider" style="margin-top: var(--space-loose);">{{ $t('other.section.qeuboBookmarks') }}</h3>
                  <QeuboBookmarks />
                </div>
              </template>

            </TabWidget>
          </div>
        </div>
        </div>
      </template>

      <div
        v-else-if="store.workspaceLoadState.kind === 'loading'"
        id="workspace-boot-state"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <div class="workspace-boot-spinner" aria-hidden="true"></div>
        <p>{{ $t('app.workspace.loading') }}</p>
      </div>

      <div
        v-else-if="store.workspaceLoadState.kind === 'error'"
        id="workspace-boot-state"
        role="alert"
      >
        <p>{{ $t('app.workspace.loadFailed') }}</p>
        <button class="action-btn-large" style="width: auto; padding-left: var(--space-loose); padding-right: var(--space-loose);" @click="sync.retryHydrate()">
          {{ $t('app.workspace.retry') }}
        </button>
      </div>

    </div> </div>
  </RootErrorBoundary>
</template>

<style>
@import "./assets/css/theme.css";
@import "./assets/css/style.css";
@import "./assets/css/palettes.css";
/* Shared chrome classes consumed by other components (SettingsTab,
   ForestDirectory, ReviewSessionPanel, KeybindingsView, the editors
   and modals) — relocated out of this block 2026-06-11 so App.vue
   edits cannot silently restyle distant components. Imported here,
   after the three substrate sheets and before the App-local rules
   below, to preserve the cascade position the rules held in place. */
@import "./assets/css/shared-chrome.css";

#app {
  height: 100vh; width: 100vw;
  background-color: var(--surface-2); color: var(--text-0);
  overflow: hidden;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.resizing * { user-select: none !important; -webkit-user-select: none !important; }
#main-area { display: flex; flex-direction: row; height: 100%; width: 100%; overflow: hidden; }

/* The new main workspace column */
#main-workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: var(--surface-0);
}

/* magic-literal: 32px `.top-nav-bar` min-height. The bar hosts the
   sidebar-toggle button + Toolbar + right-side toggles. 32 is enough
   for the toggle buttons (text-emphasis font at ~14px line-box) plus
   2-3px of top/bottom margin so the bar reads as chrome, not crammed.
   `min-height` (not `height`) so iter-13's Toolbar `flex-wrap` can
   grow the bar vertically at narrow widths; if Toolbar's height
   changes from its current 28px floor, retune in tandem. */
.top-nav-bar {
  display: flex; align-items: center; background: var(--surface-0);
  border-bottom: 1px solid var(--border-1); padding: 0 var(--space-default); min-height: 32px; flex-shrink: 0;
}

/* The lower area where the resizer lives. justify-content is bound
   inline (splitWorkspaceCentered, script setup above) rather than
   here: it's conditional on runtime UI state (controlsExpanded),
   not a static rule. Default flex-start below; see
   splitWorkspaceCentered's comment for when it flips to centered. */
#split-workspace {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

/* ADR-0019 audit S1: cold-load loading/error state, occupying the
   same flex slot `#split-workspace` would (`#main-workspace`'s
   `flex-direction: column` + this block's `flex: 1`), so the
   toolbar-then-content layout shape doesn't jump when the gate
   resolves. Minimal — a pulsing dot (PboPopover's `.busy-dot`
   `@keyframes pulse` is the existing chrome idiom for a busy
   indication) plus centred text, not a full skeleton; C26 only
   needs a busy indication within ~1s, not a content-shaped
   placeholder. */
#workspace-boot-state {
  flex: 1; min-width: 0; min-height: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--space-default);
  color: var(--text-2); font-size: var(--text-emphasis);
}
.workspace-boot-spinner {
  width: 20px; height: 20px; border-radius: 50%;
  border: 3px solid var(--surface-2); border-top-color: var(--accent-primary);
  animation: workspace-boot-spin 0.8s linear infinite;
}
@keyframes workspace-boot-spin { to { transform: rotate(360deg); } }

/* resizer-rearch (replaces the release-scope item 7 board-width-cap
   model — see useResizablePanel.ts's header for the full defect this
   fixes, ADR-0019 audit S2; extended to a nested-splitter tree under
   the charter amendment, ledger row 391 / geometry ledger row 414;
   THIS shape corrected per the live diagnostic,
   .claude/dispatch-reports/panel-weirdness-live-investigation.md
   §3/§6, which measured a resizer bar decoupling from the cursor by
   up to 541px because a `flex: 0 1 auto` (never-grow) board column
   stops absorbing freed row space the moment its own aspect-ratio
   square saturates).

   `flex: 1 1 auto` — TRUE flex-fill. #board-column now claims 100% of
   whatever width #tree-control-wrapper (below — a TRUE nested flex
   container, itself bound to session.ui.treeControlRegionWidthPx, the
   OUTER bar's own persisted fact) did NOT claim — continuously,
   unconditionally, with no cap of its own. This is a structural (not
   persisted) derivation, never a second writer: no `max-width` or
   `aspect-ratio` here at all — the visual square lives one level
   down, in #board-square. Because #board-column is the OUTER row's
   ONLY flex-grow party, and the wrapper's own width is the ONLY thing
   the OUTER bar directly drags, #resizer-outer's screen position (a
   function of #board-column's width, since it sits immediately after
   it) tracks the cursor 1:1 across the bar's ENTIRE range — see
   useResizablePanel.ts's header for the full nesting argument, and
   the diagnostic's Anomaly 1 (up to 541px lag) / Anomaly 4 (board
   frozen for ~1250px of travel) for the failure mode this replaces. */
#board-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1 1 auto;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

/* The visual board square, pushed down from #board-column (see that
   rule's comment for why). `align-self: center` overrides the
   parent's default cross-axis stretch, which is what lets
   `aspect-ratio: 1/1` + `height: 100%` derive THIS element's width
   from its own height — the same mechanism #board-column used to
   carry directly, just no longer coupled to the row's flex math, so
   #board-column can be as wide as the row leaves it (absorbing freed
   space for bar-tracking continuity) while #board-square stays a true
   square (or a letterboxed tall-narrow rectangle when overconstrained
   — same fallback as before) regardless. `max-width: 100%` is the
   overconstrained-viewport floor: shrinks below the natural square
   rather than overflowing #board-column; the board SVG's own
   preserveAspectRatio letterboxes inside it exactly as before. */
#board-square {
  display: flex;
  flex-direction: column;
  align-self: center;
  height: 100%;
  aspect-ratio: 1 / 1;
  min-width: 0;
  max-width: 100%;
  min-height: 0;
}

#content { flex: 1; display: flex; justify-content: center; align-items: center; min-height: 0; }

/* The combined tree+control region — a TRUE nested flex container
   (nested-splitter amendment, ledger row 391 / geometry ledger row
   414). Its own width is session.ui.treeControlRegionWidthPx (bound
   inline, App.vue template) — the OUTER bar's persisted fact. `row`
   direction so #vue-tree-panel, #resizer-inner, and #control-panel
   lay out exactly like #split-workspace's own children one level up.
   `min-width: 0` is required for the SAME reason it's required on
   every flex item wrapping shrinkable content: without it, a flex
   item's automatic minimum size is its content's intrinsic width,
   which can force the wrapper wider than its own flex-basis. */
#tree-control-wrapper { display: flex; flex-direction: row; height: 100%; min-width: 0; min-height: 0; }

/* magic-literal: 140px `#vue-tree-panel` DEFAULT width (was 220px,
   iter-21 slim-down). Nested-splitter amendment (ledger row 391;
   maintainer constraint ledger row 414 — this is the tree pane's
   ONLY write channel, ever): the panel is user-resizable via the
   INNER `.panel-resizer` (`#resizer-inner`, inside the wrapper above)
   — the inline `width` style (App.vue template) overrides this
   default once `session.ui.treePanelWidthPx` is set. 140 remains both
   the CSS default AND the drag floor (`TREE_PANEL_MIN_WIDTH_PX`,
   useResizablePanel.ts) — see that constant's comment for why the
   floor wasn't lowered. magic-literal: 5px padding-right — preserved
   from prior; gives the tree the standard tight margin against the
   right chrome edge without affecting tree-widget layout. */
/* Token categories per ledger row 742 (surface-token discipline): borders
   use border tokens, backgrounds use surface tokens. The pre-2026-08-07
   form (background: var(--border-1); border: var(--surface-1)) was a
   category inversion minted by the 2026-05-02 nearest-value var() sweep;
   background matches TreeWidget's own --surface-2. The vestigial
   padding-right: 5px (the "grey bar" the background used to show
   through) was removed by commissioner directive the same day. */
#vue-tree-panel { width: 140px; flex-shrink: 0; display: flex; flex-direction: column; border-left: 1px solid var(--border-1); background: var(--surface-2); min-height: 0; }
#tree-panel-header { height: 20px; background: var(--surface-0); border-bottom: 1px solid var(--border-1); display: flex; align-items: center; padding: 0 var(--space-default); font-size: var(--text-tiny); letter-spacing: var(--tracking-wide); color: var(--text-2); text-transform: uppercase; flex-shrink: 0; }
#control-panel { border-left: 1px solid var(--border-1); background: var(--surface-3); min-width: 0; display: flex; flex-direction: column; }

/* theme-exception: .panel-resizer #eba46d is a peach accent color
   outside the substrate vocabulary (the chrome substrate has
   --accent-primary cyan and --accent-secondary orange #f0a04a; this
   peach is distinct from both). Used as a visual handle for both
   nested-splitter divider bars (#resizer-outer, board↔tree;
   #resizer-inner, tree↔control — see useResizablePanel.ts). */
.panel-resizer { width: 4px; background: #eba46d; cursor: col-resize; z-index: var(--z-affordance); flex-shrink: 0; transition: background var(--duration-default); }
.panel-resizer:hover, .panel-resizer:active { background: var(--accent-primary); }

.collapse-btn { background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-2); height: 18px; padding: 0 var(--space-tight); cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-default); font-size: var(--text-body); }
.right-toggles { display: flex; gap: var(--space-default); margin-left: auto; }

/* Gradient-calibration notice (the hue-offset slider lifted into
   the cross-domain knob registry; see Other-tab Knob Registry's
   Display group). The preview strip below stays — it's the
   calibration view the slider feeds. */
.hue-slider-hint { font-size: var(--text-body); color: var(--text-1); margin: 0 0 var(--space-default) 0; }
</style>
