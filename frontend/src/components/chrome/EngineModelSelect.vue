<!--
  src/components/chrome/EngineModelSelect.vue

  Isolation leaf for the toolbar's MODEL identity slot (label + hover
  tooltip + SELECTOR-mode `<select>` / static-name fallback). Extracted
  out of `ToolbarEngineMetrics.vue` because that component re-renders at
  ~1Hz (`ENGINE_METRICS_TICK_MS`, `src/lib/timing.ts`) even after the
  `useThrottledSnapshot(250ms)` fix — a 250ms throttle only coalesces a
  signal ARRIVING faster than 250ms; a 1000ms-period source is already
  slower than the window, so every tick reassigns `displayed.value` to a
  fresh object and re-runs ToolbarEngineMetrics's WHOLE render function
  (ADR-0010's render-locality corollary: a reactive read anywhere in a
  template reruns the entire render, not just the DOM patch). Vue's
  `<select>` option-patch then unconditionally re-touches every
  `<option>`'s `value` attribute on that same render, which is enough to
  make the browser's native open-dropdown popup redraw and drop the
  user's hover highlight — killing the "pick model" affordance the
  moment metrics are ticking (Defect 1,
  docs/dispatch-reports/ui-defects-investigation.md;
  docs/dispatch-reports/ui-fix-1b-diagnosis.md, live-witnessed:
  mutation bursts on <option> value attributes at ~1000ms period,
  matching ENGINE_METRICS_TICK_MS exactly).

  The class-level fix (not just narrowing/widening the throttle window,
  which cannot help against a source slower than any window): give the
  model-select its own component instance that reads ONLY the
  model-selection state — `store.engine.info.availableModels`,
  `store.engine.selectedModel`, `store.engine.info.capabilities`
  (`isSelectorMode`), `store.engine.info.internalName` (LEAF-mode
  fallback), `store.engine.info.modelsPayload` (tooltip). NONE of these
  fields are metrics-derived and NONE change on the tick — Vue's
  reactivity is per-component-instance, so this leaf's own render effect
  has no dependency on `ENGINE_METRICS_TICK_MS` at all, regardless of
  how ToolbarEngineMetrics (the parent that mounts it) re-renders. A
  child component only re-renders when ITS OWN reactive deps or props
  change; mounted with no props here (this leaf self-sources everything
  it needs directly off the store, per ADR-0010 read-locality — its job
  IS to display model-selection state, so it may read wherever that
  state lives), there is no path from the tick to this component's
  render at all. Structurally unrepresentable, not tuned-away.

  Domain band (ADR-0003): truly agnostic. KataGo model-identity
  vocabulary (SELECTOR / LEAF role, `availableModels`, `internalName`);
  no Go-specific affordances.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { store, setSelectedModel } from '../../store';

const { t } = useI18n();

const engineInternalName = computed(() => store.engine.info.internalName);
const isSelectorMode = computed(() => {
  const caps = store.engine.info.capabilities;
  return caps !== null && 'selector' in caps;
});
const availableModels = computed(() => store.engine.info.availableModels);
const selectedModel = computed(() => store.engine.selectedModel);

const modelTooltip = computed(() => {
  const payload = store.engine.info.modelsPayload;
  return payload
    ? `query_models response:\n${JSON.stringify(payload, null, 2)}`
    : t('toolbar.engineModelTooltipPending');
});

function onSelectModel(event: Event) {
  const target = event.target as HTMLSelectElement; // DOM: handler bound on the model <select>, so target is that element
  setSelectedModel(target.value || null);
  // Return focus to the document body so the global space-bar
  // ponder toggle (wired in `useUserIORegistry`) fires correctly
  // on the next keystroke. Without the blur, focus stays on the
  // <select>, and `useUserIORegistry`'s `HTMLSelectElement` guard
  // bails on the keydown — the user's "pick model, press space"
  // workflow then needs an intervening click outside the toolbar.
  target.blur();
}
</script>

<template>
  <div class="metric engine-identity" :title="modelTooltip">
    <span class="m-lbl">{{ $t('toolbar.metric.model') }}</span>
    <select
      v-if="isSelectorMode"
      class="m-val engine-id-val engine-model-select"
      :value="selectedModel ?? ''"
      @change="onSelectModel"
    >
      <option
        v-for="entry in availableModels"
        :key="entry.label"
        :value="entry.label"
        :disabled="!entry.healthy"
        :title="entry.healthy ? entry.label : t('toolbar.modelUnavailable', { label: entry.label })"
      >{{ entry.label }}{{ entry.healthy ? '' : ' (unavailable)' }}</option>
    </select>
    <span v-else class="m-val engine-id-val">{{ engineInternalName ?? '—' }}</span>
  </div>
</template>

<style scoped>
/* Styles duplicated (not shared) from ToolbarEngineMetrics.vue's
   scoped block — `<style scoped>` doesn't cascade across component
   boundaries, and this leaf needs to render identically to the
   pre-extraction inline markup. */
.metric { display: flex; align-items: center; gap: var(--space-tight); min-width: 0; }
.m-lbl  { color: var(--border-3); font-size: var(--text-tiny); text-transform: uppercase; letter-spacing: var(--tracking-default); }
.m-val  { color: var(--accent-primary); font-weight: bold; }
/* Engine-identity slot: the model's `internalName` can be 30–40 chars
   (`kata1-b18c384nbt-s9131461376-d4087399203` and similar). Shown in
   full — the toolbar has room and the user explicitly wanted the full
   identifier visible without hover. `cursor: help` cues the hover
   tooltip (full probe response, including the privacy-concerning
   `name` field). */
.engine-identity { flex-shrink: 0; }
.engine-id-val { white-space: nowrap; cursor: help; }
/* SELECTOR-mode model dropdown. The .m-val class on the same element
   supplies the accent colour + bold weight; this rule overrides only
   the chrome — transparent background + thin border so it reads as a
   native part of the metrics row rather than a heavy form control.
   font-family is set explicitly because <select> elements default to
   system-UI typography and wouldn't inherit the surrounding
   monospace; pointer cursor overrides .engine-id-val's `help`. */
.engine-model-select { background: transparent; border: 1px solid var(--border-3); padding: 0 var(--space-tight); border-radius: var(--radius-default); cursor: pointer; font-family: monospace; font-size: var(--text-emphasis); }
</style>
