<script setup lang="ts">
/**
 * src/App.vue
 *
 * Root application component. Provides the top-level layout — the
 * resizable board/control-panel split, the tab bar, workspace
 * auth scaffolding, and the global unscoped stylesheet that
 * several child components depend on.
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
import { useResizablePanel } from './composables/chrome/useResizablePanel';
import { useDirtyBoardGuard } from './composables/board/useDirtyBoardGuard';
import { useAppBootstrap } from './composables/auth-app/useAppBootstrap';
import { useTransientLogReveal } from './composables/useTransientLogReveal';
import {
  store,
  activeBoard,
  updateBoardState,
  mutateBoard,
  pushSystemMessage,
} from './store';

import type { BoardId, NodeId, BoardState }   from './types';
import { applyGoMove }    from './logic';
import type { PvMove }    from './composables/board/use-pv-animation';
import { navigateTo }     from './engine/navigator';

// Wiring-file exemption from the component→services deny-by-default
// boundary (work-status item services-boundary-deny-by-default, step (a)).
// The layering tenet covers App.vue ("Components … No direct service
// calls"), so this import is named layering debt, not a sanctioned
// pattern: App.vue is the root wiring surface (engine connect/disconnect,
// match orchestration, review-session glue) and extracting that
// orchestration into a composable is out of the boundary-inversion arc's
// scope. A SECOND service import here still trips the rule and needs its
// own adjudication.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- annotated wiring-file exemption, see above
import { analysisService } from './services/analysis-service';
import { KATAGO_WS_URL } from './config/env';
import { usePlayMatch } from './composables/board/usePlayFromPosition';
import { useEngineResponder, findGameByHead } from './composables/board/useEngineResponder';

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

import { useReviewSession, isReviewTransientState } from './composables/review/useReviewSession';
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
// entries live on `BoardState.games` (schema 52). App.vue is the
// orchestrator that owns the modal ref and the mutateBoard calls,
// matching the existing modal pattern (MintCardModal, EngineMatchModal,
// ConfirmLoadModal). The engine responder watches the games map
// reactively and fires queries when conditions match; the start-game
// handler also kicks it synchronously so the engine opens the game
// without waiting for the next reactive tick if it's its color's turn
// at the start position.
function triggerPlay() {
  if (activeBoardId.value) {
    playModalRef.value?.open();
  }
}

function handleStartGame(opts: {
  userColor: 'B' | 'W';
  engineMaxVisits: number;
  engineModel: string | null;
}) {
  const board = activeBoard.value;
  if (!board) return;
  const startNodeId = board.currentNodeId;
  mutateBoard(board.id, draft => {
    draft.games[startNodeId] = {
      config: {
        userColor: opts.userColor,
        engineMaxVisits: opts.engineMaxVisits,
        engineModel: opts.engineModel,
      },
      currentHeadNodeId: startNodeId,
    };
  });
  // If it's the engine's color's turn at the start position, fire
  // one engine move so the game kicks off without the user being
  // stuck at an engine-turn head. After the engine plays, the
  // responder advances `currentHeadNodeId` to the post-engine-move
  // position, which is the user's turn — a normal head the user
  // can play from. If it's the user's turn at start, no kick;
  // the user plays first, which then triggers the responder
  // (handleBoardMove's branch).
  const engineColor = opts.userColor === 'B' ? 'W' : 'B';
  if (board.turn === engineColor) {
    void engineResponder.fireAndAdvanceHead(board.id, startNodeId);
  }
}

function handleEndGame(nodeId: NodeId) {
  const board = activeBoard.value;
  if (!board) return;
  mutateBoard(board.id, draft => {
    delete draft.games[nodeId];
  });
}

// Currently-active green-ring NodeIds for the active board — one
// per game-session, at that session's `currentHeadNodeId`. Passed
// to TreeWidget as a ReadonlySet so the tree renders the green
// ring on each head. Recomputes when `activeBoard.value.games`
// changes (Object.values iteration registers reactive deps on the
// games map and each session's currentHeadNodeId field).
const activeBoardGameHeadIds = computed((): ReadonlySet<NodeId> | undefined => {
  const board = activeBoard.value;
  if (!board) return undefined;
  return new Set(Object.values(board.games).map(g => g.currentHeadNodeId));
});

// ─── "Follow Me" Ponder Watcher ──────────────────────────────────────────────
// Automatically restarts pondering when the user navigates or plays a move on
// the *currently active* board. The reactive expression includes the active
// board's id so a board switch (different active tab) can be distinguished
// from same-board navigation: switching tabs is NOT a "follow me" trigger and
// must not re-issue the new tab's ponder query — doing so would cancel and
// re-subscribe a perfectly good in-flight ponder, churning the proxy's
// canonical (and, with multi-tab coalescing, masking the proxy's stranded-
// query / coalescing-transparency behaviour during testing).
watch(
  () => activeBoard.value
    ? { id: activeBoard.value.id, nodeId: activeBoard.value.currentNodeId }
    : null,
  (curr, prev) => {
    if (!curr || !prev) return;            // mount, unmount, or no active board
    if (curr.id !== prev.id) return;       // board switch — not a "follow me" trigger
    if (curr.nodeId === prev.nodeId) return;
    if (analysisService.isPondering(curr.id)) {
      analysisService.analyzeActiveNode(curr.id, 'ponder');
    }
  }
);
// ─────────────────────────────────────────────────────────────────────────────

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

function handleBoardMove(x: number, y: number): void {
  // AWAITING_MOVE: route to the review session's single-move
  // handler. The session enforces N-move discipline and grades
  // each move; a free-play applyGoMove here would silently bypass
  // both the count and the grading.
  if (reviewSession.state.value === 'AWAITING_MOVE') {
    reviewSession.processUserMove(x, y);
    return;
  }
  // LOADING / ANALYZING: transient SR states. Board is mid-load
  // or mid-evaluation; free play here would race the SR lifecycle
  // (LOADING's positioning, or ANALYZING's reading of the
  // just-played position to compute the grade). Shared guard
  // with handlePastePv — both entry points use isReviewTransientState
  // so a new board-mutation path needs only one call, not a copy of
  // the LOADING/ANALYZING literals (ADR-0011 Rule 4).
  if (isReviewTransientState(reviewSession.state.value)) {
    return;
  }
  // IDLE (no review running) or FINISHED (intermission — post-
  // evaluation exploration phase): free play. Intermission is when
  // the user reads branches off the evaluated position; per the
  // pedagogy in the umbrella handoff doc ("heredity tracking
  // offloads branching problems"), exploration here is part of
  // the learning experience the SR loop serves. Matches
  // `handlePastePv`'s policy of allowing exploration in
  // non-AWAITING_MOVE states.
  if (!activeBoard.value) return;
  // "Play vs engine" trigger: if the cursor was at a green-ringed
  // game head BEFORE this move, fire the responder AFTER the move
  // lands so the engine answers. Capture the head-game BEFORE
  // applyGoMove so we know which game (if any) to advance.
  // Off-line moves (cursor not at a head) don't trigger.
  const prevNodeId = activeBoard.value.currentNodeId;
  const boardId = activeBoard.value.id;
  const gameAtHead = findGameByHead(activeBoard.value, prevNodeId);
  const next = applyGoMove(activeBoard.value, x, y);
  if (!next) return;
  updateBoardState(store.activeBoardIndex, next);
  if (gameAtHead !== null) {
    void engineResponder.fireAndAdvanceHead(boardId, gameAtHead.startNodeId);
  }
}

/**
 * Paste a principal variation into the active board's game tree.
 * Loops applyGoMove sequentially: each call either descends into
 * an existing child that already plays the coordinate, or creates
 * a new child. The dedup behaviour at logic.ts:79–82 means the
 * final tree is correct whether the PV is wholly new, wholly
 * pre-existing, or any partial overlap. After the loop the board's
 * currentNodeId sits at the PV leaf (the "advance to PV leaf"
 * cursor behaviour the user picked). Illegal moves surface a
 * system message and accept the legal prefix per ADR-0002 — fail
 * loudly, but don't discard useful work.
 *
 * No-op during AWAITING_MOVE review state: the review session
 * enforces single-move discipline and pasting a whole PV would
 * silently bypass it. Also blocked during LOADING and ANALYZING
 * (transient states where board mutation races the SR lifecycle),
 * matching handleBoardMove's posture. Both use isReviewTransientState
 * as the shared guard (ADR-0011 Rule 4). Other review states
 * (FINISHED / intermission) allow paste — those are study phases
 * where exploration is the point.
 */
function handlePastePv(pv: PvMove[]): void {
  if (reviewSession.state.value === 'AWAITING_MOVE') return;
  if (isReviewTransientState(reviewSession.state.value)) return;
  if (!activeBoard.value || pv.length === 0) return;

  let board: BoardState = activeBoard.value;
  for (const move of pv) {
    const next = applyGoMove(board, move.x, move.y);
    if (!next) {
      pushSystemMessage('warning', t('moveSuggestions.pasteIllegal', {
        n: move.moveNumber,
        x: move.x,
        y: move.y,
      }));
      break;
    }
    board = next;
  }
  if (board !== activeBoard.value) {
    updateBoardState(store.activeBoardIndex, board);
  }
}

// Tightened from `nodeId: string` to `nodeId: NodeId` to match
// TreeWidget's tightened `select-node` emit signature. The handler
// now receives the branded type directly; navigateTo (which expects
// NodeId) is satisfied without a cast.
function handleNodeSelect(nodeId: NodeId): void {
  if (!activeBoard.value) return;
  mutateBoard(activeBoard.value.id, draft => navigateTo(draft, nodeId));
}

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
        <button class="collapse-btn" @click="store.session.ui.sidebarExpanded = !store.session.ui.sidebarExpanded" :title="$t('app.chrome.toggleSidebar')">
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
          <button class="collapse-btn" @click="store.session.ui.boardExpanded = !store.session.ui.boardExpanded" :title="$t('app.chrome.toggleBoard')">
            🔲 {{ store.session.ui.boardExpanded ? '▶' : '◀' }}
          </button>
          <button class="collapse-btn" @click="store.session.ui.treeExpanded = !store.session.ui.treeExpanded" :title="$t('app.chrome.toggleTree')">
            🌲 {{ store.session.ui.treeExpanded ? '▶' : '◀' }}
          </button>
          <button class="collapse-btn" @click="store.session.ui.controlsExpanded = !store.session.ui.controlsExpanded" :title="$t('app.chrome.toggleControls')">
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
            v-model="(store.session.ui.activeTab as string /* widen the tab-id union to TabWidget's string v-model */)"
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

.tab-padding { padding: var(--space-default); }
.section-divider { border-top: 1px solid var(--surface-3); margin-top: 0; padding-top: 0; }
.sub-header { color: var(--text-2); font-size: var(--text-heading); margin-bottom: var(--space-medium); }

/* Native <details> subsections in the Settings tab. Override default
   marker, render a custom chevron that rotates on open. The h3
   (.sub-header) lives inside <summary> so it visually anchors the
   disclosure header; its bottom margin is neutralised in this context
   since the disclosure itself owns vertical rhythm. */
.settings-section > summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  user-select: none;
  padding: var(--space-tight) 0;
}
.settings-section > summary::-webkit-details-marker { display: none; }
.settings-section > summary::before {
  content: '▶';
  margin-right: var(--space-default);
  font-size: var(--text-tiny);
  color: var(--text-2);
  transition: transform var(--duration-default) ease;
  flex-shrink: 0;
}
.settings-section[open] > summary::before { transform: rotate(90deg); }
.settings-section > summary > h3 { margin: 0; flex: 1; }
.settings-section > summary > .toolbar-btn-sm { margin-left: var(--space-default); }
.settings-section > summary:hover > h3 { color: var(--text-2); }

.deck-selector-box { background: var(--surface-2); padding: var(--space-medium); border-radius: var(--radius-default); border: 1px solid var(--surface-3); margin-bottom: var(--space-loose); text-align: left; }
.deck-selector-box label { font-size: var(--text-emphasis); color: var(--text-2); display: block; margin-bottom: var(--space-default); text-transform: uppercase; }
.deck-dropdown { width: 100%; padding: var(--space-default); font-size: var(--text-emphasis); margin-bottom: var(--space-default); background: var(--surface-0); color: var(--text-0); border: 1px solid var(--border-2); border-radius: var(--radius-default); outline: none; }
.deck-dropdown:focus { border-color: var(--accent-primary); }

.action-btn-large { background: var(--accent-primary); color: var(--text-0); border: none; padding: var(--space-tight) var(--space-medium); cursor: pointer; border-radius: var(--radius-default); font-weight: bold; width: 100%; }
.toolbar-btn-sm { border: 1px solid var(--border-3); color: var(--text-1); padding: 1px 4px; font-size: var(--text-emphasis); cursor: pointer; border-radius: var(--radius-default); }
/* magic-literal: clamp(400px, 60vh, 800px) `.registry-container` max-height.
   Floor 400: preserves the prior fixed 400px on short viewports (≤700px
   tall, where 60vh ≤ 400). Cap 800: prevents runaway at 4K (≥1334px tall,
   where 60vh ≥ 800) — the Settings tab is meant to scroll inside the
   registry, not the registry inside an unbounded tab. 60vh is the
   proportional middle that scales with viewport. Iter-2 audit
   Finding H: the fixed 400px on tall viewports forced an inner
   scrollbar inside an otherwise spacious tab-body, wasting vertical
   space. Clamp scales with viewport between a 400px floor (short
   viewports keep the prior cap) and an 800px ceiling (tall
   viewports get more rows visible). The 60vh preferred value gives
   a natural growth curve in between. The Card Sets section's
   inline override uses a 500/70vh/900 clamp for the same reason. */
.registry-container { margin-top: 0; background: var(--surface-2); border: 1px solid var(--surface-3); border-radius: var(--radius-default); max-height: clamp(400px, 60vh, 800px); overflow-y: auto; }

.collapse-btn { background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-2); height: 18px; padding: 0 var(--space-tight); cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-default); font-size: var(--text-body); }
.right-toggles { display: flex; gap: var(--space-default); margin-left: auto; }

/* Visits override row in the SR tab during an active review */
.visits-override-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-medium);
  padding: var(--space-default) var(--space-medium);
  background: var(--surface-2);
  border: 1px solid var(--surface-3);
  border-radius: var(--radius-default);
  margin-bottom: var(--space-medium);
  text-align: left;
}
.visits-override-row label {
  font-size: var(--text-emphasis);
  color: var(--text-2);
  text-transform: uppercase;
}
.dark-input {
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  color: var(--text-1);
  font-size: var(--text-emphasis);
}
.visits-input {
  width: 100px;
  padding: var(--space-tight) var(--space-default);
  font-family: monospace;
  outline: none;
  border-radius: var(--radius-default);
}
.visits-input:focus { border-color: var(--accent-primary); }

/* Gradient-calibration notice (the hue-offset slider lifted into
   the cross-domain knob registry; see Other-tab Knob Registry's
   Display group). The preview strip below stays — it's the
   calibration view the slider feeds. */
.hue-slider-hint { font-size: var(--text-body); color: var(--text-1); margin: 0 0 var(--space-default) 0; }
</style>
