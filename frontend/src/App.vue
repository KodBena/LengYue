<script setup lang="ts">
import { computed, watch } from 'vue';
import { ref as vueRef } from 'vue';

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
import { themeColor } from './utils/theme-color';
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

const { openFileDialog } = useSgfLoader();
const { downloadActiveBoard } = useSgfDownload();
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
  const accentSecondary = themeColor('--accent-secondary');
  const data = reviewSession.userMoveScores.value.map((score, index) => {
    return { value: [index + 1, score], itemStyle: { color: accentSecondary } };
  });
  return [{ name: 'Move Score (Delta)', data, color: accentSecondary, showPoints: true }];
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

// Transient auto-reveal of the system-log panel on error/warning
// arrivals when `systemLogExpanded` is false. See the composable for
// the UX rationale and timer mechanics.
const transientLogReveal = useTransientLogReveal();

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
        <button class="collapse-btn" @click="store.session.ui.sidebarExpanded = !store.session.ui.sidebarExpanded" title="Toggle Board Inventory">
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
          :style="{ flex: '1 1 0', minWidth: 0 }"
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

                    <label style="margin-top: 8px;">Context IDs:</label>
                    <input
                      type="text"
                      class="dark-input deck-dropdown"
                      placeholder="e.g. 3, 4, 12"
                      :value="store.session.ui.srContextIds.join(', ')"
                      @input="(e: any) => store.session.ui.srContextIds = e.target.value.split(',').map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n))"
                      title="Comma-separated root card ids fed to the deck pipeline."
                    />
                  </div>

                  <button
                    class="action-btn-large"
                    style="background: var(--accent-secondary); color: var(--surface-1); margin-bottom: 20px;"
                    @click="startEbisu"
                    :disabled="reviewSession.state.value === 'LOADING' || !store.profile.cardSets[store.session.ui.activeCardSetId]"
                  >
                    {{ reviewSession.state.value === 'LOADING' ? 'Fetching Cards...' : 'Start Review Session' }}
                  </button>
                </div>

                <div v-else-if="reviewSession.currentCard.value">
                  <h3>{{ reviewSession.state.value === 'FINISHED' ? 'Intermission' : 'Review Active' }}</h3>
                  <p class="hint text-muted" style="margin-bottom: 10px;">
                    Card {{ reviewSession.queue.value.indexOf(reviewSession.currentCard.value) + 1 }} of {{ reviewSession.queue.value.length }}
                  </p>
                  
                  <p style="font-weight: bold; margin-bottom: 15px;" 
                     :style="{ color: reviewSession.state.value === 'FINISHED' ? 'var(--accent-secondary)' : 'var(--state-attention)' }">
                    Status: {{ reviewSession.state.value }} 
                    <span v-if="reviewSession.state.value === 'ANALYZING'">(KataGo is pondering...)</span>
                  </p>

                  <div v-if="reviewSession.state.value === 'FINISHED'" style="height: 180px; width: 100%; margin-bottom: 20px; background: var(--surface-0); border: 1px solid var(--surface-3); border-radius: 4px;">
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
                    <h3 class="sub-header">Analysis Environment</h3>
                    <button class="toolbar-btn-sm" @click.stop="sync.forceSave()">Force Persistence</button>
                  </summary>
                  <div style="margin-top: 10px;">
                    <PaletteEditor :env="store.profile.settings.engine.katago.analysis_env" @update="handleSettingsUpdate"/>
                  </div>
                </details>

                <details class="settings-section section-divider" open>
                  <summary><h3 class="sub-header">Card Sets (Decks)</h3></summary>
                  <div class="registry-container" style="max-height: 500px; padding-bottom: 10px;">
                    <CardSetEditor
                      :cardSets="store.profile.cardSets"
                      :activeCardSetId="store.session.ui.activeCardSetId"
                      @update="handleProfileUpdate"
                      @update-active="(id) => store.session.ui.activeCardSetId = id"
                    />
                  </div>
                </details>

                <details class="settings-section section-divider" open>
                  <summary><h3 class="sub-header">Advanced Registry</h3></summary>
                  <div class="registry-container">
                    <RegistryEditor :registry="store.profile.settings" :defaults="DEFAULTS.profile" @update="handleSettingsUpdate"/>
                  </div>
                </details>

                <details class="settings-section section-divider" open>
                  <summary><h3 class="sub-header">Session (UI)</h3></summary>
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
  background: var(--surface-1);
}

/* The top nav bar always spans the full width of main-workspace */
.top-nav-bar {
  display: flex; align-items: center; background: var(--surface-3);
  border-bottom: 1px solid var(--surface-1); padding: 0 6px; height: 32px; flex-shrink: 0;
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
#tree-panel-header { height: 20px; background: var(--border-1); border-bottom: 1px solid var(--surface-1); display: flex; align-items: center; padding: 0 6px; font-size: 9px; letter-spacing: 0.16em; color: var(--text-2); text-transform: uppercase; flex-shrink: 0; }
#control-panel { border-left: 1px solid var(--surface-1); background: var(--surface-3); flex-shrink: 0; display: flex; flex-direction: column; }

/* theme-exception: .panel-resizer #eba46d is a peach accent color
   outside the substrate vocabulary (the chrome substrate has
   --accent-primary cyan and --accent-secondary orange #f0a04a; this
   peach is distinct from both). Used as a visual handle for the
   board / control-panel divider. */
.panel-resizer { width: 4px; background: #eba46d; cursor: col-resize; z-index: var(--z-affordance); flex-shrink: 0; transition: background var(--duration-default); }
.panel-resizer:hover, .panel-resizer:active { background: var(--accent-primary); }

.tab-padding { padding: 8px; }
.tab-padding-sr { padding: 12px 8px; text-align: center; }
.section-divider { border-top: 1px solid var(--surface-3); margin-top: 0; padding-top: 0; }
.sub-header { color: var(--text-2); font-size: 14px; margin-bottom: 10px; }

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
  padding: 4px 0;
}
.settings-section > summary::-webkit-details-marker { display: none; }
.settings-section > summary::before {
  content: '▶';
  margin-right: 8px;
  font-size: 9px;
  color: var(--text-2);
  transition: transform var(--duration-default) ease;
  flex-shrink: 0;
}
.settings-section[open] > summary::before { transform: rotate(90deg); }
.settings-section > summary > h3 { margin: 0; flex: 1; }
.settings-section > summary > .toolbar-btn-sm { margin-left: 8px; }
.settings-section > summary:hover > h3 { color: var(--text-2); }

.deck-selector-box { background: var(--surface-2); padding: 15px; border-radius: 4px; border: 1px solid var(--surface-3); margin-bottom: 20px; text-align: left; }
.deck-selector-box label { font-size: 11px; color: var(--text-2); display: block; margin-bottom: 6px; text-transform: uppercase; }
.deck-dropdown { width: 100%; padding: 8px; font-size: 12px; margin-bottom: 8px; background: var(--surface-1); color: var(--text-0); border: 1px solid var(--border-2); border-radius: 3px; outline: none; }
.deck-dropdown:focus { border-color: var(--accent-primary); }

.action-btn-large { background: var(--accent-primary); color: var(--text-0); border: none; padding: 4px 10px; cursor: pointer; border-radius: 4px; font-weight: bold; width: 100%; }
.toolbar-btn-sm { background: var(--border-2); border: 1px solid var(--border-3); color: var(--text-1); padding: 1px 4px; font-size: 11px; cursor: pointer; border-radius: 3px; }
.toolbar-btn-sm:hover { background: var(--border-3); border-color: var(--border-3); }
.registry-container { margin-top: 0; background: var(--surface-2); border: 1px solid var(--surface-3); border-radius: 4px; max-height: 400px; overflow-y: auto; }

.collapse-btn { background: color-mix(in srgb, var(--surface-2) 80%, transparent); border: 1px solid var(--border-2); color: var(--text-2); height: 18px; padding: 0 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 3px; font-size: 10px; }
.collapse-btn:hover { background: var(--border-2); color: var(--text-0); border-color: var(--border-3); }
.right-toggles { display: flex; gap: 6px; margin-left: auto; }

/* Visits override row in the SR tab during an active review */
.visits-override-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  background: var(--surface-2);
  border: 1px solid var(--surface-3);
  border-radius: 4px;
  margin-bottom: 10px;
  text-align: left;
}
.visits-override-row label {
  font-size: 11px;
  color: var(--text-2);
  text-transform: uppercase;
}
.dark-input {
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  color: var(--text-1);
  font-size: 11px;
}
.visits-input {
  width: 100px;
  padding: 4px 6px;
  font-family: monospace;
  outline: none;
  border-radius: 3px;
}
.visits-input:focus { border-color: var(--accent-primary); }

.hue-slider-row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.hue-slider-label { display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: var(--text-1); text-transform: uppercase; letter-spacing: 0.05em; }
.hue-slider-value { background: var(--surface-3); padding: 0 8px; border-radius: 3px; color: var(--accent-primary); font-family: monospace; }
.hue-slider-input { width: 100%; accent-color: var(--accent-primary); cursor: pointer; }
</style>
