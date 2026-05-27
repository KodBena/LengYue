<script setup lang="ts">
/**
 * src/components/KeybindingsView.vue
 *
 * The Keybindings sub-tab of the Settings surface. Walks
 * KEYBINDINGS_REGISTRY, groups actions by domain prefix
 * (`nav` / `display` / `engine`) in plan-sketch order, and
 * delegates each row's render + edit affordance to
 * KeybindingRow. Phase 4 of docs/notes/keybindings-plan.md
 * lands the row-level Edit / Reset / Unbind controls plus the
 * Reset-all button + reserved-keys disclosure at the foot;
 * Phase 3 (the read-only precursor) shipped 2026-05-27.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import KeybindingRow from './KeybindingRow.vue';
import ResetAllKeybindingsModal from './modals/ResetAllKeybindingsModal.vue';
import {
  KEYBINDINGS_REGISTRY,
  type KeybindingActionDecl,
} from '../lib/keybindings';
import {
  RESERVED_KEYS,
  resetAllBindings,
} from '../lib/keybindings-capture';

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

// Reserved-key disclosure body — comma-separated list of the
// keys the editor refuses to bind. Sorted alphabetically (the
// Set's iteration order is insertion order; alphabetical reads
// more naturally to the user than "the order the dev typed them").
const reservedKeysDisplay = computed<string>(() => {
  return [...RESERVED_KEYS].sort().join(', ');
});

const resetAllModalRef = ref<InstanceType<typeof ResetAllKeybindingsModal> | null>(null);

async function handleResetAll(): Promise<void> {
  const confirmed = await resetAllModalRef.value?.open();
  if (confirmed === true) {
    resetAllBindings();
  }
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
          <KeybindingRow
            v-for="action in actions"
            :key="action.id"
            :action="action"
          />
        </tbody>
      </table>
    </section>

    <div class="keybindings-footer">
      <button class="reset-all-btn" @click="handleResetAll">
        {{ t('keybindings.button.resetAll') }}
      </button>
      <details class="reserved-keys-disclosure">
        <summary>{{ t('keybindings.reservedKeys.label') }}</summary>
        <p class="reserved-keys-body">
          {{ t('keybindings.reservedKeys.body', { keys: reservedKeysDisplay }) }}
        </p>
      </details>
    </div>

    <ResetAllKeybindingsModal ref="resetAllModalRef" />
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

.keybindings-footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-medium);
  margin-top: var(--space-loose);
  padding-top: var(--space-medium);
  border-top: 1px solid var(--surface-1);
}

.reset-all-btn {
  align-self: flex-start;
  background: transparent;
  border: 1px solid var(--state-attention);
  color: var(--state-attention);
  padding: var(--space-default) var(--space-medium);
  border-radius: var(--radius-default);
  cursor: pointer;
  font-size: var(--text-emphasis);
}

.reset-all-btn:hover {
  background: var(--state-attention);
  color: var(--surface-1);
}

.reserved-keys-disclosure > summary {
  cursor: pointer;
  color: var(--text-1);
  font-size: var(--text-small);
  user-select: none;
}

.reserved-keys-body {
  margin-top: var(--space-small);
  color: var(--text-2);
  font-size: var(--text-small);
  line-height: 1.5;
}
</style>
