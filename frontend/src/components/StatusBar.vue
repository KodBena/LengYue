<!--
  src/components/StatusBar.vue
  Purely presentational game status bar.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import type { StoneColor } from '../types';
import UserBadge from './UserBadge.vue';

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
</script>

<template>
  <div class="status-bar">
    <div class="status-left">
      <span class="move-badge">MOVE {{ moveNumber }}</span>
      <span class="player-names">{{ metadata?.blackName }} vs {{ metadata?.whiteName }}</span>
      <span class="game-info">
        {{ metadata?.rules }} · Komi 
        <input 
          type="number" 
          class="komi-input" 
          :value="metadata?.komi" 
          step="0.5"
          @change="(e) => emit('update-komi', parseFloat((e.target as HTMLInputElement).value))"
          title="Edit Komi"
        />
      </span>
    </div>
    <div class="status-right">
      <span class="turn-indicator" :class="turn">
        {{ turn === 'B' ? 'Black to Play' : 'White to Play' }}
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
  padding: 0 6px;
  font-size: 11px;
  color: var(--text-1);
  flex-shrink: 0;
}

.status-left  { display: flex; gap: 15px; align-items: center; }
.status-right { display: flex; gap: 15px; align-items: center; }

.move-badge {
  background: var(--accent-primary);
  color: var(--surface-0);
  padding: 1px 6px;
  font-weight: bold;
  border-radius: 2px;
  font-family: monospace;
  font-size: 10px;
}

.player-names { color: var(--text-0); font-weight: 600; }
.game-info    { color: var(--border-3); font-size: 10px; display: flex; align-items: center; gap: 4px; }

.komi-input {
  width: 42px;
  background: transparent;
  border: none;
  border-bottom: 1px dashed var(--border-3);
  color: var(--text-1);
  font-size: 10px;
  font-family: inherit;
  padding: 0;
  outline: none;
  text-align: center;
  transition: color 0.2s, border-color 0.2s;
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

.caps { font-family: monospace; color: var(--text-2); font-size: 10px; }
</style>
