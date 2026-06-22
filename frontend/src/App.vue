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
import { computed } from 'vue';
import { ref as vueRef } from 'vue';
import { useI18n } from 'vue-i18n';

import { useMetadata }       from './composables/auth-app/useMetadata';
import { useSgfLoader }      from './composables/sgf/useSgfLoader';
import { useSgfDownload }    from './composables/sgf/useSgfDownload';
import { useEngineControls } from './composables/useEngineControls';
import { useUserIORegistry } from './composables/useUserIORegistry';
import { useAuth }           from './composables/auth-app/useAuth';
import { workspaceIdentityKey } from './composables/auth-app/workspace-identity-key';
import { useResizablePanel } from './composables/chrome/useResizablePanel';
import { useDirtyBoardGuard } from './composables/board/useDirtyBoardGuard';
import { useAppBootstrap } from './composables/auth-app/useAppBootstrap';
import { useTransientLogReveal } from './composables/useTransientLogReveal';
import {
  store,
  activeBoard,
  mutateBoard,
  pushSystemMessage,
  touchSession,
} from './store';

import type { BoardId, NodeId, UISession }   from './types';
import { navigateTo }     from './engine/navigator';

import { KATAGO_WS_URL } from './config/env';
import { usePlayMatch } from './composables/board/usePlayFromPosition';
import { useEngineResponder } from './composables/board/useEngineResponder';
import { useBoardMoveRouting } from './composables/board/useBoardMoveRouting';
import { usePlayVsEngine } from './composables/board/usePlayVsEngine';
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
import ConfirmLoadModal from './components/modals/ConfirmLoadModal.vue';
import EngineMatchModal from './components/modals/EngineMatchModal.vue';
import PlayEngineModal  from './components/modals/PlayEngineModal.vue';
import ForestDirectory  from './components/tree/ForestDirectory.vue';
import LibraryTab       from './components/library/LibraryTab.vue';
import SystemLogPanel   from './components/chrome/SystemLogPanel.vue';
import RootErrorBoundary from './components/chrome/RootErrorBoundary.vue';
import LocalePicker     from './components/chrome/LocalePicker.vue';

import { useReviewSession } from './composables/review/useReviewSession';
import ColorDebugStrip  from './components/charts/ColorDebugStrip.vue';
import QeuboBookmarks   from './components/qeubo/QeuboBookmarks.vue';
import KnobRegistryEditor from './components/KnobRegistryEditor.vue';

useUserIORegistry();

const { t } = useI18n();
const { openFileDialog } = useSgfLoader();
const { downloadActiveBoard } = useSgfDownload();
const engineControls     = useEngineControls();
const metadata           = useMetadata(activeBoard);
const auth               = useAuth();

const activeBoardId = computed<BoardId | null>(() => activeBoard.value?.id ?? null);

// Identity key for the control panel. Remounts the Cards / Library tabs
// when the logged-in identity changes, so user B never sees user A's
// component-instance fetched data (ForestDirectory's `roots`, LibraryTab's
// query/preview state) — the leak `resetWorkspace`'s cache registry can't
// reach, since that state lives in component instances, not module scope.
// Derivation (and why username, not userId) in workspace-identity-key.ts.
const controlPanelIdentityKey = computed(() => workspaceIdentityKey(auth.state.value));
const reviewSession = useReviewSession(activeBoardId);
const mintModalRef = vueRef<InstanceType<typeof MintCardModal> | null>(null);
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

// "Follow Me" ponder watcher — restarts pondering on same-board
// navigation (board switches deliberately excluded). Watcher scope:
// App lifetime. See the composable for the trigger contract.
useFollowMePonder();

function triggerMint() {
  if (activeBoardId.value) {
    mintModalRef.value?.open(activeBoardId.value);
  }
}

function handleUpdateKomi(newKomi: number) {
  if (!activeBoard.value || isNaN(newKomi)) return;
  mutateBoard(activeBoard.value.id, draft => {
    const root = draft.nodes[draft.rootNodeId];
    if (root) {
      root.properties['KM'] = [newKomi.toString()];
    }
  });
}

const confirmLoadModalRef = vueRef<InstanceType<typeof ConfirmLoadModal> | null>(null);
const {
  handleLoadCard,
  handleLoadLibraryGame,
  handleLoadLibraryGameInNewBoard,
} = useDirtyBoardGuard(confirmLoadModalRef);

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
const { handleBoardMove, handlePastePv } =
  useBoardMoveRouting(reviewSession, engineResponder);

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
    <MintCardModal ref="mintModalRef" />
    <ConfirmLoadModal ref="confirmLoadModalRef" />
    <EngineMatchModal ref="matchModalRef" @start-match="handleStartMatch" />
    <PlayEngineModal
      ref="playModalRef"
      @start-game="handleStartGame"
      @end-game="handleEndGame"
    />
    <SidebarWidget
      v-show="store.session.ui.sidebarExpanded"
      @load-sgf="openFileDialog"
      @save-sgf="downloadActiveBoard"
    />

    <div id="main-workspace">
      
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

      <div id="split-workspace">
        
        <div
          id="board-column"
          v-show="store.session.ui.boardExpanded"
          :style="store.session.ui.boardSquareMaxWidthPx
            ? { '--board-target-px': store.session.ui.boardSquareMaxWidthPx + 'px' }
            : {}"
        >
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
            @update-komi="handleUpdateKomi"
          />
        </div>

        <div id="vue-tree-panel" v-show="store.session.ui.treeExpanded">
          <div id="tree-panel-header">{{ $t('app.chrome.gameTreePanelHeader') }}</div>
          <TreeWidget
            v-if="activeBoard"
            :nodes="activeBoard.nodes"
            :board-id="activeBoard.id"
            :game-head-ids="activeBoardGameHeadIds"
            @select-node="handleNodeSelect"
          />
        </div>

        <div v-show="store.session.ui.controlsExpanded" class="panel-resizer" @mousedown="startResize"></div>

        <!-- magic-literal: 220px #control-panel min-width — derived
             from the tab strip's natural width at the smallest legible
             font scale (4 tabs × ~50px each + gaps). The audit's
             cross-cutting Finding #1 was that without a floor, the
             tab strip's right-most tab fell off-screen at 1024×768.
             Coupled with the iter-17 container-query threshold (479px)
             via the Cards-tab `.tree-panel`'s 200px usable floor —
             changing 220 here would invalidate the 479 derivation
             in `ForestDirectory.vue`. -->
        <div
          id="control-panel"
          v-show="store.session.ui.controlsExpanded"
          :style="{ flex: '1 1 0', minWidth: '220px' }"
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

                <h3 class="sub-header section-divider" style="margin-top: var(--space-loose);">{{ $t('other.section.qeuboBookmarks') }}</h3>
                <QeuboBookmarks />
              </div>
            </template>

          </TabWidget>
        </div>
      </div> </div> </div>
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
  border-bottom: 1px solid var(--surface-1); padding: 0 var(--space-default); min-height: 32px; flex-shrink: 0;
}

/* The lower area where the resizer lives */
#split-workspace {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

/* Release-scope item 7: board column is a square sized from its
   allocated height (aspect-ratio: 1/1 + height: 100%). The user-
   set `--board-target-px` (mutated by the resizer) caps the width
   below the height-natural max — drag-left grows the cap (board
   shrinks), drag-right shrinks the cap (board grows up to the
   height saturation point). When unset, no cap; the board
   saturates at full square.

   `flex: 0 1 auto` (was `0 0 auto`): allow the column to shrink
   below the height-natural square when the row is overconstrained
   (e.g. narrow desktops, snapped half-screen). The control panel's
   min-width:220px floor then keeps the tab strip on-screen; the
   board column becomes a tall-narrow rectangle and the SVG
   letterboxes via its viewBox preserveAspectRatio. */
#board-column {
  display: flex;
  flex-direction: column;
  flex: 0 1 auto;
  height: 100%;
  aspect-ratio: 1 / 1;
  max-width: var(--board-target-px, 100%);
  min-width: 0;
  min-height: 0;
}

#content { flex: 1; display: flex; justify-content: center; align-items: center; min-height: 0; }

/* magic-literal: 140px `#vue-tree-panel` width — was 220px (iter-21
   slim-down). The tree-panel is not currently resizable; user said
   they're "less confident" about the right value because they
   haven't recently exercised variation-heavy tree navigation. 140
   is conservative-aggressive: gives the centre column +80px back
   while preserving room for single-column main-line walks and 1–2
   side variations at the standard tree-widget node size. If the
   user finds variation-heavy trees clipping at this width, dial up
   (180-200) or add a resizer. magic-literal: 5px padding-right —
   preserved from prior; gives the tree the standard tight margin
   against the right chrome edge without affecting tree-widget
   layout. */
#vue-tree-panel { width: 140px; display: flex; flex-direction: column; border-left: 1px solid var(--surface-1); background: var(--border-1); min-height: 0; flex-shrink: 0; padding-right: 5px; }
#tree-panel-header { height: 20px; background: var(--surface-0); border-bottom: 1px solid var(--surface-1); display: flex; align-items: center; padding: 0 var(--space-default); font-size: var(--text-tiny); letter-spacing: var(--tracking-wide); color: var(--text-2); text-transform: uppercase; flex-shrink: 0; }
#control-panel { border-left: 1px solid var(--surface-1); background: var(--surface-3); flex-shrink: 0; display: flex; flex-direction: column; }

/* theme-exception: .panel-resizer #eba46d is a peach accent color
   outside the substrate vocabulary (the chrome substrate has
   --accent-primary cyan and --accent-secondary orange #f0a04a; this
   peach is distinct from both). Used as a visual handle for the
   board / control-panel divider. */
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
