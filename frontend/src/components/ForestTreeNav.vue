<!--
  src/components/ForestTreeNav.vue
  File-manager-style hierarchical navigator for the Forest Directory.
  Renders games (top level) → roots, with expand/collapse, inline
  per-node aggregate stats, and a render-cap affordance for games
  whose root count exceeds VIRT_THRESHOLD (the 276-root case from
  the user's actual data motivated this — sample-loader populates
  one game_source with hundreds of roots; sub-50 is plenty for
  organic uploads where each game typically yields one root).
  Pure presentation over the `useForestNavigation` composable
  (consumed via the `nav` prop). No events emitted — interactions
  call the composable's mutators directly; the parent reacts to
  `nav.selection.value` to drive the right pane.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import type { CardId, NavSelection } from '../types';
import type {
  ForestNavGameNode,
  ForestNavRootNode,
  ForestNavigation,
} from '../composables/useForestNavigation';

const props = defineProps<{
  nav: ForestNavigation;
}>();

// Render-cap threshold: a game whose root count exceeds this gets
// its first VIRT_THRESHOLD roots rendered plus a "+ N more"
// affordance instead of all roots DOM-mounted at once. Render-cap
// (vs. true virtual scrolling) is sufficient because the user's
// recovery move is to refine the parent game selection rather than
// scroll a long list — file-manager idiom expects a manageable child
// count per node.
const VIRT_THRESHOLD = 50;

function isExpanded(game: ForestNavGameNode): boolean {
  return props.nav.expanded.value.has(game.nodeId);
}

function isSelected(target: NavSelection): boolean {
  const sel = props.nav.selection.value;
  if (!sel || sel.kind !== target.kind) return false;
  if (sel.kind === 'game' && target.kind === 'game') {
    return sel.gameSourceId === target.gameSourceId;
  }
  if (sel.kind === 'root' && target.kind === 'root') {
    return sel.rootCardId === target.rootCardId;
  }
  return false;
}

function selectGame(game: ForestNavGameNode): void {
  props.nav.select({ kind: 'game', gameSourceId: game.gameSourceId });
}

function selectRoot(rootCardId: CardId): void {
  props.nav.select({ kind: 'root', rootCardId });
}

function visibleRoots(game: ForestNavGameNode): readonly ForestNavRootNode[] {
  return game.roots.length <= VIRT_THRESHOLD
    ? game.roots
    : game.roots.slice(0, VIRT_THRESHOLD);
}

function hiddenCount(game: ForestNavGameNode): number {
  return Math.max(0, game.roots.length - VIRT_THRESHOLD);
}
</script>

<template>
  <div class="forest-tree-nav">
    <div v-if="nav.nodes.value.length === 0" class="empty-state">
      No games loaded.
    </div>
    <div
      v-for="game in nav.nodes.value"
      :key="game.nodeId"
      class="game-block"
    >
      <div
        class="game-row"
        :class="{ selected: isSelected({ kind: 'game', gameSourceId: game.gameSourceId }) }"
        @click="selectGame(game)"
      >
        <button
          class="chevron-btn"
          :title="isExpanded(game) ? 'Collapse' : 'Expand'"
          @click.stop="nav.toggle(game.nodeId)"
        >
          {{ isExpanded(game) ? '▾' : '▸' }}
        </button>
        <div class="game-meta">
          <div class="game-title">{{ game.title }}</div>
          <div class="game-aggregate">
            <span>{{ game.aggregate.rootCount }}&nbsp;{{ game.aggregate.rootCount === 1 ? 'root' : 'roots' }}</span>
            <span title="Total Cards">🗂️ {{ game.aggregate.totalCards }}</span>
            <span title="Total Reviews">🔄 {{ game.aggregate.totalReviews }}</span>
            <span
              v-if="game.aggregate.totalReviews > 0"
              title="Average Recall (weighted by reviews)"
            >🧠 {{ game.aggregate.averageRecall.toFixed(2) }}</span>
          </div>
        </div>
      </div>

      <div v-if="isExpanded(game)" class="root-list">
        <div
          v-for="root in visibleRoots(game)"
          :key="root.nodeId"
          class="root-row"
          :class="{ selected: isSelected({ kind: 'root', rootCardId: root.rootCardId }) }"
          @click="selectRoot(root.rootCardId)"
        >
          <div class="root-title">{{ root.stat.description || 'Unnamed root' }}</div>
          <div class="root-meta">{{ root.stat.playerBlack || '?' }} vs {{ root.stat.playerWhite || '?' }}</div>
          <div class="root-stats">
            <span title="Total Cards">🗂️ {{ root.stat.totalCards }}</span>
            <span title="Total Reviews">🔄 {{ root.stat.totalReviews }}</span>
            <span title="Average Recall">🧠 {{ root.stat.averageRecall.toFixed(2) }}</span>
          </div>
        </div>
        <div v-if="hiddenCount(game) > 0" class="more-affordance">
          + {{ hiddenCount(game) }} more — collapse and select the parent game to load all roots
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.forest-tree-nav { flex: 1; overflow-y: auto; padding: var(--space-tight); display: flex; flex-direction: column; gap: 2px; }
.empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-2); font-size: var(--text-emphasis); }
.game-block { display: flex; flex-direction: column; flex-shrink: 0; }
.game-row { display: flex; align-items: flex-start; gap: var(--space-tight); padding: var(--space-tight) var(--space-default); background: var(--surface-2); border: 1px solid var(--border-2); border-radius: var(--radius-default); cursor: pointer; transition: border-color var(--duration-default); }
.game-row:hover { border-color: var(--border-3); }
.game-row.selected { border-color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 5%, transparent); }
.chevron-btn { background: none; border: none; color: var(--text-2); cursor: pointer; font-size: var(--text-body); padding: 0 2px; line-height: 1; flex-shrink: 0; }
.chevron-btn:hover { color: var(--text-0); }
.game-meta { flex: 1; min-width: 0; }
.game-title { font-size: var(--text-emphasis); font-weight: bold; color: var(--text-0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
.game-aggregate { display: flex; flex-wrap: wrap; gap: var(--space-tight); font-size: var(--text-body); color: var(--text-1); }
.root-list { display: flex; flex-direction: column; gap: 2px; margin: 2px 0 var(--space-tight) var(--space-medium); padding-left: var(--space-tight); border-left: 1px solid var(--surface-3); }
.root-row { background: var(--surface-1); border: 1px solid var(--border-2); border-radius: var(--radius-default); padding: var(--space-tight) var(--space-default); cursor: pointer; transition: border-color var(--duration-default); flex-shrink: 0; }
.root-row:hover { border-color: var(--border-3); }
.root-row.selected { border-color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 5%, transparent); }
.root-title { font-size: var(--text-emphasis); font-weight: bold; color: var(--text-0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
.root-meta { font-size: var(--text-body); color: var(--text-2); margin-bottom: 3px; }
.root-stats { display: flex; justify-content: space-between; font-size: var(--text-body); color: var(--text-1); background: var(--surface-0); padding: 1px 3px; border-radius: var(--radius-default); }
.more-affordance { font-size: var(--text-body); color: var(--text-2); padding: var(--space-tight) var(--space-default); font-style: italic; }
</style>
