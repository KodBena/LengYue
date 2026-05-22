<!--
  src/components/board/StatusBar.vue
  Purely presentational game status bar. Engine info (version,
  model, telemetry) lives in the Toolbar — this bar is for
  board-state vocabulary (move number, players, captures, turn).

  Player-color indicators. Each player name carries a small
  filled stone-chip (black disc for the SGF `PB` player, white
  disc for the SGF `PW` player) rendered before the name. The
  chip's source-of-truth is the SGF property key (PB vs PW),
  which `useMetadata` already routes into `blackName`/`whiteName`
  — robust against player-name strings that themselves embed a
  colour word (e.g. "AlphaGo (W)" being read by the SGF parser
  into `PB`, where the embedded "(W)" would otherwise mislead).
  Chip colours are literal `#000` / `#fff` rather than the
  chrome's `--accent-primary` / `--accent-secondary` because the
  stone-on-board metaphor is the durable semantic — themes can
  remap accent vibrancy freely without breaking the indicator.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import type { StoneColor } from '../../types';
import UserBadge from '../chrome/UserBadge.vue';
import { useTransientHint } from '../../composables/useTransientHint';
import { store } from '../../store';

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
      <span class="player-names">
        <span class="stone-chip stone-chip--black" aria-hidden="true"></span>
        {{ metadata?.blackName }}
        {{ $t('statusBar.versus') }}
        <span class="stone-chip stone-chip--white" aria-hidden="true"></span>
        {{ metadata?.whiteName }}
      </span>
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
      <button
        class="move-numbers-btn"
        :class="{ active: store.session.ui.showStoneMoveNumbers }"
        :title="$t('statusBar.toggleMoveNumbers')"
        @click="store.session.ui.showStoneMoveNumbers = !store.session.ui.showStoneMoveNumbers"
      >#</button>
      <span class="turn-indicator" :class="turn">
        {{ turn === 'B' ? $t('statusBar.blackToPlay') : $t('statusBar.whiteToPlay') }}
      </span>
      <span class="caps">B: {{ captures.B }} · W: {{ captures.W }}</span>
      <UserBadge />
    </div>
  </div>
</template>

<style scoped>
/* magic-literal: 20px `.status-bar` min-height. The at-rest floor —
   chosen as the compact-but-legible band for a single line of
   text-emphasis (~13px) bracketed by a 1px border-top, leaving ~19px
   interior. `min-height` (not `height`, iter-15): the bar grows if
   the actual rendered content (Move-badge font + bold monospace +
   padding) exceeds the 19px interior at any given browser/font
   combination. Without that, `align-items: center` distributed the
   overflow equally above and below — text visibly crossed the
   border-top line. */
.status-bar {
  min-height: 20px;
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

.player-names {
  color: var(--text-0);
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: var(--space-tight);
}
.game-info    { color: var(--border-3); font-size: var(--text-body); display: flex; align-items: center; gap: var(--space-tight); }

/* Stone-chip indicators preceding each player name. Sized to the
   ambient font (0.85em) so they scale with the status-bar
   typography rather than the board. The white chip carries a
   thin border because pure white-on-surface-2 has no edge contrast
   against the chrome backdrop; the black chip needs none. */
.stone-chip {
  display: inline-block;
  width: 0.85em;
  height: 0.85em;
  border-radius: var(--radius-circle);
  flex-shrink: 0;
}
.stone-chip--black { background: #000; }
.stone-chip--white { background: #fff; border: 1px solid var(--border-3); }

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

/* Move-number toggle. Inactive: muted text-2, no background.
   Active: accent-primary, hinting "on" without a separate
   indicator (the board itself is the indicator). Borderless to
   match the chrome's low-contrast register; the same tonal scale
   as `.caps` for the resting state so the button doesn't draw
   the eye when off. */
.move-numbers-btn {
  background: transparent;
  border: none;
  color: var(--text-2);
  font-family: monospace;
  font-size: var(--text-body);
  font-weight: bold;
  cursor: pointer;
  padding: 0 var(--space-tight);
  line-height: 1;
  transition: color var(--duration-default);
}
.move-numbers-btn:hover { color: var(--text-0); }
.move-numbers-btn.active { color: var(--accent-primary); }

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
