<!--
  src/components/modals/PlayEngineModal.vue
  Modal for managing "play vs engine" sessions on the active
  board. Two sections in one surface:

    1. ACTIVE GAMES — every game-root on the current board listed
       with its config and an "End" button. Per the user's design
       (game identity = node identity), this is where games are
       removed; there's no separate tree-context-menu path in v1.

    2. START NEW GAME — form for adding a game-root at the current
       cursor position. Shape mirrors EngineMatchModal's per-color
       fields collapsed to a single side: user color, engine model
       (SELECTOR-mode only), engine max visits. Submit creates
       a `games[currentNodeId]` entry; the engine responder fires
       immediately if the start position is engine-to-play.

  The modal reads `activeBoard` from the store directly (same
  posture as `EngineMatchModal`). Emits `start-game` and `end-game`
  events that App.vue translates into `mutateBoard` calls + a
  responder kick.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { store, activeBoard } from '../../store';
import type { BoardState, GameNode, NodeId, StoneColor } from '../../types';

const { t } = useI18n();

const isOpen = ref(false);
const userColor = ref<StoneColor>('B');
const engineModel = ref<string | undefined>(undefined);
const engineVisits = ref(500);

// SELECTOR-mode dropdown gate — identical to EngineMatchModal.
// In LEAF / non-SELECTOR mode the engine is whichever singleton
// the user is connected to; no per-game model choice to surface.
const isSelectorMode = computed(() => {
  const caps = store.engine.info.capabilities;
  return caps !== null && 'selector' in caps;
});

const availableModels = computed(() => store.engine.info.availableModels);

const singleEngineLabel = computed(
  () => store.engine.info.internalName ?? availableModels.value[0]?.label ?? '—',
);

// Move number for a given node — walks parents counting `place`
// moves. Used to label active-game entries ("Move N — you play
// …"). Local helper rather than a util import because no other
// caller needs it yet; promote if a second consumer surfaces.
function getMoveNumber(board: BoardState, nodeId: NodeId): number {
  let count = 0;
  let cur: NodeId | null = nodeId;
  while (cur !== null) {
    // Explicit annotation breaks TS7022 circular inference (same
    // shape as App.vue's `moveNumber` computed, post-ADR-0001 the
    // readonly hint that previously broke the cycle is gone).
    const node: GameNode | undefined = board.nodes[cur];
    if (node?.move?.type === 'place') count++;
    cur = node?.parent ?? null;
  }
  return count;
}

// Active games on the current board, sorted by start move number
// for stable display. Re-evaluates reactively as `activeBoard.games`
// changes (the store's reactive proxy + `Object.entries` walk).
// Each row shows the START position (the session's stable identity)
// and the CURRENT HEAD position (the single green ring's location;
// moves forward as the game progresses).
const activeGames = computed(() => {
  const board = activeBoard.value;
  if (!board) return [];
  return Object.entries(board.games)
    .map(([startNodeId, session]) => ({
      startNodeId: startNodeId as NodeId,
      config: session.config,
      startMoveNumber: getMoveNumber(board, startNodeId as NodeId),
      headMoveNumber: getMoveNumber(board, session.currentHeadNodeId),
    }))
    .sort((a, b) => a.startMoveNumber - b.startMoveNumber);
});

const emit = defineEmits<{
  (e: 'start-game', opts: {
    userColor: StoneColor;
    engineMaxVisits: number;
    engineModel: string | null;
  }): void;
  (e: 'end-game', nodeId: NodeId): void;
}>();

defineExpose({
  open() {
    // Prefill model from the user's current SELECTOR selection;
    // visits keeps its last-used value so back-to-back game
    // starts don't re-prompt for the same number.
    const current = store.engine.selectedModel ?? availableModels.value[0]?.label;
    engineModel.value = current ?? undefined;
    isOpen.value = true;
  },
});

function close() {
  isOpen.value = false;
}

function submit() {
  emit('start-game', {
    userColor: userColor.value,
    engineMaxVisits: engineVisits.value,
    engineModel: isSelectorMode.value ? (engineModel.value ?? null) : null,
  });
  close();
}

function endGame(nodeId: NodeId) {
  emit('end-game', nodeId);
}

const canSubmit = computed(() => {
  if (engineVisits.value < 1) return false;
  if (isSelectorMode.value && !engineModel.value) return false;
  return true;
});

function colorLabel(c: StoneColor): string {
  return c === 'B'
    ? t('playEngine.userColorBlack')
    : t('playEngine.userColorWhite');
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @mousedown.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ t('playEngine.title') }}</h2>
        <button class="close-btn" @click="close">×</button>
      </div>

      <div class="modal-body">
        <p class="hint">{{ t('playEngine.subtitle') }}</p>

        <!-- ── Active games on this board ─────────────────── -->
        <div class="section-heading">{{ t('playEngine.activeGamesHeading') }}</div>
        <div v-if="activeGames.length === 0" class="empty-hint">
          {{ t('playEngine.activeGamesEmpty') }}
        </div>
        <ul v-else class="active-games-list">
          <li v-for="g in activeGames" :key="g.startNodeId" class="active-game-row">
            <span class="active-game-label">
              {{ t('playEngine.activeGameLabel', {
                start: g.startMoveNumber,
                head: g.headMoveNumber,
                color: colorLabel(g.config.userColor),
                visits: g.config.engineMaxVisits,
              }) }}
            </span>
            <button class="end-btn" @click="endGame(g.startNodeId)">
              {{ t('playEngine.activeGameEndBtn') }}
            </button>
          </li>
        </ul>

        <!-- ── Start new game ─────────────────────────────── -->
        <div class="section-heading">{{ t('playEngine.startHeading') }}</div>

        <div v-if="!isSelectorMode" class="single-engine-note">
          {{ t('playEngine.singleEngineNote', { label: singleEngineLabel }) }}
        </div>

        <div class="form-grid">
          <label>{{ t('playEngine.field.userColor') }}</label>
          <select v-model="userColor" class="dark-select">
            <option value="B">{{ t('playEngine.userColorBlack') }}</option>
            <option value="W">{{ t('playEngine.userColorWhite') }}</option>
          </select>

          <template v-if="isSelectorMode">
            <label>{{ t('playEngine.field.engineModel') }}</label>
            <select v-model="engineModel" class="dark-select">
              <option
                v-for="m in availableModels"
                :key="m.label"
                :value="m.label"
              >{{ m.label }}</option>
            </select>
          </template>

          <label>{{ t('playEngine.field.engineVisits') }}</label>
          <input
            type="number"
            v-model.number="engineVisits"
            min="1"
            step="100"
            class="dark-input"
          />
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="close">
          {{ t('playEngine.button.cancel') }}
        </button>
        <button class="btn-submit" :disabled="!canSubmit" @click="submit">
          {{ t('playEngine.button.start') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.1);
  display: flex; align-items: center; justify-content: center; z-index: var(--z-modal);
}
/* magic-literal: 420px modal width — same design decision as
   EngineMatchModal.vue (sibling modal, intentional parity). */
.modal-content {
  background: var(--surface-0); border: 1px solid var(--border-2); border-radius: var(--radius-default);
  width: 420px; max-width: 90vw; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
  display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: var(--space-medium); border-bottom: 1px solid var(--surface-3); background: var(--surface-2);
}
.modal-header h2 { margin: 0; font-size: var(--text-heading); color: var(--text-0); text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.close-btn { background: none; border: none; color: var(--text-2); font-size: var(--text-heading); cursor: pointer; }
.modal-body { padding: var(--space-medium); }

.section-heading {
  font-size: var(--text-emphasis);
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: var(--tracking-default);
  margin: var(--space-medium) 0 var(--space-small) 0;
}
.section-heading:first-of-type { margin-top: var(--space-medium); }

.empty-hint {
  color: var(--text-muted);
  font-size: var(--text-body);
  font-style: italic;
  padding: var(--space-small) 0;
}

.active-games-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-tiny);
}
.active-game-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-medium);
  padding: var(--space-small) var(--space-default);
  background: var(--surface-2);
  border: 1px solid var(--border-3);
  border-radius: var(--radius-default);
}
.active-game-label {
  color: var(--text-1);
  font-family: monospace;
  font-size: var(--text-emphasis);
}
.end-btn {
  background: transparent;
  border: 1px solid var(--state-attention);
  color: var(--state-attention);
  padding: 2px var(--space-default);
  font-size: var(--text-emphasis);
  text-transform: uppercase;
  letter-spacing: var(--tracking-tight);
  border-radius: var(--radius-default);
  cursor: pointer;
  font-family: 'Courier New', monospace;
}
.end-btn:hover { background: color-mix(in srgb, var(--state-attention) 15%, transparent); }

.single-engine-note {
  background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent);
  border-radius: var(--radius-default);
  padding: var(--space-default) var(--space-medium);
  font-size: var(--text-emphasis);
  color: var(--text-1);
  margin-bottom: var(--space-medium);
  font-family: monospace;
}

.form-grid {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: var(--space-medium);
  align-items: center;
}
.form-grid label {
  font-size: var(--text-emphasis);
  color: var(--text-2);
  text-transform: uppercase;
}
.dark-input, .dark-select {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: var(--space-default); border-radius: var(--radius-default);
  font-family: monospace; font-size: var(--text-emphasis); width: 100%; outline: none;
}
.dark-input:focus, .dark-select:focus { border-color: var(--accent-primary); }

.hint { font-size: var(--text-body); color: var(--text-2); margin: 0; }

.modal-footer {
  display: flex; justify-content: flex-end; gap: var(--space-medium);
  padding: var(--space-medium); border-top: 1px solid var(--surface-3); background: var(--surface-2);
}
.btn-cancel { background: transparent; border: 1px solid var(--border-3); color: var(--text-1); padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-submit { background: var(--accent-primary); border: none; color: var(--surface-1); font-weight: bold; padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-submit:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }
</style>
