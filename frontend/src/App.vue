<script setup lang="ts">
import { computed, watch } from 'vue';
import { ref as vueRef } from 'vue';
import { useI18n } from 'vue-i18n';

import { useMetadata }       from './composables/useMetadata';
import { useSgfLoader }      from './composables/useSgfLoader';
import { useSgfDownload }    from './composables/useSgfDownload';
import { useEngineControls } from './composables/useEngineControls';
import { useUserIORegistry } from './composables/useUserIORegistry';
import { useAuth }           from './composables/useAuth';
import { useResizablePanel } from './composables/useResizablePanel';
import { useDirtyBoardGuard } from './composables/useDirtyBoardGuard';
import { useAppBootstrap } from './composables/useAppBootstrap';
import { useTransientLogReveal } from './composables/useTransientLogReveal';
import {
  store,
  activeBoard,
  updateBoardState,
  mutateBoard,
  DEFAULTS,
} from './store';

import type { BoardId, NodeId, GameNode }   from './types';
import { applyGoMove }    from './logic';
import { navigateTo }     from './engine/navigator';
import { updateRegistry } from './engine/util';

import { analysisService } from './services/analysis-service';

import BoardWidget      from './components/BoardWidget.vue';
import SidebarWidget    from './components/SidebarWidget.vue';
import TreeWidget       from './components/TreeWidget.vue';
import TabWidget        from './components/TabWidget.vue';
import RegistryEditor   from './components/RegistryEditor.vue';
import PaletteEditor    from './components/PaletteEditor.vue';
import CardSetEditor    from './components/CardSetEditor.vue';
import AnalysisControls from './components/AnalysisControls.vue';
import Toolbar          from './components/Toolbar.vue';
import StatusBar        from './components/StatusBar.vue';
import MintCardModal    from './components/MintCardModal.vue';
import ConfirmLoadModal from './components/ConfirmLoadModal.vue';
import ForestDirectory  from './components/ForestDirectory.vue';
import SystemLogPanel   from './components/SystemLogPanel.vue';
import RootErrorBoundary from './components/RootErrorBoundary.vue';
import LocalePicker     from './components/LocalePicker.vue';

import { useReviewSession } from './composables/useReviewSession';
import ColorDebugStrip  from './components/charts/ColorDebugStrip.vue';
import QeuboBookmarks   from './components/QeuboBookmarks.vue';

useUserIORegistry();

const { t } = useI18n();
const { openFileDialog } = useSgfLoader();
const { downloadActiveBoard } = useSgfDownload();
const engineControls     = useEngineControls();
const metadata           = useMetadata(activeBoard);
const auth               = useAuth();

const activeBoardId = computed(() => activeBoard.value?.id as BoardId | null);
const reviewSession = useReviewSession(activeBoardId);
const mintModalRef = vueRef<InstanceType<typeof MintCardModal> | null>(null);

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
    if (store.engine.activeMode[curr.id] === 'ponder') {
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
const { handleLoadCard } = useDirtyBoardGuard(confirmLoadModalRef);

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
  { id: 'cards',    label: t('app.tabs.cards')    },
  { id: 'settings', label: t('app.tabs.settings') },
  { id: 'analysis', label: t('app.tabs.analysis') },
  { id: 'other',    label: t('app.tabs.other')    },
]);

const moveNumber = computed((): number => {
  const board = activeBoard.value;
  if (!board) return 0;
  let count = 0;
  // Tightened from `string | null` to `NodeId | null`. The walk starts
  // at `board.currentNodeId` (NodeId) and proceeds via `node.parent`
  // (NodeId | null); the loose `string` was a signature lie that
  // forced a Record-indexing error at the next line. With the branded
  // type, board.nodes[currId] is type-safe with no cast.
  let currId: NodeId | null = board.currentNodeId;
  while (currId) {
    // Explicit annotation breaks TS7022 circular inference. After
    // ADR-0001's readonly removal, TS can no longer use the readonly
    // hint to break the cycle between `node`'s inferred type and
    // `currId`'s reassignment from `node.parent`. Annotating `node`
    // breaks the cycle by removing one side of the inference.
    const node: GameNode | undefined = board.nodes[currId];
    if (node?.move?.type === 'place') count++;
    currId = node?.parent ?? null;
  }
  return count;
});

function handleBoardMove(x: number, y: number): void {
  if (reviewSession.state.value !== 'IDLE') {
    if (reviewSession.state.value === 'AWAITING_MOVE') {
      reviewSession.processUserMove(x, y);
    }
    return; 
  }

  if (!activeBoard.value) return;
  const next = applyGoMove(activeBoard.value, x, y);
  if (next) updateBoardState(store.activeBoardIndex, next);
}

// Tightened from `nodeId: string` to `nodeId: NodeId` to match
// TreeWidget's tightened `select-node` emit signature. The handler
// now receives the branded type directly; navigateTo (which expects
// NodeId) is satisfied without a cast.
function handleNodeSelect(nodeId: NodeId): void {
  if (!activeBoard.value) return;
  mutateBoard(activeBoard.value.id, draft => navigateTo(draft, nodeId));
}

function handleSettingsUpdate(e: { path: string[]; value: any }): void { updateRegistry(store.profile.settings, e.path, e.value); }
function handleSessionUpdate(e: { path: string[]; value: any }): void { updateRegistry(store.session.ui, e.path, e.value); }
function handleProfileUpdate(e: { path: string[]; value: any }): void { updateRegistry(store.profile, e.path, e.value); }
</script>

<template>
  <RootErrorBoundary>
  <div id="main-area">
    <MintCardModal ref="mintModalRef" />
    <ConfirmLoadModal ref="confirmLoadModalRef" />
    <SidebarWidget v-show="store.session.ui.sidebarExpanded" />

    <div id="main-workspace">
      
      <div class="top-nav-bar">
        <button class="collapse-btn" @click="store.session.ui.sidebarExpanded = !store.session.ui.sidebarExpanded" :title="$t('app.chrome.toggleSidebar')">
          {{ store.session.ui.sidebarExpanded ? '◀' : '▶' }}
        </button>

        <Toolbar
          :engine-status="engineControls.status.value"
          :metrics="engineControls.metrics.value"
          @load-sgf="openFileDialog"
          @save-sgf="downloadActiveBoard"
          @toggle-engine="engineControls.toggle"
          @mint-card="triggerMint"
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
            />
          </div>
          <StatusBar
            v-if="activeBoard"
            :move-number="moveNumber"
            :metadata="metadata"
            :turn="activeBoard.turn"
            :captures="activeBoard.captures"
            @update-komi="handleUpdateKomi"
          />
        </div>

        <div id="vue-tree-panel" v-show="store.session.ui.treeExpanded">
          <div id="tree-panel-header">{{ $t('app.chrome.gameTreePanelHeader') }}</div>
          <TreeWidget
            v-if="activeBoard"
            :nodes="activeBoard.nodes"
            :current-node-id="activeBoard.currentNodeId"
            :board-id="activeBoard.id"
            @select-node="handleNodeSelect"
          />
        </div>

        <div v-show="store.session.ui.controlsExpanded" class="panel-resizer" @mousedown="startResize"></div>

        <div
          id="control-panel"
          v-show="store.session.ui.controlsExpanded"
          :style="{ flex: '1 1 0', minWidth: 0 }"
        >
          <TabWidget
            :tabs="controlTabs"
            v-model="(store.session.ui.activeTab as string)"
          >

            <template #cards>
              <div style="flex: 1; display: flex; min-height: 0; width: 100%;">
                <ForestDirectory @load-card="handleLoadCard" />
              </div>
            </template>

            <template #settings>
              <!--
                Each subsection is a native <details> disclosure. Open by
                default — no behavior change for users opening the tab the
                first time after this lands; collapsing is purely an
                opt-in space-saver. @click.stop on the Force Persistence
                button keeps clicks from bubbling up to <summary>'s
                toggle.
              -->
              <div class="tab-padding">
                <details class="settings-section" open>
                  <summary>
                    <h3 class="sub-header">{{ $t('settings.section.analysisEnv') }}</h3>
                    <button class="toolbar-btn-sm" @click.stop="sync.forceSave()">{{ $t('settings.button.forcePersistence') }}</button>
                  </summary>
                  <div style="margin-top: var(--space-medium);">
                    <PaletteEditor :env="store.profile.settings.engine.katago.analysis_env" @update="handleSettingsUpdate"/>
                  </div>
                </details>

                <details class="settings-section section-divider" open>
                  <summary><h3 class="sub-header">{{ $t('settings.section.cardSets') }}</h3></summary>
                  <div class="registry-container" style="max-height: 500px; padding-bottom: var(--space-medium);">
                    <CardSetEditor
                      :cardSets="store.profile.cardSets"
                      :activeCardSetId="store.session.ui.activeCardSetId"
                      @update="handleProfileUpdate"
                      @update-active="(id) => store.session.ui.activeCardSetId = id"
                    />
                  </div>
                </details>

                <details class="settings-section section-divider" open>
                  <summary><h3 class="sub-header">{{ $t('settings.section.advancedRegistry') }}</h3></summary>
                  <div class="registry-container">
                    <RegistryEditor :registry="store.profile.settings" :defaults="DEFAULTS.profile" @update="handleSettingsUpdate"/>
                  </div>
                </details>

                <details class="settings-section section-divider" open>
                  <summary><h3 class="sub-header">{{ $t('settings.section.sessionUI') }}</h3></summary>
                  <div class="registry-container">
                    <RegistryEditor :registry="store.session.ui" :defaults="DEFAULTS.session" @update="handleSessionUpdate"/>
                  </div>
                </details>
              </div>
            </template>

            <template #analysis>
              <AnalysisControls v-if="activeBoard" :boardId="activeBoard.id" />
            </template>

            <template #other>
              <div class="tab-padding">
                <h3 class="sub-header">{{ $t('other.section.gradientCalibration') }}</h3>
                <div class="hue-slider-row">
                  <label class="hue-slider-label">
                    <span>{{ $t('other.label.hueOffset') }}</span>
                    <span class="hue-slider-value">{{ store.profile.settings.appearance.intensityHueShift }}°</span>
                  </label>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    v-model.number="store.profile.settings.appearance.intensityHueShift"
                    class="hue-slider-input"
                  />
                </div>
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

/* The top nav bar always spans the full width of main-workspace */
.top-nav-bar {
  display: flex; align-items: center; background: var(--surface-0);
  border-bottom: 1px solid var(--surface-1); padding: 0 var(--space-default); height: 32px; flex-shrink: 0;
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
   saturates at full square. */
#board-column {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  height: 100%;
  aspect-ratio: 1 / 1;
  max-width: var(--board-target-px, 100%);
  min-width: 0;
  min-height: 0;
}

#content { flex: 1; display: flex; justify-content: center; align-items: center; min-height: 0; }

#vue-tree-panel { width: 220px; display: flex; flex-direction: column; border-left: 1px solid var(--surface-1); background: var(--border-1); min-height: 0; flex-shrink: 0; padding-right: 5px; }
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
.tab-padding-sr { padding: var(--space-medium) var(--space-default); text-align: center; }
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
.deck-dropdown { width: 100%; padding: var(--space-default); font-size: var(--text-emphasis); margin-bottom: var(--space-default); background: var(--surface-1); color: var(--text-0); border: 1px solid var(--border-2); border-radius: var(--radius-default); outline: none; }
.deck-dropdown:focus { border-color: var(--accent-primary); }

.action-btn-large { background: var(--accent-primary); color: var(--text-0); border: none; padding: var(--space-tight) var(--space-medium); cursor: pointer; border-radius: var(--radius-default); font-weight: bold; width: 100%; }
.toolbar-btn-sm { border: 1px solid var(--border-3); color: var(--text-1); padding: 1px 4px; font-size: var(--text-emphasis); cursor: pointer; border-radius: var(--radius-default); }
.registry-container { margin-top: 0; background: var(--surface-2); border: 1px solid var(--surface-3); border-radius: var(--radius-default); max-height: 400px; overflow-y: auto; }

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

.hue-slider-row { display: flex; flex-direction: column; gap: var(--space-tight); margin-bottom: var(--space-default); }
.hue-slider-label { display: flex; justify-content: space-between; align-items: center; font-size: var(--text-body); color: var(--text-1); text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.hue-slider-value { background: var(--surface-3); padding: 0 var(--space-default); border-radius: var(--radius-default); color: var(--accent-primary); font-family: monospace; }
.hue-slider-input { width: 100%; accent-color: var(--accent-primary); cursor: pointer; }
</style>
