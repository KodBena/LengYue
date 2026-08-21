<!--
  src/components/editors/CacheReplaySettings.vue

  Labeled control pair for the proxy replay-cache flags
  (AppSettings.engine.katago.cache / .lookup_cache) — the maintainer's
  original cache-wiki ask #1: these two booleans were previously
  reachable only through the raw registry tree (Settings → Advanced
  Registry's generic RegistryEditor over `store.profile.settings`),
  with no dedicated labeled control anywhere in the engine/analysis
  settings neighborhood.

  Single source of truth: both checkboxes read/write
  `store.profile.settings.engine.katago.{cache,lookup_cache}`
  directly, through the same owner-routed WritableComputed pattern
  AnalysisControls.vue uses for its profile-targeting v-models
  (getter reads the store per ADR-0010 read-locality; setter routes
  through `mutateProfile`). This is the SAME leaf pair
  `analysis-service.ts` reads at every `analyzeRange` /
  `analyzeActiveNode` call site (see the field-level doc comment on
  `AppSettings.engine.katago.cache` in `store/schema.ts`) — no second
  copy of the flags is introduced here.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { store } from '../../store';
import { mutateProfile } from '../../store/profile-owner';

const { t } = useI18n();

// Owner-routed WritableComputeds (AnalysisControls.vue's
// `adaptiveEnabled` precedent): the getter is a plain store read
// (this editor's whole job is to display + mutate these two
// leaves), the setter's assignment is identical to a direct write
// but goes through `mutateProfile` so SyncService's deep-watch
// keeps observing it.
const cacheWrite = computed({
  get: () => store.profile.settings.engine.katago.cache,
  set: (v: boolean) => mutateProfile((p) => { p.settings.engine.katago.cache = v; }),
});
const cacheLookup = computed({
  get: () => store.profile.settings.engine.katago.lookup_cache,
  set: (v: boolean) => mutateProfile((p) => { p.settings.engine.katago.lookup_cache = v; }),
});
</script>

<template>
  <div class="analysis-config-box cache-box">
    <p class="cache-title">{{ t('settings.cache.title') }}</p>
    <div class="settings-row">
      <label class="checkbox-row">
        <input type="checkbox" class="cache-write-checkbox" v-model="cacheWrite" />
        <span>{{ t('settings.cache.writeLabel') }}</span>
        <span class="info-icon" :title="t('settings.cache.writeTooltip')">?</span>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" class="cache-lookup-checkbox" v-model="cacheLookup" />
        <span>{{ t('settings.cache.lookupLabel') }}</span>
        <span class="info-icon" :title="t('settings.cache.lookupTooltip')">?</span>
      </label>
      <p class="hint">{{ t('settings.cache.hint') }}</p>
    </div>
  </div>
</template>

<style scoped>
.analysis-config-box { margin-top: 0; margin-bottom: var(--space-medium); background: var(--surface-2); padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); border: 1px solid var(--surface-3); }
.cache-title { margin: 0 0 var(--space-default) 0; font-size: var(--text-body); font-weight: bold; color: var(--text-0); text-transform: uppercase; letter-spacing: var(--tracking-default); }
.settings-row { display: flex; flex-direction: column; gap: var(--space-tight); }
.checkbox-row { display: flex; align-items: center; gap: var(--space-default); font-size: var(--text-body); color: var(--text-0); cursor: pointer; }
.checkbox-row input[type="checkbox"] { accent-color: var(--accent-primary); cursor: pointer; }
.info-icon { display: inline-block; width: 13px; height: 13px; border-radius: 50%; border: 1px solid var(--text-0); text-align: center; font-size: 9px; line-height: 11px; color: var(--text-0); cursor: help; }
.hint { font-size: var(--text-body); color: var(--text-0); margin: var(--space-tight) 0 0 0; }
</style>
