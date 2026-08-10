<!--
  src/components/modals/LearnPathModal.vue
  "Learn this path" — grows a card tree beneath the currently loaded
  anchor position by following the engine's palette-ranked candidate
  moves (spine-first, deviations recurse), marking every mintable
  position it discovers for the batch card-minting affordance instead
  of minting anything itself (commissioner-designed, ledger rows
  926/957/1008 — supersedes this component's own former two-phase
  Explore/Mint-All flow, ledger rows 708/718). Explore grows the tree
  live and marks it (the SAME dashed selection ring a manual ctrl+click
  in TreeWidget.vue produces); the user reviews the grown tree and hits
  the toolbar's "Mint card(s)" — this modal never calls the backend
  itself. See src/composables/cards/useLearnPath.ts for the full
  design.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { pushSystemMessage } from '../../store';
import {
  useLearnPath,
  LearnPathError,
  type LearnPathExploration,
} from '../../composables/cards/useLearnPath';
import { getAnalyzingNodeId } from '../../composables/cards/learn-path-progress';
import type { BoardId } from '../../types';

const { t } = useI18n();
const { explore, discardExploration } = useLearnPath();

type Phase = 'form' | 'exploring' | 'explored';

const isOpen = ref(false);
const phase = ref<Phase>('form');
const boardId = ref<BoardId | null>(null);

const depth = ref(4);
const topK = ref(3);

const exploration = ref<LearnPathExploration | null>(null);
const errorMessage = ref<string | null>(null);

// On-demand-analysis progress (commission ledger row 881, ADR-0002/C6
// progress honesty): while `phase === 'exploring'`, this distinguishes
// "quietly stepping through already-recorded positions" from "blocked
// waiting on the engine" — the tree-growth checkpoint alone doesn't
// tell the two apart. Reads the same module-scope registry TreeWidget's
// analyzing-ring reads (`learn-path-progress.ts`), reactive since it's
// a `reactive(Map)` read inside a computed.
const isAnalyzing = computed(() =>
  boardId.value !== null && getAnalyzingNodeId(boardId.value) !== null,
);

defineExpose({
  open(id: BoardId) {
    boardId.value = id;
    phase.value = 'form';
    exploration.value = null;
    errorMessage.value = null;
    isOpen.value = true;
  },
});

function close() {
  // Guard, mirroring the footer "Close" button's own `:disabled`
  // (fresh-context review finding, upgraded to required): a walk in
  // flight (`explore()` mid-run) is a pending Promise that
  // `isOpen`/`phase` cannot cancel — it keeps mutating the board and
  // adding selection marks regardless of whether the modal is
  // visible. Without this guard the BACKDROP click (unlike the footer
  // button) had no phase check at all, so it could tear down
  // `exploration.value`/`phase.value` out from under the in-flight
  // promise, orphaning the walk with no discard path reachable through
  // the UI once it eventually resolved. No-op here (same as the
  // footer button rendering disabled): the user waits for the phase to
  // land on 'explored' (a few paint-checkpoint ticks) and then
  // Close/backdrop/Discard all work normally.
  if (phase.value === 'exploring') return;

  // A closed-without-minting exploration's selection marks are a
  // discard — the grown tree nodes stay (documented limitation,
  // useLearnPath.ts header), but the marks this exploration ADDED
  // shouldn't linger once the dialog is gone (any OTHER selection —
  // a manual ctrl+click, or an earlier exploration — is untouched;
  // `discardExploration` un-marks exactly `exploration.addedNodeIds`).
  if (exploration.value && phase.value === 'explored') {
    discardExploration(exploration.value);
  }
  isOpen.value = false;
  boardId.value = null;
  phase.value = 'form';
  exploration.value = null;
  errorMessage.value = null;
}

async function runExplore() {
  if (!boardId.value) return;
  if (depth.value < 1 || topK.value < 1) return;

  phase.value = 'exploring';
  errorMessage.value = null;
  try {
    exploration.value = await explore({
      boardId: boardId.value,
      depth: depth.value,
      topK: topK.value,
    });
    phase.value = 'explored';
    pushSystemMessage('info', t('learnPath.systemMessage.summary', {
      pending: exploration.value.pendingSeedCount - exploration.value.existingCount,
      existing: exploration.value.existingCount,
      frontiers: exploration.value.frontierCount,
    }));
  } catch (err) {
    const message = err instanceof LearnPathError ? err.message : String(err);
    errorMessage.value = message;
    pushSystemMessage('error', t('learnPath.systemMessage.failed', { err: message }));
    phase.value = 'form';
  }
}

function runDiscard() {
  if (exploration.value) discardExploration(exploration.value);
  exploration.value = null;
  phase.value = 'form';
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @mousedown.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ $t('learnPath.title') }}</h2>
        <button class="close-btn" @click="close">×</button>
      </div>

      <div class="modal-body">
        <p class="hint">{{ $t('learnPath.intro') }}</p>

        <div class="form-grid">
          <label>{{ $t('learnPath.field.depth') }}</label>
          <input type="number" v-model.number="depth" min="1" max="12" class="dark-input" :disabled="phase !== 'form'" />

          <label>{{ $t('learnPath.field.topK') }}</label>
          <input type="number" v-model.number="topK" min="1" max="6" class="dark-input" :disabled="phase !== 'form'" />
        </div>

        <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>

        <p v-if="phase === 'exploring' && isAnalyzing" class="hint">{{ $t('learnPath.status.analyzing') }}</p>
        <p v-else-if="phase === 'exploring'" class="hint">{{ $t('learnPath.status.exploring') }}</p>

        <!-- Explored: the tree has grown live in the viewer (with the
             dashed batch-mint selection ring on every marked position)
             — this IS the deliverable; nothing is minted from this
             modal. The user reviews, then hits the toolbar's own
             "Mint card(s)". -->
        <div v-if="exploration && phase === 'explored'" class="result-box">
          <p class="result-line">{{ $t('learnPath.explore.pending', { n: exploration.pendingSeedCount - exploration.existingCount }) }}</p>
          <p v-if="exploration.existingCount > 0" class="result-line">{{ $t('learnPath.explore.existing', { n: exploration.existingCount }) }}</p>
          <p v-if="exploration.frontierCount > 0" class="result-line result-line-attention">
            {{ $t('learnPath.explore.frontiers', { n: exploration.frontierCount }) }}
          </p>
          <p v-if="exploration.unplayableCount > 0" class="result-line">{{ $t('learnPath.explore.unplayable', { n: exploration.unplayableCount }) }}</p>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="close" :disabled="phase === 'exploring'">
          {{ $t('learnPath.button.close') }}
        </button>
        <template v-if="phase === 'explored'">
          <button class="btn-cancel" @click="runDiscard">{{ $t('learnPath.button.discard') }}</button>
        </template>
        <button
          v-else
          class="btn-submit"
          @click="runExplore"
          :disabled="phase === 'exploring'"
        >
          {{ phase === 'exploring' ? $t('learnPath.button.exploring') : $t('learnPath.button.explore') }}
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

/* magic-literal: 420px modal width — matches MintCardModal.vue's
   established modal-width decision (3-site cluster, no shared
   substrate pursued there either). */
.modal-content {
  background: var(--surface-0); border: 1px solid var(--border-2); border-radius: var(--radius-default);
  width: 420px; max-width: 90vw;
  display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: var(--space-medium) var(--space-medium); border-bottom: 1px solid var(--surface-3); background: var(--surface-2);
}
.modal-header h2 { margin: 0; font-size: var(--text-heading); color: var(--text-0); text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.close-btn { background: none; border: none; color: var(--text-2); font-size: var(--text-heading); cursor: pointer; }

.modal-body { padding: var(--space-medium); }
.hint { font-size: var(--text-body); color: var(--text-2); margin: 0 0 var(--space-medium) 0; }

.form-grid { display: grid; grid-template-columns: 110px 1fr; gap: var(--space-medium); align-items: center; }
.form-grid label { font-size: var(--text-emphasis); color: var(--text-2); text-transform: uppercase; }
.dark-input {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0); padding: var(--space-default);
  border-radius: var(--radius-default); font-family: monospace; font-size: var(--text-emphasis); width: 100%; outline: none;
}
.dark-input:focus { border-color: var(--accent-primary); }
.dark-input:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }

.error-box {
  margin-top: var(--space-medium); padding: var(--space-default);
  background: color-mix(in srgb, var(--state-attention) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--state-attention) 30%, transparent);
  border-radius: var(--radius-default); color: var(--text-0); font-size: var(--text-body);
}

.result-box {
  margin-top: var(--space-medium); padding: var(--space-default);
  background: color-mix(in srgb, var(--state-success) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--state-success) 30%, transparent);
  border-radius: var(--radius-default);
}
.result-line { margin: 0 0 var(--space-tight) 0; font-size: var(--text-emphasis); color: var(--text-1); }
.result-line:last-child { margin-bottom: 0; }
.result-line-attention { color: var(--state-attention); }

.modal-footer {
  display: flex; justify-content: flex-end; gap: var(--space-medium); padding: var(--space-medium) var(--space-medium);
  border-top: 1px solid var(--surface-3); background: var(--surface-2);
}
.btn-cancel { background: transparent; border: 1px solid var(--border-3); color: var(--text-1); padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-submit { background: var(--accent-primary); border: none; color: var(--surface-1); font-weight: bold; padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-submit:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }
</style>
