<script setup lang="ts">
import { computed, watch } from 'vue';
import { ref as vueRef } from 'vue';

import { useMetadata }       from './composables/useMetadata';
import { useSgfLoader }      from './composables/useSgfLoader';
import { useEngineControls } from './composables/useEngineControls';
import { useUserIORegistry } from './composables/useUserIORegistry';
import { useAuth }           from './composables/useAuth';
import { useResizablePanel } from './composables/useResizablePanel';
import { useDirtyBoardGuard } from './composables/useDirtyBoardGuard';
import { useAppBootstrap } from './composables/useAppBootstrap';
import { useInitialLayoutSettle } from './composables/useInitialLayoutSettle';
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

import { useReviewSession } from './composables/useReviewSession';
import BaseChart from './components/charts/BaseChart.vue';
import ColorDebugStrip  from './components/charts/ColorDebugStrip.vue';
import QeuboBookmarks   from './components/QeuboBookmarks.vue';

useUserIORegistry();
useInitialLayoutSettle();

const { openFileDialog } = useSgfLoader();
const engineControls     = useEngineControls();
const metadata           = useMetadata(activeBoard);
const auth               = useAuth();

const activeBoardId = computed(() => activeBoard.value?.id as BoardId | null);
const reviewSession = useReviewSession(activeBoardId);
const mintModalRef = vueRef<InstanceType<typeof MintCardModal> | null>(null);

// ─── BUG FIX: "Follow Me" Ponder Watcher ─────────────────────────────────────
// Automatically restarts pondering when the user navigates or plays a move
watch(
  () => activeBoard.value?.currentNodeId,
  (newId, oldId) => {
    if (newId && newId !== oldId && activeBoard.value) {
      const boardId = activeBoard.value.id;
      // If the engine is active in 'ponder' mode on this board, follow the cursor!
      if (store.engine.activeMode[boardId] === 'ponder') {
        analysisService.analyzeActiveNode(boardId, 'ponder');
      }
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

const intermissionSeries = computed(() => {
  if (reviewSession.state.value !== 'FINISHED') return [];
  const data = reviewSession.userMoveScores.value.map((score, index) => {
    return { value: [index + 1, score], itemStyle: { color: '#f0a04a' } };
  });
  return [{ name: 'Move Score (Delta)', data, color: '#f0a04a', showPoints: true }];
});

const { startResize } = useResizablePanel();

async function startEbisu() {
  await reviewSession.startSession(store.session.ui.activeCardSetId);
}

// Thin adapter: the input event's value arrives as a string from the
// DOM; the composable wants a number. Validation (finite, >= 1) lives
// in setVisitsOverride itself, so this wrapper is purely about types.
function handleVisitsOverrideChange(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  const n = Number(raw);
  reviewSession.setVisitsOverride(n);
}

const { sync } = useAppBootstrap(auth);

const controlTabs = [
  { id: 'sr',       label: 'SR'       },
  { id: 'database', label: 'Database' },
  { id: 'settings', label: 'Settings' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'other',    label: 'Other'    },
];

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
        <button class="collapse-btn" @click="store.session.ui.sidebarExpanded = !store.session.ui.sidebarExpanded">
          {{ store.session.ui.sidebarExpanded ? '◀' : '▶' }}
        </button>

        <Toolbar
          :engine-status="engineControls.status.value"
          :metrics="engineControls.metrics.value"
          @load-sgf="openFileDialog"
          @toggle-engine="engineControls.toggle"
          @mint-card="triggerMint"
          style="flex: 1; border-bottom: none;" 
        />

        <div class="right-toggles">
          <button class="collapse-btn" @click="store.session.ui.boardExpanded = !store.session.ui.boardExpanded" title="Toggle Main Board">
            🔲 {{ store.session.ui.boardExpanded ? '▶' : '◀' }}
          </button>
          <button class="collapse-btn" @click="store.session.ui.treeExpanded = !store.session.ui.treeExpanded" title="Toggle Game Tree">
            🌲 {{ store.session.ui.treeExpanded ? '▶' : '◀' }}
          </button>
          <button class="collapse-btn" @click="store.session.ui.controlsExpanded = !store.session.ui.controlsExpanded" title="Toggle Control Panel">
            ⚙️ {{ store.session.ui.controlsExpanded ? '▶' : '◀' }}
          </button>
        </div>
      </div>

      <!-- Persistent system-log bar. Hidden when the user unchecks
           `systemLogExpanded` in the Session (UI) registry. Messages
           continue to accumulate in the store while hidden and become
           visible again on re-enable. -->
      <SystemLogPanel v-if="store.session.ui.systemLogExpanded" />

      <div id="split-workspace">
        
        <div id="board-column" v-show="store.session.ui.boardExpanded">
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
          <div id="tree-panel-header">Game Tree</div>
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
          :style="{ 
            width: store.session.ui.boardExpanded ? (store.session.ui.controlPanelWidth || 340) + 'px' : 'auto',
            flex: store.session.ui.boardExpanded ? '0 0 ' + (store.session.ui.controlPanelWidth || 340) + 'px' : '1',
            minWidth: 0
          }"
        >
          <TabWidget
            :tabs="controlTabs"
            v-model="(store.session.ui.activeTab as string)"
          >

            <template #sr>
              <div class="tab-padding-sr">
                <div v-if="reviewSession.state.value === 'IDLE' || reviewSession.state.value === 'LOADING'">
                  <h3>Spaced Repetition</h3>
                  
                  <div class="deck-selector-box">
                    <label>Deck:</label>
                    <select v-model="store.session.ui.activeCardSetId" class="dark-select deck-dropdown">
                      <option v-for="set in store.profile.cardSets" :key="set.id" :value="set.id">
                        {{ set.name }}
                      </option>
                    </select>
                    <p class="hint">{{ store.profile.cardSets[store.session.ui.activeCardSetId]?.description }}</p>
                  </div>

                  <button 
                    class="action-btn-large" 
                    style="background: #f0a04a; color: #111; margin-bottom: 20px;" 
                    @click="startEbisu"
                    :disabled="reviewSession.state.value === 'LOADING' || !store.profile.cardSets[store.session.ui.activeCardSetId]"
                  >
                    {{ reviewSession.state.value === 'LOADING' ? 'Fetching Cards...' : 'Start Review Session' }}
                  </button>
                  <hr style="border-color: #222; margin-bottom: 20px;"/>
                  <button class="action-btn-large" @click="openFileDialog">Browse SGF…</button>
                  <p class="hint text-muted" style="margin-top: 10px;">Load an SGF to freely explore.</p>
                </div>

                <div v-else-if="reviewSession.currentCard.value">
                  <h3>{{ reviewSession.state.value === 'FINISHED' ? 'Intermission' : 'Review Active' }}</h3>
                  <p class="hint text-muted" style="margin-bottom: 10px;">
                    Card {{ reviewSession.queue.value.indexOf(reviewSession.currentCard.value) + 1 }} of {{ reviewSession.queue.value.length }}
                  </p>
                  
                  <p style="font-weight: bold; margin-bottom: 15px;" 
                     :style="{ color: reviewSession.state.value === 'FINISHED' ? '#f0a04a' : '#ff4a4a' }">
                    Status: {{ reviewSession.state.value }} 
                    <span v-if="reviewSession.state.value === 'ANALYZING'">(KataGo is pondering...)</span>
                  </p>

                  <div v-if="reviewSession.state.value === 'FINISHED'" style="height: 180px; width: 100%; margin-bottom: 20px; background: #0a0a0a; border: 1px solid #222; border-radius: 4px;">
                    <BaseChart :series="intermissionSeries" :zoomRange="[1, reviewSession.currentCard.value.numMoves]" />
                  </div>

                  <p class="hint text-muted" style="margin-bottom: 10px;" v-if="reviewSession.state.value !== 'FINISHED'">
                    Moves made: {{ reviewSession.userMovesCount.value }} / {{ reviewSession.currentCard.value.numMoves }}
                  </p>

                  <!-- Per-card sticky visits override. The input shows the
                       effective value (override if set, else the card's
                       defaultVisits). Persists across moves within the
                       same card; auto-resets on next card via loadCard. -->
                  <div v-if="reviewSession.state.value !== 'FINISHED'" class="visits-override-row">
                    <label>Max visits (this card):</label>
                    <input
                      type="number"
                      min="1"
                      step="50"
                      :value="reviewSession.effectiveVisits.value"
                      @change="handleVisitsOverrideChange"
                      class="dark-input visits-input"
                    />
                  </div>

                  <button class="action-btn-large" style="margin-bottom: 10px; margin-top: 15px;" @click="reviewSession.nextCard">
                    {{ reviewSession.state.value === 'FINISHED' ? 'Next Card' : 'Skip Card' }}
                  </button>
                  
                  <button class="toolbar-btn-sm" @click="reviewSession.rewindToStart">
                    Rewind to Start
                  </button>
                </div>
              </div>
            </template>

            <template #database>
              <div style="flex: 1; display: flex; min-height: 0; width: 100%;">
                <ForestDirectory @load-card="handleLoadCard" />
              </div>
            </template>

            <template #settings>
              <div class="tab-padding">
                <div class="settings-header">
                  <h3 style="display:inline-block">Analysis Environment</h3>
                  <button class="toolbar-btn-sm" @click="sync.forceSave()" style="float:right">Force Persistence</button>
                </div>
                <div style="margin-top: 10px;">
                  <PaletteEditor :env="store.profile.settings.engine.katago.analysis_env" @update="handleSettingsUpdate"/>
                </div>

                <div class="registry-container section-divider" style="max-height: 500px; padding-bottom: 10px;">
                  <h3 class="sub-header">Card Sets (Decks)</h3>
                  <CardSetEditor 
                    :cardSets="store.profile.cardSets" 
                    :activeCardSetId="store.session.ui.activeCardSetId"
                    @update="handleProfileUpdate"
                    @update-active="(id) => store.session.ui.activeCardSetId = id"
                  />
                </div>

                <div class="registry-container section-divider">
                  <h3 class="sub-header">Advanced Registry</h3>
                  <RegistryEditor :registry="store.profile.settings" :defaults="DEFAULTS.profile" @update="handleSettingsUpdate"/>
                </div>
                <div class="registry-container section-divider">
                  <h3 class="sub-header">Session (UI)</h3>
                  <RegistryEditor :registry="store.session.ui" :defaults="DEFAULTS.session" @update="handleSessionUpdate"/>
                </div>
              </div>
            </template>

            <template #analysis>
              <AnalysisControls v-if="activeBoard" :boardId="activeBoard.id" />
            </template>

            <template #other>
              <div class="tab-padding">
                <h3 class="sub-header">Gradient Calibration</h3>
                <div class="hue-slider-row">
                  <label class="hue-slider-label">
                    <span>Hue Offset</span>
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

                <h3 class="sub-header section-divider" style="margin-top: 24px;">qEUBO Bookmarks</h3>
                <QeuboBookmarks />
              </div>
            </template>

          </TabWidget>
        </div>
      </div> </div> </div>
  </RootErrorBoundary>
</template>

<style>
@import "./assets/css/style.css";
@import "./assets/css/palettes.css";

#app {
  height: 100vh; width: 100vw;
  background-color: #1a1a1a; color: #eee;
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
  background: #111;
}

/* The top nav bar always spans the full width of main-workspace */
.top-nav-bar { 
  display: flex; align-items: center; background: #252525; 
  border-bottom: 1px solid #111; padding: 0 8px; height: 45px; flex-shrink: 0; 
}

/* The lower area where the resizer lives */
#split-workspace {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

#board-column {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

#content { flex: 1; display: flex; justify-content: center; align-items: center; min-height: 0; padding: 20px; }

#vue-tree-panel { width: 220px; display: flex; flex-direction: column; border-left: 1px solid #111; background: #1e1e1e; min-height: 0; flex-shrink: 0; padding-right: 5px; }
#tree-panel-header { height: 28px; background: #1e1e1e; border-bottom: 1px solid #111; display: flex; align-items: center; padding: 0 10px; font-size: 9px; letter-spacing: 0.16em; color: #363636; text-transform: uppercase; flex-shrink: 0; }
#control-panel { border-left: 1px solid #111; background: #222; flex-shrink: 0; display: flex; flex-direction: column; }

.panel-resizer { width: 4px; background: #eba46d; cursor: col-resize; z-index: 50; flex-shrink: 0; transition: background 0.2s; }
.panel-resizer:hover, .panel-resizer:active { background: #4aaef0; }

.tab-padding { padding: 20px; }
.tab-padding-sr { padding: 40px 20px; text-align: center; }
.section-divider { border-top: 1px solid #222; margin-top: 20px; padding-top: 10px; }
.sub-header { color: #666; font-size: 14px; margin-bottom: 10px; }

.deck-selector-box { background: #181818; padding: 15px; border-radius: 4px; border: 1px solid #222; margin-bottom: 20px; text-align: left; }
.deck-selector-box label { font-size: 11px; color: #888; display: block; margin-bottom: 6px; text-transform: uppercase; }
.deck-dropdown { width: 100%; padding: 8px; font-size: 12px; margin-bottom: 8px; background: #111; color: #eee; border: 1px solid #333; border-radius: 3px; outline: none; }
.deck-dropdown:focus { border-color: #4aaef0; }

.action-btn-large { background: #4aaef0; color: #fff; border: none; padding: 12px 24px; cursor: pointer; border-radius: 4px; font-weight: bold; width: 100%; }
.toolbar-btn-sm { background: #333; border: 1px solid #444; color: #ccc; padding: 4px 10px; font-size: 11px; cursor: pointer; border-radius: 3px; }
.toolbar-btn-sm:hover { background: #444; border-color: #555; }
.registry-container { margin-top: 15px; background: #181818; border: 1px solid #222; border-radius: 4px; max-height: 400px; overflow-y: auto; }

.collapse-btn { background: rgba(20, 20, 20, 0.8); border: 1px solid #333; color: #888; height: 24px; padding: 0 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 4px; font-size: 10px; }
.collapse-btn:hover { background: #333; color: #fff; border-color: #555; }
.right-toggles { display: flex; gap: 6px; margin-left: auto; }

/* Visits override row in the SR tab during an active review */
.visits-override-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  background: #181818;
  border: 1px solid #222;
  border-radius: 4px;
  margin-bottom: 10px;
  text-align: left;
}
.visits-override-row label {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
}
.dark-input {
  background: #0a0a0a;
  border: 1px solid #333;
  color: #ccc;
  font-size: 11px;
}
.visits-input {
  width: 100px;
  padding: 4px 6px;
  font-family: monospace;
  outline: none;
  border-radius: 3px;
}
.visits-input:focus { border-color: #4aaef0; }

.hue-slider-row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.hue-slider-label { display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; }
.hue-slider-value { background: #222; padding: 0 8px; border-radius: 3px; color: #4aaef0; font-family: monospace; }
.hue-slider-input { width: 100%; accent-color: #4aaef0; cursor: pointer; }
</style>
