<!--
  src/components/KnobRegistryEditor.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * Cross-domain knob-registry editor — the originating riddle's
 * deliverable for knob-registry Phase 3b. Lists every scalar knob
 * (`inputs.length === 1`) in `store.profile.settings.knobs`,
 * categorised by `KnobDecl.domain`, rendered with `KnobSlider.vue`.
 *
 * The editor is a *view* into the registry — it doesn't own
 * decls, doesn't enforce policy, doesn't perform writes itself.
 * Each `KnobSlider` reads and writes through the substrate,
 * which polices claim state. Adding a new scalar knob (Phase 6's
 * promotion sweep) requires no change here — the editor picks
 * up new entries on the next render.
 *
 * Vector knobs are deliberately filtered out — the plan §6's
 * widget dispatch reserves the slider primitive for scalars. A
 * future `KnobGamutPicker.vue` / `KnobTwoDPad.vue` /
 * `KnobMatrixEditor.vue` will render the vector knobs through
 * the same dispatch policy; until then, vector knobs (if any are
 * declared) simply don't appear in this editor.
 *
 * Band 1 per ADR-0003 — no Go vocabulary, no game-tree coupling.
 */

import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { store } from '../store';
import KnobSlider from './knobs/KnobSlider.vue';
import type { KnobDecl, KnobDomain, KnobId } from '../types';

const { t } = useI18n();

/**
 * Group the scalar-knob entries by domain so the editor renders
 * one labelled section per domain. The grouping iterates entries
 * in their natural Map order — KnobDecls authored to land near
 * each other in the registry stay near each other in the editor.
 */
interface DomainGroup {
  readonly domain: KnobDomain;
  readonly entries: ReadonlyArray<{ id: KnobId; decl: KnobDecl }>;
}

const grouped = computed<readonly DomainGroup[]>(() => {
  const buckets = new Map<KnobDomain, Array<{ id: KnobId; decl: KnobDecl }>>();
  for (const [key, decl] of Object.entries(store.profile.settings.knobs)) {
    // Scalar-only — see file header. A vector knob declared in the
    // registry simply doesn't appear here.
    if (decl.inputs.length !== 1) continue;
    const bucket = buckets.get(decl.domain) ?? [];
    bucket.push({ id: key as KnobId, decl });
    buckets.set(decl.domain, bucket);
  }
  return Array.from(buckets.entries()).map(([domain, entries]) => ({
    domain,
    entries,
  }));
});

function domainLabel(domain: KnobDomain): string {
  // i18n keys colocated with the editor; falls back to the raw
  // domain string so a freshly-added domain renders sensibly
  // until its catalog entry lands.
  const key = `knobRegistry.domain.${domain}`;
  const translated = t(key);
  return translated === key ? domain : translated;
}

const isEmpty = computed(() => grouped.value.length === 0);
</script>

<template>
  <div class="knob-registry-editor">
    <p v-if="isEmpty" class="knob-registry-empty">
      {{ $t('knobRegistry.empty') }}
    </p>
    <div
      v-for="group in grouped"
      :key="group.domain"
      class="knob-registry-domain"
    >
      <h4 class="knob-registry-domain-label">
        {{ domainLabel(group.domain) }}
      </h4>
      <KnobSlider
        v-for="entry in group.entries"
        :key="entry.id"
        :knob-id="entry.id"
      />
    </div>
  </div>
</template>

<style scoped>
.knob-registry-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-default);
}
.knob-registry-empty {
  color: var(--text-2);
  font-style: italic;
  margin: 0;
}
.knob-registry-domain {
  display: flex;
  flex-direction: column;
}
.knob-registry-domain-label {
  margin: 0 0 var(--space-tight) 0;
  font-size: var(--text-emphasis);
  font-weight: 600;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: var(--tracking-tight);
}
</style>
