<!--
  src/components/MatchPlayerOverridesConfig.vue
  Per-MATCH-PLAYER session-ephemeral JSON override textarea (ledger
  rows 593/594) — the engine-match sibling of
  `PerQueryOverridesConfig.vue` (the GLOBAL, applies-to-every-query
  surface). Two instances are mounted in `EngineMatchModal.vue`, one
  per `player` prop value ('B' | 'W'), so Black and White can carry
  different engine overrideSettings on the same match (the motivating
  use: an asymmetric `playoutDoublingAdvantage` throttle between a
  strong and a weak engine). See `state/match-player-overrides.ts` for
  the merge semantics, keying rationale, and precedence against the
  global surface.

  Idiom: deliberately the SAME textarea/error/reset idiom as
  `PerQueryOverridesConfig.vue` (itself following
  `RegistryEditor.vue`'s `expression-input` idiom, ADR-0019) — this
  component only adds the `player` prop that selects which of the two
  keyed state slots it reads/writes.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  matchPlayerOverridesText,
  matchPlayerOverridesError,
  setMatchPlayerOverridesText,
  resetMatchPlayerOverrides,
  type MatchPlayer,
} from '../state/match-player-overrides';

const props = defineProps<{ player: MatchPlayer }>();

const { t } = useI18n();

const text = computed(() => matchPlayerOverridesText(props.player));
const error = computed(() => matchPlayerOverridesError(props.player));
const labelKey = computed(() => (props.player === 'B' ? 'matchPlayerOverrides.labelBlack' : 'matchPlayerOverrides.labelWhite'));

function handleInput(e: Event): void {
  // DOM cast: the template's only listener on this handler is the
  // textarea's native `input` event, so `e.target` is always this
  // element — standard `Event` → concrete-element narrowing, not a
  // domain-shape coercion.
  setMatchPlayerOverridesText(props.player, (e.target as HTMLTextAreaElement).value);
}

function reset(): void {
  resetMatchPlayerOverrides(props.player);
}
</script>

<template>
  <div class="match-player-overrides-config">
    <label class="player-label">{{ t(labelKey) }}</label>

    <textarea
      class="dark-input expression-input"
      spellcheck="false"
      :placeholder="t('matchPlayerOverrides.placeholder')"
      :value="text"
      @input="handleInput"
    ></textarea>

    <p v-if="error" class="error-line" role="alert">
      {{ t('matchPlayerOverrides.error', { message: error }) }}
    </p>

    <div class="actions">
      <button
        type="button"
        class="action-btn reset-btn"
        :disabled="text.length === 0"
        :title="t('matchPlayerOverrides.resetTooltip')"
        @click="reset"
      >{{ t('matchPlayerOverrides.resetButton') }}</button>
    </div>
  </div>
</template>

<style scoped>
.match-player-overrides-config { font-family: 'Consolas', monospace; }
.player-label { display: block; font-size: var(--text-emphasis); color: var(--text-2); text-transform: uppercase; margin-bottom: var(--space-tight); }
.expression-input { width: 100%; min-height: 3.5em; box-sizing: border-box; resize: vertical; font-family: 'Consolas', monospace; font-size: var(--text-body); }
.error-line { color: var(--state-error); font-size: var(--text-body); margin: var(--space-tight) 0 0 0; }
.actions { margin-top: var(--space-tight); }
.action-btn.reset-btn { background: var(--border-2); border: 1px solid var(--border-3); color: var(--text-1); padding: var(--space-tight) var(--space-default); font-size: var(--text-body); cursor: pointer; border-radius: var(--radius-default); font-family: inherit; text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.action-btn.reset-btn:disabled { opacity: 0.5; cursor: default; }
</style>
