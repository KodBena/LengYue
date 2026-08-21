<!--
  src/components/qeubo/PboPopover.vue

  Toolbar surface for the PBO (preference-based Bayesian
  optimisation) calibration cluster. Renders as a single "PBO"
  badge carrying the current phase indicator (`init done/total`,
  `iter n`, or `—`) plus a busy dot when a request is in flight.
  Hover opens a floating panel with the audition toggle
  (Applied / A / B), verdict pair, apply, pin, and a debug
  toggle that surfaces the applied / effective parameter
  readouts inline. Replaces the legacy inline cluster
  (`QeuboToolbar.vue`, retired in the same arc) per the user's
  ask for a hover-popover shape consistent with the QUEUE and
  SLIDERS popovers.

  ── Name ─────────────────────────────────────────────────────
  PBO is the user-facing methodology (preference-based Bayesian
  optimisation); qEUBO is one acquisition function used inside
  the PBO loop — an implementation detail. The user-facing
  surface is PBO; code identifiers (`useQeubo`,
  `qeubo-service.ts`, the `/qeubo/*` backend routes) retain
  `qeubo` because they accurately name the library / backend
  module the user-facing PBO methodology runs over. Wire-level
  rename is deferred (cross-team arc requiring backend route
  changes, env var changes, and coordinated deploy).

  ── ADR-0003 band ────────────────────────────────────────────
  Band 1 (truly domain-agnostic) at the chrome surface — the
  strings the panel renders are "applied / candidate A /
  candidate B / verdict / apply / pin", all methodology
  vocabulary, no Go-bound terms. The underlying PBO machinery
  is palette-bound (calibrates analysis-palette parameters)
  but the popover doesn't speak SGF or KataGo vocabulary.

  ── Band/chrome-neighbourhood discipline ─────────────────────
  Self-gating on `calibrationEnabled && experimentExists` —
  legitimate feature gating, not an inherited lifecycle from a
  sibling chrome neighbourhood (the failure shape the
  toolbar-popover postmortem corrected for PR #225's
  `ToolbarSliderPopover` placement). The mount in `Toolbar.vue`
  sits as a sibling of `engine-metrics-bar`, *not* nested
  inside it — the popover renders regardless of engine
  connectivity (an inert badge appears when calibration is off
  or no experiment exists; the user sees nothing because the
  v-if short-circuits, but the gate is on PBO state, not on
  the engine's). See
  `docs/notes/postmortem-knob-toolbar-popover-2026-05.md` for
  the discipline this placement respects.

  ── Hover behaviour ──────────────────────────────────────────
  Consumes `useHoverPopover` — the composable extracted in this
  same arc per the "third instance → extract a composable"
  trigger flagged in
  `docs/worklog/2026-05-14-popover-hover-finickiness.md`. The
  popover is flush-anchored under the badge with the
  composable's 150 ms close-grace timer; the same composable
  backs `EngineQueueTooltip` and `ToolbarSliderPopover` so all
  three popovers in the toolbar share identical hover
  semantics.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQeubo } from '../../composables/useQeubo';
import { useHoverPopover } from '../../composables/chrome/useHoverPopover';
import { useFixedAnchoredPopover } from '../../composables/chrome/useFixedAnchoredPopover';
import { pushSystemMessage } from '../../store';
import { useAppDialogs } from '../../composables/useAppDialogs';

const { t } = useI18n();
const dialogs = useAppDialogs();
const q = useQeubo();
const { open, onMouseEnter, onMouseLeave } = useHoverPopover();

// Clip-ancestor fix (commission lyt-popover-clip-class, ratified
// program row 1937). This popover mounts inside `App.vue`'s
// `.lyt-toolbar-strip` (via ToolbarAppCluster -> the `#leaf-A_app`
// slot), the SAME `overflow-y: auto` clipping ancestor
// `ToolbarSliderPopover.vue`'s D1 fix escaped — the two are direct
// DOM siblings under `ToolbarAppCluster.vue`'s second `.toolbar-cluster`
// (`.claude/dispatch-reports/lyt-sliders-popover-defects.md`). Not
// visually re-witnessed for THIS component in this commission — see
// `.claude/dispatch-reports/lyt-popover-clip-class.md`'s per-member
// disposition for why (this component's own root carries `v-if
// ="visible"`, gated on `q.calibrationEnabled && q.experimentExists`,
// which requires a live backend qEUBO experiment — unreachable under
// this commission's own isolation posture, dead-pinned ports, no
// live backend) — but the ancestor chain and positioning scheme were
// identical to ToolbarSliderPopover's pre-fix shape (`position:
// absolute; top: 100%; right: 0`, same `.lyt-toolbar-strip` ancestor,
// same z-index tier), so it is routed through the same composable as a
// same-class structural fix rather than left unfixed pending a live
// witness this environment cannot produce. `usePopoverEdgeClamp`
// (horizontal-only, snapshot-once) no longer applies;
// `useFixedAnchoredPopover` supersedes it here.
const triggerEl = ref<HTMLElement | null>(null);
const popoverEl = ref<HTMLElement | null>(null);
const { style: popoverStyle } = useFixedAnchoredPopover(open, triggerEl, popoverEl, { align: 'right' });

// Render gate: hide entirely when calibration is disabled (503 from
// the backend) or the user has no experiment configured. Same
// predicate as the legacy QeuboToolbar's `visible` computed.
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

const phaseTooltip = computed<string>(() => t('qeubo.phaseTooltip'));

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

// Local toggle for the inline parameter readout. Component-local
// since debug visibility is a per-session preference, not part of
// the PBO state model.
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

async function onPin(): Promise<void> {
  const name = await dialogs.prompt({ message: t('qeubo.prompt.bookmarkName') });
  if (name === null) return;
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
  <div
    v-if="visible"
    ref="triggerEl"
    class="metric pbo-metric"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <span class="m-lbl">{{ $t('toolbar.metric.pbo') }}</span>
    <span class="m-val pbo-phase" :class="{ 'pbo-phase-idle': !phaseLabel }">
      {{ phaseLabel || '—' }}
    </span>
    <span v-if="q.isBusy.value" class="busy-dot" :aria-label="$t('qeubo.aria.busy')">●</span>

    <div v-if="open" ref="popoverEl" class="pbo-popover" role="tooltip" :style="{ top: popoverStyle.top, left: popoverStyle.left }">
      <!-- Audition toggle. v-model on q.toolbarView would also
           work but explicit click handlers give us per-button
           styling and keyboard semantics. -->
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

      <!-- Verdict pair. Hidden when there is no pair to vote on
           (briefly between submit and next-fetch, or
           pre-bootstrap). -->
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

      <!-- Action row: apply (when applicable) + pin + debug
           toggle + about-PBO `?` chip carrying the phase tooltip.
           Single row keeps the popover compact. -->
      <div class="action-row">
        <button
          v-if="applyVisible"
          type="button"
          class="apply-btn"
          :disabled="q.isBusy.value"
          :title="$t('qeubo.tooltip.useThis')"
          @click="onApply"
        >{{ $t('qeubo.label.useThis') }}</button>
        <button
          type="button"
          class="pin-btn"
          :disabled="q.isBusy.value"
          :title="$t('qeubo.tooltip.pin')"
          @click="onPin"
        >{{ $t('qeubo.label.pin') }}</button>
        <button
          type="button"
          class="debug-toggle"
          :class="{ active: debugVisible }"
          :title="debugVisible ? $t('qeubo.tooltip.debugHide') : $t('qeubo.tooltip.debugShow')"
          @click="debugVisible = !debugVisible"
        >⊗</button>
        <span class="phase-help" :title="phaseTooltip">?</span>
      </div>

      <span v-if="debugVisible" class="params-debug">{{ paramsDebug }}</span>
    </div>
  </div>
</template>

<style scoped>
/* Badge layout mirrors the QUEUE / SLIDERS popovers. */
.pbo-metric {
  position: relative;
  cursor: default;
  display: flex;
  align-items: center;
  gap: var(--space-tight);
}
.pbo-metric .m-val {
  color: var(--text-0);
}
.pbo-metric:hover .m-val {
  /* wC-contrast (F9): readable text is --text-0, not accent-primary — 2.08:1 in the default cluster theme. */
  color: var(--text-0);
}
.pbo-phase {
  font-family: monospace;
}
.pbo-phase-idle { color: var(--text-0); }
/* Reuses the QeuboToolbar busy-dot pulse exactly — same
   keyframe envelope (0.4 trough → 1.0 peak), same duration
   anchor, same accent colour. magic-literal: 0.4 trough is the
   animation envelope alpha, distinct from --alpha-disabled
   (0.5) which is the disabled-state alpha; intentional. */
.busy-dot { color: var(--accent-primary); font-size: var(--text-body); animation: pulse var(--duration-slow) infinite; }
@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1.0; } }

/* Floating panel — same shape as the QUEUE / SLIDERS popovers: flush
   against the badge (no margin-top gap), capped width, bordered (no
   box-shadow — ledger row 1506 ban). The flush anchor pairs with the
   hover composable's 150 ms close-grace timer for gap-free pointer
   traversal in the common case.

   Clip-ancestor fix (commission lyt-popover-clip-class): this rule was
   previously anchored `top: 100%; right: 0` under CSS's absolute
   positioning scheme, relative to `.pbo-metric`'s own `position:
   relative` box. `position: fixed` (below) escapes
   `.lyt-toolbar-strip`'s `overflow-y: auto` clip the same way
   `ToolbarSliderPopover.vue`'s D1 fix does (see that file's header,
   and `useFixedAnchoredPopover.ts`'s own header, for the full
   diagnosis); `top`/`left` are now script-computed by
   `useFixedAnchoredPopover` (align: 'right', matching the prior
   `right: 0` anchor) and bound via `popoverStyle`. */
.pbo-popover {
  position: fixed;
  background: var(--surface-0);
  border: 1px solid var(--border-3);
  border-radius: var(--radius-default);
  padding: var(--space-default);
  min-width: 340px;
  max-width: 480px;
  z-index: var(--z-popover-chrome); /* W4 item 3: shared toolbar/corner-chrome popover tier — see theme.css's own doc comment on the token */
  display: flex;
  flex-direction: column;
  gap: var(--space-default);
  font-family: 'Courier New', monospace;
  font-size: var(--text-emphasis);
  text-transform: uppercase;
  letter-spacing: var(--tracking-tight);
}
.seg-toggle { display: flex; border: 1px solid var(--border-3); border-radius: var(--radius-default); overflow: hidden; }
.seg-btn { background: var(--surface-0); border: none; border-right: 1px solid var(--border-3); color: var(--text-0); padding: 5px 10px; font-size: var(--text-emphasis); cursor: pointer; font-family: inherit; text-transform: inherit; letter-spacing: inherit; }
.seg-btn:last-child { border-right: none; }
/* wC-contrast (F9): readable text is --text-0, not accent-primary — 2.08:1 in the default cluster theme. */
.seg-btn.active { background: var(--surface-0); color: var(--text-0); }
.seg-btn:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }
.verdict-pair { display: flex; gap: var(--space-tight); }
.action-row { display: flex; gap: var(--space-tight); align-items: center; }
.verdict-btn, .apply-btn, .pin-btn { background: var(--surface-0); border: 1px solid var(--border-3); color: var(--text-0); padding: 5px 10px; font-size: var(--text-emphasis); cursor: pointer; border-radius: var(--radius-default); font-family: inherit; text-transform: inherit; letter-spacing: inherit; }
.verdict-btn:disabled, .apply-btn:disabled, .pin-btn:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }
/* theme-exception: .apply-btn border uses #2a5a7a — designer-
   intentional muted-cyan accent matching the legacy QeuboToolbar
   and Toolbar's .highlight-btn vocabulary. */
/* wC-contrast (F9): label text is --text-0, not accent-primary — 2.08:1 in the default cluster theme. Border stays theme-exception ornament. */
.apply-btn { border-color: #2a5a7a; color: var(--text-0); }
.debug-toggle { background: none; border: none; color: var(--text-disabled); font-size: var(--text-emphasis); cursor: pointer; padding: 0 var(--space-tight); font-family: inherit; line-height: 1; }
/* wC-contrast (F9): readable text is --text-0, not accent-primary — 2.08:1 in the default cluster theme. */
.debug-toggle.active { color: var(--text-0); }
/* About-PBO `?` chip — circle outline carrying the long phase
   tooltip. Matches the QeuboToolbar's prior phase-help glyph
   vocabulary; theme-exception border (#2a5a7a) consistent with
   the muted-cyan accent used by the action buttons.
   wC-contrast (F9): the "?" glyph is readable text, so --text-0, not
   accent-primary — 2.08:1 in the default cluster theme. Border stays. */
.phase-help { color: var(--text-0); border: 1px solid #2a5a7a; border-radius: var(--radius-circle); width: 12px; height: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: var(--text-tiny); cursor: help; margin-left: auto; }
.params-debug { color: var(--text-0); font-size: var(--text-tiny); text-transform: none; letter-spacing: var(--tracking-default); white-space: nowrap; overflow-wrap: anywhere; }
</style>
