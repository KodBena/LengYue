<!--
  src/components/QeuboToolbar.vue
  qEUBO calibration cluster — embedded in Toolbar.vue when an
  experiment is active. Surfaces the audition toggle, verdict pair,
  apply, pin, and phase indicator described in dispatch v1.2 §3.5.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useQeubo } from '../composables/useQeubo';
import { pushSystemMessage } from '../store';

const q = useQeubo();

// Render gate: hide entirely when calibration is disabled (503 from
// the backend) or the user has no experiment configured. The
// parameter-meta editor is the only entry that creates an experiment;
// until it lands the user must drive `q.startNewExperiment(...)` from
// the dev console to make this cluster appear.
const visible = computed<boolean>(
  () => q.calibrationEnabled.value === true && q.experimentExists.value,
);

const hasPair = computed<boolean>(() => q.currentPair.value !== null);

const verdictDisabled = computed<boolean>(() => q.isBusy.value || !hasPair.value);
const applyVisible = computed<boolean>(() => q.toolbarView.value !== 'applied');

const phaseLabel = computed<string>(() => {
  const init = q.initProgress.value;
  if (init) return `init ${init.done}/${init.total}`;
  const opt = q.optimizationProgress.value;
  if (opt) return `iter ${opt.iteration}`;
  return '';
});

// Tooltip explaining GP-fitting cost grows cubic in the number of
// observations, so users naturally hit a wall in mid-hundreds and
// should stop voting once successive bests stabilise. The dispatch's
// `?` affordance.
const phaseTooltip =
  'qEUBO fits a Gaussian process over the responses you submit. ' +
  'GP fitting cost is cubic in the number of observations, so each ' +
  "iteration is slower than the last. Stop voting once the best estimate " +
  'has stabilised — no hard cap is enforced.';

function setView(v: 'applied' | 'A' | 'B'): void {
  q.toolbarView.value = v;
}

async function onVerdict(preferred: 0 | 1): Promise<void> {
  try {
    await q.submitPreference(preferred);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushSystemMessage('error', `qEUBO verdict failed: ${msg}`);
  }
}

function onApply(): void {
  try {
    q.applyEffective();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushSystemMessage('error', `qEUBO apply failed: ${msg}`);
  }
}

function onPin(): void {
  const name = window.prompt('Bookmark name:');
  if (name === null) return; // user cancelled
  try {
    q.pinCurrent(name);
    pushSystemMessage('info', `qEUBO bookmark "${name.trim()}" saved.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushSystemMessage('error', `qEUBO pin failed: ${msg}`);
  }
}
</script>

<template>
  <div v-if="visible" class="qeubo-cluster">
    <!-- Audition toggle. v-model on q.toolbarView would also work
         but explicit click handlers give us per-button styling and
         keyboard semantics. -->
    <div class="seg-toggle" role="radiogroup" aria-label="qEUBO audition view">
      <button
        type="button"
        class="seg-btn"
        :class="{ active: q.toolbarView.value === 'applied' }"
        :disabled="q.isBusy.value"
        role="radio"
        :aria-checked="q.toolbarView.value === 'applied'"
        @click="setView('applied')"
      >Applied</button>
      <button
        type="button"
        class="seg-btn"
        :class="{ active: q.toolbarView.value === 'A' }"
        :disabled="q.isBusy.value || !hasPair"
        role="radio"
        :aria-checked="q.toolbarView.value === 'A'"
        @click="setView('A')"
      >A</button>
      <button
        type="button"
        class="seg-btn"
        :class="{ active: q.toolbarView.value === 'B' }"
        :disabled="q.isBusy.value || !hasPair"
        role="radio"
        :aria-checked="q.toolbarView.value === 'B'"
        @click="setView('B')"
      >B</button>
    </div>

    <!-- Verdict pair. Hidden when there is no pair to vote on (e.g.
         briefly between submit and next-fetch, or pre-bootstrap). -->
    <div v-if="hasPair" class="verdict-pair">
      <button
        type="button"
        class="verdict-btn"
        :disabled="verdictDisabled"
        title="Submit qEUBO observation: A is better"
        @click="onVerdict(0)"
      >I prefer A</button>
      <button
        type="button"
        class="verdict-btn"
        :disabled="verdictDisabled"
        title="Submit qEUBO observation: B is better"
        @click="onVerdict(1)"
      >I prefer B</button>
    </div>

    <!-- Apply: promote the current audition to persistent. Hidden
         when toolbarView==='applied' (nothing to apply). -->
    <button
      v-if="applyVisible"
      type="button"
      class="apply-btn"
      :disabled="q.isBusy.value"
      title="Write the current audition into analysis_env.parameters"
      @click="onApply"
    >Use this</button>

    <!-- Pin: snapshot effective values to qeuboPinnedBookmarks. -->
    <button
      type="button"
      class="pin-btn"
      :disabled="q.isBusy.value"
      title="Pin the current audition as a bookmark"
      @click="onPin"
    >Pin</button>

    <!-- Phase indicator with `?` tooltip. -->
    <span v-if="phaseLabel" class="phase-indicator" :title="phaseTooltip">
      {{ phaseLabel }} <span class="phase-help">?</span>
    </span>

    <!-- Spinner placeholder; toolbar already shows engine spinners
         elsewhere so this is intentionally minimal. -->
    <span v-if="q.isBusy.value" class="busy-dot" aria-label="qEUBO request in flight">●</span>
  </div>
</template>

<style scoped>
.qeubo-cluster { display: flex; align-items: center; gap: var(--space-default); padding: 0 var(--space-default); border-left: 1px solid var(--border-2); border-right: 1px solid var(--border-2); font-family: 'Courier New', monospace; font-size: var(--text-emphasis); text-transform: uppercase; letter-spacing: 0.05em; }
.seg-toggle { display: flex; border: 1px solid var(--border-3); border-radius: 3px; overflow: hidden; }
.seg-btn { background: var(--border-1); border: none; border-right: 1px solid var(--border-3); color: var(--text-1); padding: 5px 10px; font-size: var(--text-emphasis); cursor: pointer; font-family: inherit; text-transform: inherit; letter-spacing: inherit; transition: background var(--duration-default), color var(--duration-default); }
.seg-btn:last-child { border-right: none; }
/* theme-exception: .seg-btn:hover #3a3a3a is between border-2 (#333)
   and border-3 (#555); closest to border-2 (distance 5). Snapping
   collapses with .seg-btn.active's #1a3a4a (which is a muted-cyan
   variant) into a non-distinguishing pair. Preserved verbatim. */
.seg-btn:hover:not(:disabled) { background: #3a3a3a; color: var(--text-0); }
/* theme-exception: .seg-btn.active and .apply-btn:hover backgrounds
   use muted-cyan variants (#1a3a4a) — designer-intentional darkened
   accent surfaces. The substrate has only --accent-primary; muted
   variants would need new anchors. Same pattern used on .apply-btn
   border (#2a5a7a) and .phase-help border. */
.seg-btn.active { background: #1a3a4a; color: var(--accent-primary); }
.seg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.verdict-pair { display: flex; gap: var(--space-tight); }
.verdict-btn, .apply-btn, .pin-btn { background: var(--border-2); border: 1px solid var(--border-3); color: var(--text-1); padding: 5px 10px; font-size: var(--text-emphasis); cursor: pointer; border-radius: 3px; font-family: inherit; text-transform: inherit; letter-spacing: inherit; transition: background var(--duration-default), border-color var(--duration-default), color var(--duration-default); }
.verdict-btn:hover:not(:disabled), .apply-btn:hover:not(:disabled), .pin-btn:hover:not(:disabled) { background: var(--border-3); border-color: var(--border-3); color: var(--text-0); }
.verdict-btn:disabled, .apply-btn:disabled, .pin-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.apply-btn { border-color: #2a5a7a; color: var(--accent-primary); }
.apply-btn:hover:not(:disabled) { background: #1a3a4a; border-color: var(--accent-primary); }
.phase-indicator { color: var(--text-2); font-size: var(--text-body); letter-spacing: 0.08em; cursor: help; padding: 0 var(--space-tight); }
.phase-help { color: var(--accent-primary); border: 1px solid #2a5a7a; border-radius: 50%; width: 12px; height: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: var(--text-tiny); margin-left: var(--space-tight); }
.busy-dot { color: var(--accent-primary); font-size: var(--text-body); animation: pulse var(--duration-slow) infinite; }
@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1.0; } }
</style>
