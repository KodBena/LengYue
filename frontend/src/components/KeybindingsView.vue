<script setup lang="ts">
/**
 * src/components/KeybindingsView.vue
 *
 * Read-only reference view of the keybindings registry, grouped
 * by domain (`nav` / `display` / `engine`). Phase 3 of
 * docs/notes/keybindings-plan.md — discoverability lands here
 * even without the edit affordance. Phase 4 adds Edit / Reset /
 * Unbind per-row controls and a Reset-all button.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { store } from '../store';
import {
  KEYBINDINGS_REGISTRY,
  effectiveKey,
  type KeybindingActionDecl,
} from '../lib/keybindings';

const { t } = useI18n();

const KNOWN_DOMAINS = ['nav', 'display', 'engine'] as const;
type Domain = (typeof KNOWN_DOMAINS)[number];

const grouped = computed<ReadonlyArray<readonly [Domain, ReadonlyArray<KeybindingActionDecl>]>>(() => {
  const groups: Record<Domain, KeybindingActionDecl[]> = { nav: [], display: [], engine: [] };
  for (const action of KEYBINDINGS_REGISTRY) {
    const prefix = action.id.split('.')[0];
    if (prefix !== 'nav' && prefix !== 'display' && prefix !== 'engine') {
      // ADR-0002: KeybindingsView's grouped render assumes the closed
      // {nav, display, engine} domain set. A new prefix means the
      // KNOWN_DOMAINS list and the i18n `keybindings.section.<domain>`
      // catalog entries need extending in the same change.
      throw new Error(`KeybindingsView: unknown action domain prefix "${prefix}" for action "${action.id}"`);
    }
    groups[prefix].push(action);
  }
  return KNOWN_DOMAINS.map((d) => [d, groups[d]] as const);
});

function displayKey(action: KeybindingActionDecl): string {
  const key = effectiveKey(action, store.profile.settings.keybindings);
  if (key === null) return t('keybindings.unbound');
  if (key === ' ') return 'Space';
  return key;
}
</script>

<template>
  <div class="keybindings-view tab-padding">
    <section
      v-for="[domain, actions] in grouped"
      :key="domain"
      class="keybindings-section"
    >
      <h3 class="sub-header">{{ t(`keybindings.section.${domain}`) }}</h3>
      <table class="keybindings-table">
        <tbody>
          <tr v-for="action in actions" :key="action.id">
            <td class="action-label" :title="t(action.descriptionKey)">
              {{ t(action.labelKey) }}
            </td>
            <td class="action-key">{{ displayKey(action) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.keybindings-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-loose);
}

.keybindings-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-small);
}

.keybindings-table {
  width: 100%;
  border-collapse: collapse;
}

.keybindings-table td {
  padding: var(--space-tiny) var(--space-small);
  border-bottom: 1px solid var(--surface-1);
}

.action-label {
  text-align: left;
  color: var(--text-0);
}

.action-key {
  text-align: right;
  color: var(--text-1);
  font-family: monospace;
  white-space: nowrap;
  min-width: 6ch;
}
</style>
