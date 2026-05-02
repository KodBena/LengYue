<!--
  src/components/ForestDirectory.vue
  Master-Detail view for Database Exploration. Hosts the card-tree
  widget (per docs/notes/card-tree-frontend-spec.md) in two modes:
  Decks tab drives the active-set rendering from a CardSet pipeline
  result; Roots tab drives a single-tree browse-mode view. The
  data state lives in `useCardTreeData`.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { store } from '../store';
import { backendService } from '../services/backend-service';
import type { CardId, ForestStat, ReviewCard } from '../types';
import { useCardTreeData } from '../composables/useCardTreeData';
import CardTreeWidget from './charts/CardTreeWidget.vue';

const emit = defineEmits<{
  (e: 'load-card', card: ReviewCard): void;
}>();

const activeTab = ref<'decks' | 'roots'>('decks');

// Roots panel state — separate from the tree-data composable; this
// is the left-pane list, not the tree being rendered.
const roots = ref<ForestStat[]>([]);
const isLoadingRoots = ref(false);
const activeRootId = ref<number | null>(null);

const tree = useCardTreeData();
const selectedDeckId = ref<string>(store.session.ui.activeCardSetId);
const orientation = ref<'horizontal' | 'vertical'>('vertical');

function toggleOrientation(): void {
  orientation.value = orientation.value === 'horizontal' ? 'vertical' : 'horizontal';
}

onMounted(async () => {
  isLoadingRoots.value = true;
  try {
    roots.value = await backendService.getForestStats();
    tree.setForestStats(roots.value);
    if (roots.value.length > 0) {
      await selectRoot(roots.value[0].root_card_id as CardId);
    }
  } catch (err) {
    console.error('Failed to load Forest Directory:', err);
  } finally {
    isLoadingRoots.value = false;
  }
});

async function selectRoot(rootCardId: CardId): Promise<void> {
  activeRootId.value = rootCardId as unknown as number;
  await tree.loadBrowse(rootCardId);
}

async function reloadRoots(): Promise<void> {
  roots.value = await backendService.getForestStats();
  tree.setForestStats(roots.value);
}

async function runDeck(): Promise<void> {
  const deck = store.profile.cardSets[selectedDeckId.value];
  if (!deck) return;
  // Database tab supplies its own root list to the deck (schema-
  // version 11 lifted contextIds off the CardSet onto per-tab UI).
  await tree.runPipeline(deck, store.session.ui.databaseContextIds);
}

function updateContextIds(val: string): void {
  // Mirrors CardSetEditor's parser: split on comma, parse, drop NaN.
  store.session.ui.databaseContextIds = val
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));
}

function handleNodeClick(payload: { cardId: CardId; role: 'active' | 'context' }): void {
  const card = tree.cards.value.get(payload.cardId);
  if (card) {
    emit('load-card', card);
    return;
  }
  // Card not yet hydrated — fetch then load.
  tree.requestCard(payload.cardId).then(() => {
    const fresh = tree.cards.value.get(payload.cardId);
    if (fresh) emit('load-card', fresh);
  });
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
          <label>Select Deck:</label>
          <select v-model="selectedDeckId" class="dark-select deck-dropdown">
            <option v-for="set in store.profile.cardSets" :key="set.id" :value="set.id">
              {{ set.name }}
            </option>
          </select>
          <p class="hint">{{ store.profile.cardSets[selectedDeckId]?.description }}</p>

          <label style="margin-top: 8px;">Context IDs:</label>
          <input
            type="text"
            class="dark-input deck-dropdown"
            placeholder="e.g. 3, 4, 12"
            :value="store.session.ui.databaseContextIds.join(', ')"
            @input="(e: any) => updateContextIds(e.target.value)"
            title="Comma-separated root card ids fed to the deck pipeline."
          />

          <button class="action-btn-large" @click="runDeck">Run pipeline</button>
        </div>
      </div>

      <!-- TAB 2: ROOTS -->
      <div v-if="activeTab === 'roots'" class="roots-view">
        <div class="tools-row">
          <span style="font-size: 10px; color: var(--text-2);">All Game Sources</span>
          <button class="reload-btn" @click="reloadRoots">↻</button>
        </div>

        <div v-if="isLoadingRoots" class="empty-state">Loading Roots...</div>
        <div v-else-if="roots.length === 0" class="empty-state">No cards in database.</div>

        <div v-else class="roots-list">
          <div
            v-for="root in roots"
            :key="root.root_card_id"
            class="root-card"
            :class="{ active: activeRootId === root.root_card_id }"
            @click="selectRoot(root.root_card_id as CardId)"
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

    <!-- RIGHT PANEL: Card-tree widget -->
    <div class="tree-panel">
      <div class="panel-header">
        <span>Lineage Explorer</span>
        <div class="header-controls">
          <button
            class="orient-btn"
            :title="orientation === 'horizontal' ? 'Switch to vertical layout (root on top)' : 'Switch to horizontal layout (root on left)'"
            @click="toggleOrientation"
          >
            {{ orientation === 'horizontal' ? '⇥ horizontal' : '⇩ vertical' }}
          </button>
          <span class="tree-meta" v-if="tree.forest.value.length">
            {{ tree.forest.value.length }} {{ tree.forest.value.length === 1 ? 'tree' : 'trees' }} ·
            {{ tree.activeSet.value.size }} active
          </span>
        </div>
      </div>

      <div v-if="tree.isLoading.value" class="empty-state">Loading tree…</div>
      <div v-else-if="tree.error.value" class="empty-state error">{{ tree.error.value }}</div>
      <div v-else-if="tree.forest.value.length === 0" class="empty-state">
        {{ activeTab === 'decks' ? 'Run a deck to populate the view.' : 'Select a source to explore.' }}
      </div>

      <div v-else class="chart-wrapper">
        <CardTreeWidget
          :forest="tree.forest.value"
          :active-set="tree.activeSet.value"
          :cards="tree.cards.value"
          :forest-stats="tree.forestStats.value"
          :orientation="orientation"
          @node-click="handleNodeClick"
          @request-card="tree.requestCard"
        />
      </div>
    </div>

  </div>
</template>

<style scoped>
.forest-container { display: flex; flex: 1; height: 100%; min-height: 0; background: var(--surface-0); }
.left-panel { width: 280px; display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--surface-3); background: var(--surface-1); flex-shrink: 0; }
.panel-header { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-bottom: 1px solid var(--surface-3); background: var(--surface-2); font-size: 11px; text-transform: uppercase; color: var(--text-0); letter-spacing: 0.1em; flex-shrink: 0; }
.tab-switcher { padding: 0; display: flex; }
.tab-switcher button { flex: 1; background: transparent; border: none; color: var(--text-2); padding: 4px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; border-bottom: 2px solid transparent; transition: color 0.2s, background 0.2s; }
.tab-switcher button:hover { background: var(--surface-2); color: var(--text-1); }
.tab-switcher button.active { color: var(--accent-primary); border-bottom-color: var(--accent-primary); background: var(--surface-2); }
.decks-view, .roots-view { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.deck-selector-box { padding: 6px; border-bottom: 1px solid var(--surface-3); }
.deck-selector-box label { font-size: 11px; color: var(--text-2); display: block; margin-bottom: 3px; text-transform: uppercase; }
.deck-dropdown { width: 100%; padding: 2px 4px; font-size: 12px; margin-bottom: 4px; background: var(--surface-0); color: var(--text-0); border: 1px solid var(--border-2); border-radius: 3px; outline: none; }
.deck-dropdown:focus { border-color: var(--accent-primary); }
.hint { font-size: 10px; color: var(--text-2); margin: 0 0 4px 0; }
.action-btn-large { width: 100%; background: var(--surface-2); color: var(--accent-primary); border: 1px solid var(--border-2); padding: 2px 4px; border-radius: 3px; font-size: 11px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; }
.action-btn-large:hover { background: var(--surface-3); border-color: var(--accent-primary); }
.tools-row { display: flex; justify-content: space-between; align-items: center; padding: 3px 8px; border-bottom: 1px solid var(--surface-3); }
.reload-btn { background: none; border: none; color: var(--text-2); cursor: pointer; font-size: 14px; padding: 0; line-height: 1; }
.reload-btn:hover { color: var(--accent-primary); }
.roots-list { flex: 1; overflow-y: auto; padding: 4px; display: flex; flex-direction: column; gap: 3px; }
.root-card { background: var(--surface-2); border: 1px solid var(--border-2); border-radius: 4px; padding: 4px 6px; cursor: pointer; transition: border-color 0.2s; flex-shrink: 0; }
.root-card:hover { border-color: var(--border-3); }
.root-card.active { border-color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 5%, transparent); }
.root-title { font-size: 12px; font-weight: bold; color: var(--text-0); margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.root-meta { font-size: 10px; color: var(--text-2); margin-bottom: 3px; }
.root-stats { display: flex; justify-content: space-between; font-size: 10px; color: var(--text-1); background: var(--surface-0); padding: 1px 3px; border-radius: 2px; }
.tree-panel { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.header-controls { display: flex; align-items: center; gap: 6px; }
.orient-btn { background: var(--surface-2); color: var(--accent-primary); border: 1px solid var(--border-2); border-radius: 3px; padding: 1px 3px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; font-family: inherit; }
.orient-btn:hover { background: var(--surface-3); border-color: var(--accent-primary); }
.tree-meta { color: var(--accent-primary); font-size: 10px; }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-2); font-size: 12px; }
.empty-state.error { color: var(--state-error); }
.chart-wrapper { flex: 1; padding: 4px; min-height: 0; display: flex; }
</style>
