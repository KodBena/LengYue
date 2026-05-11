<!--
  src/components/StatusBar.vue
  Purely presentational game status bar. Engine info (version,
  model, telemetry) lives in the Toolbar — this bar is for
  board-state vocabulary (move number, players, captures, turn).
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import type { StoneColor } from '../types';
import UserBadge from './UserBadge.vue';
import { useTransientHint } from '../composables/useTransientHint';

interface StatusMetadata {
  readonly blackName: string;
  readonly whiteName: string;
  readonly komi:      number;
  readonly rules:     string;
}

defineProps<{
  moveNumber: number;
  metadata:   StatusMetadata | null;
  turn:       StoneColor;
  captures:   { B: number; W: number };
}>();

const emit = defineEmits<{
  (e: 'update-komi', value: number): void;
}>();

const { hint } = useTransientHint();
</script>

<template>
  <div class="status-bar">
    <div class="status-left">
      <span class="move-badge">{{ $t('statusBar.move', { n: moveNumber }) }}</span>
      <span class="player-names">{{ metadata?.blackName }} {{ $t('statusBar.versus') }} {{ metadata?.whiteName }}</span>
      <span class="game-info">
        {{ metadata?.rules }} · {{ $t('statusBar.komi') }}
        <input
          type="number"
          class="komi-input"
          :value="metadata?.komi"
          step="0.5"
          @change="(e) => emit('update-komi', parseFloat((e.target as HTMLInputElement).value))"
          :title="$t('statusBar.editKomi')"
        />
      </span>
    </div>
    <div class="status-right">
      <span v-if="hint" class="transient-hint">{{ hint }}</span>
      <span class="turn-indicator" :class="turn">
        {{ turn === 'B' ? $t('statusBar.blackToPlay') : $t('statusBar.whiteToPlay') }}
      </span>
      <span class="caps">B: {{ captures.B }} · W: {{ captures.W }}</span>
      <UserBadge />
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  height: 20px;
  background: var(--surface-2);
  border-top: 1px solid var(--border-1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 var(--space-default);
  font-size: var(--text-emphasis);
  color: var(--text-1);
  flex-shrink: 0;
}

.status-left  { display: flex; gap: var(--space-medium); align-items: center; }
.status-right { display: flex; gap: var(--space-medium); align-items: center; }

.move-badge {
  background: var(--accent-primary);
  color: var(--surface-0);
  padding: 1px 6px;
  font-weight: bold;
  border-radius: var(--radius-default);
  font-family: monospace;
  font-size: var(--text-body);
}

.player-names { color: var(--text-0); font-weight: 600; }
.game-info    { color: var(--border-3); font-size: var(--text-body); display: flex; align-items: center; gap: var(--space-tight); }

.komi-input {
  width: 42px;
  background: transparent;
  border: none;
  border-bottom: 1px dashed var(--border-3);
  color: var(--text-1);
  font-size: var(--text-body);
  font-family: inherit;
  padding: 0;
  outline: none;
  text-align: center;
  transition: color var(--duration-default), border-color var(--duration-default);
}
.komi-input:focus, .komi-input:hover {
  color: var(--accent-primary);
  border-bottom: 1px solid var(--accent-primary);
}

/* Hide number arrows for a cleaner look */
.komi-input::-webkit-outer-spin-button,
.komi-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.komi-input {
  -moz-appearance: textfield;
}

.turn-indicator { font-weight: bold; }
.turn-indicator.B { color: var(--accent-primary); }
.turn-indicator.W { color: var(--accent-secondary); }

.caps { font-family: monospace; color: var(--text-2); font-size: var(--text-body); }

/* Transient hint surface — populated by `useTransientHint` from
   hover-driven affordances (e.g. the PV-paste discoverability
   text on move-suggestion hover). Distinct anchor from the
   permanent status vocabulary so it reads as ephemeral. */
.transient-hint {
  color: var(--text-2);
  font-style: italic;
  font-size: var(--text-body);
}
</style>
