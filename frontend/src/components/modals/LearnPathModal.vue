<!--
  src/components/modals/LearnPathModal.vue
  "Learn this path" — grows a card tree beneath the currently loaded
  anchor card by following the engine's palette-ranked candidate moves
  (spine-first, deviations recurse), then mints the collected
  deviations in one explicit, user-confirmed batch. Two-phase flow
  (ledger rows 708/718): Explore grows the tree live and leaves it
  inspectable — nothing is minted; Mint All performs the single batch
  mint only once clicked. See src/composables/cards/useLearnPath.ts
  for the full design.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { pushSystemMessage } from '../../store';
import {
  useLearnPath,
  LearnPathError,
  type LearnPathExploration,
  type LearnPathResult,
} from '../../composables/cards/useLearnPath';
import type { BoardId } from '../../types';

const { t } = useI18n();
const { explore, confirmMint, discardExploration } = useLearnPath();

type Phase = 'form' | 'exploring' | 'explored' | 'minting' | 'minted';

const isOpen = ref(false);
const phase = ref<Phase>('form');
const boardId = ref<BoardId | null>(null);

const depth = ref(4);
const topK = ref(3);
const tag = ref('');

const exploration = ref<LearnPathExploration | null>(null);
const result = ref<LearnPathResult | null>(null);
const errorMessage = ref<string | null>(null);

defineExpose({
  open(id: BoardId) {
    boardId.value = id;
    phase.value = 'form';
    exploration.value = null;
    result.value = null;
    errorMessage.value = null;
    tag.value = '';
    isOpen.value = true;
  },
});

function close() {
  // Guard, mirroring the footer "Close" button's own `:disabled`
  // (fresh-context review finding, upgraded to required): a walk in
  // flight (`explore()` mid-run, or `confirmMint()` mid-run) is a
  // pending Promise that `isOpen`/`phase` cannot cancel — it keeps
  // mutating the board and adding pre-mint markers regardless of
  // whether the modal is visible. Without this guard the BACKDROP
  // click (unlike the footer button) had no phase check at all, so it
  // could tear down `exploration.value`/`phase.value` out from under
  // the in-flight promise, orphaning the walk with no discard path
  // reachable through the UI once it eventually resolved. No-op here
  // (same as the footer button rendering disabled): the user waits for
  // the phase to land on 'explored' (a few paint-checkpoint ticks) and
  // then Close/backdrop/Discard all work normally.
  if (phase.value === 'exploring' || phase.value === 'minting') return;

  // A closed-without-confirming exploration's markers are a discard —
  // the grown tree nodes stay (documented limitation, useLearnPath.ts
  // header), but the "would be added" markers shouldn't linger once
  // the dialog is gone.
  if (exploration.value && (phase.value === 'explored')) {
    discardExploration(exploration.value);
  }
  isOpen.value = false;
  boardId.value = null;
  phase.value = 'form';
  exploration.value = null;
  result.value = null;
  errorMessage.value = null;
}

async function runExplore() {
  if (!boardId.value) return;
  const cleanTag = tag.value.trim();
  if (!cleanTag || depth.value < 1 || topK.value < 1) return;

  phase.value = 'exploring';
  errorMessage.value = null;
  try {
    exploration.value = await explore({
      boardId: boardId.value,
      depth: depth.value,
      topK: topK.value,
      tag: cleanTag,
    });
    phase.value = 'explored';
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

async function runMintAll() {
  if (!exploration.value) return;
  phase.value = 'minting';
  errorMessage.value = null;
  try {
    const r = await confirmMint(exploration.value);
    result.value = r;
    phase.value = 'minted';
    pushSystemMessage('info', t('learnPath.systemMessage.summary', {
      seeded: r.seeded.length,
      skipped: r.skipped.length,
      frontiers: r.frontiers.length,
      tag: r.tag,
    }));
  } catch (err) {
    const message = err instanceof LearnPathError ? err.message : String(err);
    errorMessage.value = message;
    pushSystemMessage('error', t('learnPath.systemMessage.failed', { err: message }));
    // confirmMint's own `finally` already cleared the markers; the
    // exploration is still available for inspection, but re-minting
    // the same batch is not offered here — a fresh Explore is the
    // documented recovery (mirrors the walk-phase's own
    // partial-progress posture).
    phase.value = 'explored';
  }
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

          <label>{{ $t('learnPath.field.tag') }}</label>
          <input
            type="text"
            v-model="tag"
            class="dark-input"
            :placeholder="$t('learnPath.field.tagPlaceholder')"
            :disabled="phase !== 'form'"
          />
        </div>

        <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>

        <p v-if="phase === 'exploring'" class="hint">{{ $t('learnPath.status.exploring') }}</p>

        <!-- Explored, not yet minted: the tree has grown live in the
             viewer (with dashed blue pre-mint markers on the deviation
             positions) and this is the confirm step the commissioner
             wants — inspect before anything touches cards.db. -->
        <div v-if="exploration && (phase === 'explored' || phase === 'minting')" class="result-box">
          <p class="result-line">{{ $t('learnPath.explore.pending', { n: exploration.pendingSeedCount - exploration.existingCount }) }}</p>
          <p v-if="exploration.existingCount > 0" class="result-line">{{ $t('learnPath.explore.existing', { n: exploration.existingCount }) }}</p>
          <p v-if="exploration.frontierCount > 0" class="result-line result-line-attention">
            {{ $t('learnPath.explore.frontiers', { n: exploration.frontierCount }) }}
          </p>
          <p v-if="exploration.unplayableCount > 0" class="result-line">{{ $t('learnPath.explore.unplayable', { n: exploration.unplayableCount }) }}</p>
        </div>

        <div v-if="result" class="result-box">
          <p class="result-line">{{ $t('learnPath.result.seeded', { n: result.seeded.length }) }}</p>
          <p class="result-line">{{ $t('learnPath.result.skipped', { n: result.skipped.length }) }}</p>
          <p v-if="result.frontiers.length > 0" class="result-line result-line-attention">
            {{ $t('learnPath.result.frontiers', { n: result.frontiers.length }) }}
          </p>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="close" :disabled="phase === 'exploring' || phase === 'minting'">
          {{ $t('learnPath.button.close') }}
        </button>
        <template v-if="phase === 'explored'">
          <button class="btn-cancel" @click="runDiscard">{{ $t('learnPath.button.discard') }}</button>
          <button class="btn-submit" @click="runMintAll">{{ $t('learnPath.button.mintAll') }}</button>
        </template>
        <button
          v-else-if="phase === 'form' || phase === 'exploring'"
          class="btn-submit"
          @click="runExplore"
          :disabled="phase === 'exploring' || !tag.trim()"
        >
          {{ phase === 'exploring' ? $t('learnPath.button.exploring') : $t('learnPath.button.explore') }}
        </button>
        <button v-else class="btn-submit" disabled>
          {{ phase === 'minting' ? $t('learnPath.button.minting') : $t('learnPath.button.mintAll') }}
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
  width: 420px; max-width: 90vw; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
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
