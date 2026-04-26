<!-- 
  src/components/ForestDirectory.vue 
  Master-Detail view for Database Exploration.
-->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { store } from '../store';
import { ebisuService } from '../services/ebisu-service';
import type { ForestStat, ReviewCard } from '../types';
import LineageTreeChart from './charts/LineageTreeChart.vue';

const emit = defineEmits<{
  (e: 'load-card', card: ReviewCard): void;
}>();

const activeTab = ref<'decks' | 'roots'>('decks');

// Roots State
const roots = ref<ForestStat[]>([]);
const isLoadingRoots = ref(false);
const activeRootId = ref<number | null>(null);

// Shared Tree State
const activeTreeCards = ref<ReviewCard[]>([]);
const isTreeLoading = ref(false);

// Decks State
const selectedDeckId = ref<string>(store.session.ui.activeCardSetId);

onMounted(async () => {
  isLoadingRoots.value = true;
  try {
    roots.value = await ebisuService.getForestStats();
    if (roots.value.length > 0) {
      await loadTree(roots.value[0].root_card_id);
    }
  } catch (err) {
    console.error("Failed to load Forest Directory:", err);
  } finally {
    isLoadingRoots.value = false;
  }
});

async function loadTree(rootCardId: number) {
  activeRootId.value = rootCardId;
  isTreeLoading.value = true;
  activeTreeCards.value = [];
  
  try {
    const pipeline = [
      { stage: "select", selection: { type: "SubtreeSelection", n: 0 }, ordering: { type: "DepthKey" } }
    ];
    activeTreeCards.value = await ebisuService.queryForest([rootCardId], pipeline);
  } catch (err) {
    console.error(`Failed to load tree for root ${rootCardId}:`, err);
  } finally {
    isTreeLoading.value = false;
  }
}
</script>

<template>
  <div class="forest-container">
    
    <!-- LEFT PANEL: Navigation -->
    <div class="left-panel">
      <div class="panel-header tab-switcher">
        <button :class="{ active: activeTab === 'decks' }" @click="activeTab = 'decks'">Decks</button>
        <button :class="{ active: activeTab === 'roots' }" @click="activeTab = 'roots'">Roots</button>
      </div>

      <!-- TAB 1: DECKS -->
      <div v-if="activeTab === 'decks'" class="decks-view">
        <div class="deck-selector-box">
          <label>Select Deck to Prune:</label>
          <select v-model="selectedDeckId" class="dark-select deck-dropdown">
            <option v-for="set in store.profile.cardSets" :key="set.id" :value="set.id">
              {{ set.name }}
            </option>
          </select>
          <p class="hint">{{ store.profile.cardSets[selectedDeckId]?.description }}</p>
        </div>
        <div class="empty-state" style="text-align: center; padding: 20px;">
          <p>Pruned Steiner Tree visualization coming soon.</p>
        </div>
      </div>

      <!-- TAB 2: ROOTS (Legacy Directory) -->
      <div v-if="activeTab === 'roots'" class="roots-view">
        <div class="tools-row">
          <span style="font-size: 10px; color:#888;">All Game Sources</span>
          <button class="reload-btn" @click="ebisuService.getForestStats().then(r => roots = r)">↻</button>
        </div>

        <div v-if="isLoadingRoots" class="empty-state">Loading Roots...</div>
        <div v-else-if="roots.length === 0" class="empty-state">No cards in database.</div>
        
        <div v-else class="roots-list">
          <div 
            v-for="root in roots" 
            :key="root.root_card_id" 
            class="root-card"
            :class="{ active: activeRootId === root.root_card_id }"
            @click="loadTree(root.root_card_id)"
          >
            <div class="root-title">{{ root.description || 'Unknown Game' }}</div>
            <div class="root-meta">{{ root.player_black || '?' }} vs {{ root.player_white || '?' }}</div>
            <div class="root-stats">
              <span title="Total Cards">🗂️ {{ root.total_cards }}</span>
              <span title="Total Reviews">🔄 {{ root.total_reviews }}</span>
              <span title="Average Ebisu T (Recall)">🧠 {{ root.average_recall.toFixed(2) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- RIGHT PANEL: Tree Browser -->
    <div class="tree-panel">
      <div class="panel-header">
        <span>Lineage Explorer</span>
        <span class="tree-meta" v-if="activeTreeCards.length">
          {{ activeTreeCards.length }} Nodes Loaded
        </span>
      </div>

      <div v-if="isTreeLoading" class="empty-state">Loading Lineage DAG...</div>
      <div v-else-if="activeTreeCards.length === 0" class="empty-state">Select a source to explore.</div>
      
      <div v-else class="chart-wrapper">
        <LineageTreeChart 
          :cards="activeTreeCards" 
          @node-click="(c) => emit('load-card', c)" 
        />
      </div>
    </div>

  </div>
</template>

<style scoped>
.forest-container { display: flex; flex: 1; height: 100%; min-height: 0; background: #0a0a0a; }

.left-panel { width: 280px; display: flex; flex-direction: column; min-height: 0; border-right: 1px solid #222; background: #111; flex-shrink: 0; }

.panel-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; border-bottom: 1px solid #222; background: #181818; font-size: 11px; text-transform: uppercase; color: #fff; letter-spacing: 0.1em; flex-shrink: 0; }

.tab-switcher { padding: 0; display: flex; }
.tab-switcher button { flex: 1; background: transparent; border: none; color: #888; padding: 12px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; border-bottom: 2px solid transparent; transition: color 0.2s, background 0.2s; }
.tab-switcher button:hover { background: #1a1a1a; color: #ccc; }
.tab-switcher button.active { color: #4aaef0; border-bottom-color: #4aaef0; background: #1a1a1a; }

.decks-view, .roots-view { display: flex; flex-direction: column; flex: 1; min-height: 0; }

.deck-selector-box { padding: 15px; border-bottom: 1px solid #222; }
.deck-selector-box label { font-size: 11px; color: #888; display: block; margin-bottom: 6px; text-transform: uppercase; }
.deck-dropdown { width: 100%; padding: 8px; font-size: 12px; margin-bottom: 8px; background: #0a0a0a; color: #eee; border: 1px solid #333; border-radius: 3px; outline: none; }
.deck-dropdown:focus { border-color: #4aaef0; }
.hint { font-size: 10px; color: #666; margin: 0; }

.tools-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 15px; border-bottom: 1px solid #222; }
.reload-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 14px; padding: 0; line-height: 1; }
.reload-btn:hover { color: #4aaef0; }

.roots-list { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.root-card { background: #181818; border: 1px solid #333; border-radius: 4px; padding: 10px; cursor: pointer; transition: border-color 0.2s; flex-shrink: 0; }
.root-card:hover { border-color: #555; }
.root-card.active { border-color: #4aaef0; background: rgba(74, 174, 240, 0.05); }
.root-title { font-size: 12px; font-weight: bold; color: #eee; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.root-meta { font-size: 10px; color: #888; margin-bottom: 8px; }
.root-stats { display: flex; justify-content: space-between; font-size: 10px; color: #aaa; background: #0a0a0a; padding: 4px 6px; border-radius: 2px; }

.tree-panel { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.tree-meta { color: #4aaef0; font-size: 10px; }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: #666; font-size: 12px; }
.chart-wrapper { flex: 1; padding: 10px; min-height: 0; display: flex; }
</style>
