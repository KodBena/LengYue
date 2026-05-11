<!--
  src/components/qeubo/QeuboToolbar.vue
  qEUBO calibration cluster — embedded in Toolbar.vue when an
  experiment is active. Surfaces the audition toggle, verdict pair,
  apply, pin, and phase indicator described in dispatch v1.2 §3.5.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQeubo } from '../../composables/useQeubo';
import { pushSystemMessage } from '../../store';

const { t } = useI18n();
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
  if (init) return t('qeubo.phase.init', { done: init.done, total: init.total });
  const opt = q.optimizationProgress.value;
  if (opt) return t('qeubo.phase.iter', { n: opt.iteration });
  return '';
});

// Tooltip on the phase-indicator's `?` affordance. Covers both the
// cluster's overall workflow (the seg-toggle / verdict / apply / pin
// labels are individually opaque) and the GP-fitting cost curve
// (cubic in observations — users naturally hit a wall in mid-hundreds
// and should stop voting once successive bests stabilise).
const phaseTooltip = computed<string>(() => t('qeubo.phaseTooltip'));

// Debug readout: current view + applied (persisted) + effective
// (preview-overlaid) parameter sets, shown inline as plain text
// when the ⊗ toggle is active. Inline rather than tooltip so state
// changes across user actions are visible side-by-side; the toggle
// keeps the cluster uncluttered when not actively debugging.
function formatParams(params: Record<string, number>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return '{}';
  return `{${entries.map(([k, v]) => `${k}: ${v}`).join(', ')}}`;
}
const paramsDebug = computed<string>(() => {
  const view = q.toolbarView.value;
  const a = formatParams(q.appliedParameterValues.value);
  const e = formatParams(q.effectiveParameterValues.value);
  return `view=${view}  applied=${a}  effective=${e}`;
});

// Local toggle: the ⊗ icon flips this; the debug strip is gated on
// it. Component-local since debug visibility is a per-session
// preference, not part of the qEUBO state model.
const debugVisible = ref<boolean>(false);

function setView(v: 'applied' | 'A' | 'B'): void {
  q.toolbarView.value = v;
}

async function onVerdict(preferred: 0 | 1): Promise<void> {
  try {
    await q.submitPreference(preferred);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushSystemMessage('error', t('qeubo.systemMessage.verdictFailed', { msg }));
  }
}

function onApply(): void {
  try {
    q.applyEffective();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushSystemMessage('error', t('qeubo.systemMessage.applyFailed', { msg }));
  }
}

function onPin(): void {
  const name = window.prompt(t('qeubo.prompt.bookmarkName'));
  if (name === null) return; // user cancelled
  try {
    q.pinCurrent(name);
    pushSystemMessage('info', t('qeubo.systemMessage.bookmarkSaved', { name: name.trim() }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushSystemMessage('error', t('qeubo.systemMessage.pinFailed', { msg }));
  }
}
</script>

<template>
  <div v-if="visible" class="qeubo-cluster">
    <!-- Audition toggle. v-model on q.toolbarView would also work
         but explicit click handlers give us per-button styling and
         keyboard semantics. -->
    <div class="seg-toggle" role="radiogroup" :aria-label="$t('qeubo.aria.auditionView')">
      <button
        type="button"
        class="seg-btn"
        :class="{ active: q.toolbarView.value === 'applied' }"
        :disabled="q.isBusy.value"
        role="radio"
        :aria-checked="q.toolbarView.value === 'applied'"
        :title="$t('qeubo.tooltip.applied')"
        @click="setView('applied')"
      >{{ $t('qeubo.label.applied') }}</button>
      <button
        type="button"
        class="seg-btn"
        :class="{ active: q.toolbarView.value === 'A' }"
        :disabled="q.isBusy.value || !hasPair"
        role="radio"
        :aria-checked="q.toolbarView.value === 'A'"
        :title="$t('qeubo.tooltip.candidateA')"
        @click="setView('A')"
      >A</button>
      <button
        type="button"
        class="seg-btn"
        :class="{ active: q.toolbarView.value === 'B' }"
        :disabled="q.isBusy.value || !hasPair"
        role="radio"
        :aria-checked="q.toolbarView.value === 'B'"
        :title="$t('qeubo.tooltip.candidateB')"
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
        :title="$t('qeubo.tooltip.preferA')"
        @click="onVerdict(0)"
      >{{ $t('qeubo.label.preferA') }}</button>
      <button
        type="button"
        class="verdict-btn"
        :disabled="verdictDisabled"
        :title="$t('qeubo.tooltip.preferB')"
        @click="onVerdict(1)"
      >{{ $t('qeubo.label.preferB') }}</button>
    </div>

    <!-- Apply: promote the current audition to persistent. Hidden
         when toolbarView==='applied' (nothing to apply). -->
    <button
      v-if="applyVisible"
      type="button"
      class="apply-btn"
      :disabled="q.isBusy.value"
      :title="$t('qeubo.tooltip.useThis')"
      @click="onApply"
    >{{ $t('qeubo.label.useThis') }}</button>

    <!-- Pin: snapshot effective values to qeuboPinnedBookmarks. -->
    <button
      type="button"
      class="pin-btn"
      :disabled="q.isBusy.value"
      :title="$t('qeubo.tooltip.pin')"
      @click="onPin"
    >{{ $t('qeubo.label.pin') }}</button>

    <!-- Debug toggle (⊗) and conditional readout. The icon flips
         debugVisible; the strip shows view + applied + effective
         parameters when active. Hidden by default to keep the
         cluster uncluttered. -->
    <button
      type="button"
      class="debug-toggle"
      :class="{ active: debugVisible }"
      :title="debugVisible ? $t('qeubo.tooltip.debugHide') : $t('qeubo.tooltip.debugShow')"
      @click="debugVisible = !debugVisible"
    >⊗</button>
    <span v-if="debugVisible" class="params-debug">{{ paramsDebug }}</span>

    <!-- Phase indicator with `?` tooltip. -->
    <span v-if="phaseLabel" class="phase-indicator" :title="phaseTooltip">
      {{ phaseLabel }} <span class="phase-help">?</span>
    </span>

    <!-- Spinner placeholder; toolbar already shows engine spinners
         elsewhere so this is intentionally minimal. -->
    <span v-if="q.isBusy.value" class="busy-dot" :aria-label="$t('qeubo.aria.busy')">●</span>
  </div>
</template>

<style scoped>
.qeubo-cluster { display: flex; align-items: center; gap: var(--space-default); padding: 0 var(--space-default); border-left: 1px solid var(--border-2); border-right: 1px solid var(--border-2); font-family: 'Courier New', monospace; font-size: var(--text-emphasis); text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.seg-toggle { display: flex; border: 1px solid var(--border-3); border-radius: var(--radius-default); overflow: hidden; }
.seg-btn { background: var(--surface-0); border: none; border-right: 1px solid var(--border-3); color: var(--text-1); padding: 5px 10px; font-size: var(--text-emphasis); cursor: pointer; font-family: inherit; text-transform: inherit; letter-spacing: inherit; }
.seg-btn:last-child { border-right: none; }
/* theme-exception: .apply-btn and .phase-help borders use #2a5a7a
   — designer-intentional muted-cyan accent. The substrate has only
   --accent-primary; muted variants would need new anchors. */
.seg-btn.active { background: var(--surface-0); color: var(--accent-primary); }
.seg-btn:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }
.verdict-pair { display: flex; gap: var(--space-tight); }
.verdict-btn, .apply-btn, .pin-btn { background: var(--surface-0); border: 1px solid var(--border-3); color: var(--text-1); padding: 5px 10px; font-size: var(--text-emphasis); cursor: pointer; border-radius: var(--radius-default); font-family: inherit; text-transform: inherit; letter-spacing: inherit; }
.verdict-btn:disabled, .apply-btn:disabled, .pin-btn:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }
.apply-btn { border-color: #2a5a7a; color: var(--accent-primary); }
.debug-toggle { background: none; border: none; color: var(--text-2); font-size: var(--text-emphasis); cursor: pointer; padding: 0 var(--space-tight); font-family: inherit; line-height: 1; }
.debug-toggle.active { color: var(--accent-primary); }
.params-debug { color: var(--text-2); font-size: var(--text-tiny); padding: 0 var(--space-tight); text-transform: none; letter-spacing: var(--tracking-default); white-space: nowrap; }
.phase-indicator { color: var(--text-2); font-size: var(--text-body); letter-spacing: var(--tracking-default); cursor: help; padding: 0 var(--space-tight); }
.phase-help { color: var(--accent-primary); border: 1px solid #2a5a7a; border-radius: var(--radius-circle); width: 12px; height: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: var(--text-tiny); margin-left: var(--space-tight); }
.busy-dot { color: var(--accent-primary); font-size: var(--text-body); animation: pulse var(--duration-slow) infinite; }
/* magic-literal: pulse keyframe trough at 0.4 (vs --alpha-disabled at
   0.5 for the disabled-button role) — animation envelope alpha,
   hand-tuned for visible-pulse contrast against the 1.0 peak. Distinct
   role from disabled-state alpha; intentional. */
@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1.0; } }
</style>
