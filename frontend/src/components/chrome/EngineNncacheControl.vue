<!--
  src/components/chrome/EngineNncacheControl.vue

  Toolbar control for KataGo's persisted NN-cache-context feature —
  a checkbox (enable/disable) plus a text field (the UN-prefixed
  context name, e.g. "card-5") sitting beside `EngineModelSelect.vue`
  in the engine-controls cluster. Pure renderer: every state
  transition (attach/detach/transition) is owned by
  `services/nncache-session.ts`, reached through
  `composables/chrome/useNncacheControl.ts` (the component layer is
  deny-by-default on `src/services/**` — frontend/CLAUDE.md
  "Architectural shape"). The checkbox is a CONTROLLED input —
  `:checked` reflects `enabled` (true only once an attach has
  actually succeeded), not a local optimistic toggle, so a refused
  attach visibly reverts the tick per the ratified fail-loud UI
  requirement.

  Style discipline (frontend/CLAUDE.md): backgrounds `--surface-0`,
  all readable text `--text-0`; no box-shadow, no CSS transition, no
  blur, no diffuse transparent overlays. Mirrors `EngineModelSelect.vue`'s
  `.metric` layout so the two controls sit visually level in the
  toolbar popover row.

  Domain band (ADR-0003): truly agnostic — KataGo cache-context
  vocabulary, no Go-specific affordances (same banding call as
  EngineModelSelect.vue's SELECTOR vocabulary).

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNncacheControl } from '../../composables/chrome/useNncacheControl';

const { t } = useI18n();
const nncache = useNncacheControl();

// Locally-editable text, seeded from the driver's committed value and
// re-synced whenever the driver commits a NEW value on its own (a
// card advance re-enabling under `card-<id>`, per useReviewSession's
// wiring) — but not on every keystroke round-trip, since the driver
// only writes `rawContext` on a successful attach, not per keystroke.
const localText = ref(nncache.rawContext.value);
watch(nncache.rawContext, (v) => { localText.value = v; });

const busy = () => nncache.status.value === 'attaching' || nncache.status.value === 'detaching';

function onToggle(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked; // DOM: handler bound on this checkbox, so target is that element
  if (checked) {
    nncache.enableWith(localText.value);
  } else {
    nncache.disableIt();
  }
}

function onTextInput(event: Event): void {
  localText.value = (event.target as HTMLInputElement).value; // DOM: handler bound on this text input, so target is that element
}

function onContextCommit(): void {
  if (nncache.enabled.value) {
    nncache.transitionTo(localText.value);
  } else {
    nncache.setRawContextText(localText.value);
  }
}
</script>

<template>
  <div class="metric nncache-control" :title="t('toolbar.nncache.checkboxTitle')">
    <span class="m-lbl">{{ t('toolbar.nncache.label') }}</span>
    <input
      type="checkbox"
      class="nncache-checkbox"
      :checked="nncache.enabled.value"
      :disabled="busy()"
      @change="onToggle"
    />
    <input
      type="text"
      class="m-val nncache-context-input"
      :value="localText"
      :disabled="busy()"
      :placeholder="t('toolbar.nncache.contextPlaceholder')"
      :title="t('toolbar.nncache.contextTitle')"
      @input="onTextInput"
      @change="onContextCommit"
    />
  </div>
</template>

<style scoped>
/* Duplicated (not shared) from EngineModelSelect.vue's own scoped
   block, same rationale — `<style scoped>` doesn't cascade across
   component boundaries. */
.metric { display: flex; align-items: center; gap: var(--space-tight); min-width: 0; }
.m-lbl  { color: var(--border-3); font-size: var(--text-tiny); text-transform: uppercase; letter-spacing: var(--tracking-default); }
.m-val  { color: var(--text-0); font-weight: bold; }
.nncache-control { flex-shrink: 0; }
.nncache-checkbox { cursor: pointer; accent-color: var(--text-0); }
.nncache-context-input {
  background: var(--surface-0);
  color: var(--text-0);
  border: 1px solid var(--border-3);
  border-radius: var(--radius-default);
  padding: 0 var(--space-tight);
  font-family: monospace;
  font-size: var(--text-emphasis);
  width: 8em;
}
.nncache-context-input::placeholder { color: var(--border-3); }
</style>
