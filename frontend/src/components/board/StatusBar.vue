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
import { computed } from 'vue';
import type { StoneColor, BoardState, GameNode, NodeId } from '../../types';
import UserBadge from '../chrome/UserBadge.vue';
import { useTransientHint } from '../../composables/useTransientHint';
import { store, touchSession } from '../../store';
import { getRulesetResolution, getGameEndStatus } from '../../engine/util';
import { getPath } from '../../engine/navigator';
import { RULESET_NAMES, type RulesetName } from '../../engine/rulesets';

// Toggle the persisted `session.ui.showStoneMoveNumbers` flag and bump
// the session counter SyncService keys persistence on (it no longer
// deep-watches `store.session`; see `sessionVersion` in
// `store/index.ts`). Replaces the inline template write, which the
// counter would not observe.
function toggleStoneMoveNumbers(): void {
  store.session.ui.showStoneMoveNumbers = !store.session.ui.showStoneMoveNumbers;
  touchSession();
}

interface StatusMetadata {
  readonly blackName: string;
  readonly whiteName: string;
  readonly komi:      number;
  readonly rules:     string;
}

// Arc 2 (App-decouple — docs/notes/perf-audit-game-scroll-2026-05-28.md):
// the board is passed by reference (stable identity after Arc 1's
// in-place `mutateBoard`) and the move-cursor-dependent display values
// (turn, captures, move number) are derived HERE rather than threaded
// in as pre-extracted props. Reading those fields in App.vue's template
// made App re-render the whole tree on every navigation step; deriving
// them in the leaf that shows them confines the per-nav re-render to
// this bar. `metadata` stays a prop — it is board-root-derived
// (useMetadata) and nav-stable, so App passing it costs no per-nav
// re-render.
/**
 * `canPass` (default `true`): App.vue passes `false` while the review
 * session is in a state where `handlePass` would silently no-op —
 * LOADING/ANALYZING/REVIEWED — mirroring `useBoardMoveRouting`'s own
 * gating so the button's enabled-ness matches what clicking it would
 * actually do. Per genre convention (acceptance criterion 1: "present
 * ... whenever it is the local user's turn to move ... disabled/absent
 * otherwise"), the control stays visible/enabled in ordinary free play.
 */
const props = defineProps<{
  board:    BoardState;
  metadata: StatusMetadata | null;
  canPass?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update-komi', value: number): void;
  (e: 'update-rules', value: RulesetName): void;
  (e: 'pass'): void;
}>();

const { hint } = useTransientHint();

// Sourced from `props.board` directly (not `metadata.rules`, which is
// `useMetadata`'s display-only `RU` passthrough with its own silent
// `'Japanese'` default) — the dropdown must reflect the board's
// *actual* `RU` resolution, including `source: 'defaulted'` when the
// file's `RU` is missing/unrecognized. `getRulesetResolution` is total
// (live-testing adjudication, `.claude/dispatch-reports/
// ruleset-default-wedge-fix.md`): `.name` is always one of the four
// ruling-mandated names, so the dropdown always has a valid selected
// value — `source` only changes whether the `.defaulted` hint class
// applies, never whether a value is selectable.
const rulesetResolution = computed(() => getRulesetResolution(props.board));

function onRulesChange(e: Event): void {
  const value = (e.target as HTMLSelectElement /* bound on the rules <select> */).value;
  // The <select>'s options are exactly RULESET_NAMES (plus the
  // disabled unrecognized-placeholder, which is never a selectable
  // value), so a change event's value is always a RulesetName.
  emit('update-rules', value as RulesetName);
}

const turn = computed<StoneColor>(() => props.board.turn);
const captures = computed(() => props.board.captures);

// Move number = count of 'place' moves from root to the current node.
// Moved verbatim from App.vue's template-consumed computed (Arc 2).
const moveNumber = computed((): number => {
  let count = 0;
  let currId: NodeId | null = props.board.currentNodeId;
  while (currId) {
    const node: GameNode | undefined = props.board.nodes[currId];
    if (node?.move?.type === 'place') count++;
    currId = node?.parent ?? null;
  }
  return count;
});

// Game-end signal (pass-support design's status-only two-pass check):
// evaluated positionally against the current cursor via `getPath`
// (root→current), so navigating off the two-pass position — or into a
// sibling branch that doesn't end that way — reverts the message.
const gameStatus = computed(() =>
  getGameEndStatus(props.board.nodes, getPath(props.board.nodes, props.board.currentNodeId)),
);
</script>

<template>
  <div class="status-bar">
    <div class="status-left">
      <span class="move-badge">{{ $t('statusBar.move', { n: moveNumber }) }}</span>
      <span class="player-names">
        <span class="stone-chip stone-chip--black" :class="{ active: turn === 'B' }" :aria-label="turn === 'B' ? $t('statusBar.blackToPlay') : undefined"></span>
        {{ metadata?.blackName }}
        {{ $t('statusBar.versus') }}
        <span class="stone-chip stone-chip--white" :class="{ active: turn === 'W' }" :aria-label="turn === 'W' ? $t('statusBar.whiteToPlay') : undefined"></span>
        {{ metadata?.whiteName }}
      </span>
      <span class="game-info">
        <select
          class="rules-select"
          :class="{ defaulted: rulesetResolution.source === 'defaulted' }"
          :value="rulesetResolution.name"
          @change="onRulesChange"
          :title="rulesetResolution.source === 'defaulted' ? $t('statusBar.rulesDefaulted') : $t('statusBar.editRules')"
        >
          <option v-for="name in RULESET_NAMES" :key="name" :value="name">{{ name }}</option>
        </select>
        · {{ $t('statusBar.komi') }}
        <input
          type="number"
          class="komi-input"
          :value="metadata?.komi"
          step="0.5"
          @change="(e) => emit('update-komi', parseFloat((e.target as HTMLInputElement /* bound on the komi <input> */).value))"
          :title="$t('statusBar.editKomi')"
        />
      </span>
    </div>
    <div class="status-right">
      <span v-if="gameStatus.kind === 'ended-by-pass'" class="game-end-badge">{{ $t('statusBar.gameEndedByPass') }}</span>
      <span v-if="hint" class="transient-hint">{{ hint }}</span>
      <button
        class="pass-btn"
        :disabled="props.canPass === false"
        :title="$t('statusBar.passTitle')"
        @click="emit('pass')"
      >{{ $t('statusBar.pass') }}</button>
      <button
        class="move-numbers-btn"
        :class="{ active: store.session.ui.showStoneMoveNumbers }"
        :title="$t('statusBar.toggleMoveNumbers')"
        @click="toggleStoneMoveNumbers"
      >#</button>
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
/* `position: relative` anchors `.transient-hint` below (see that
   rule's comment) — the hint is positioned absolutely against THIS
   box so its mount/unmount never changes `.status-right`'s own flex
   width, which is exactly the geometry bug this anchor exists to
   prevent (ledger row 811). */
.status-right { display: flex; gap: var(--space-medium); align-items: center; position: relative; }

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

/* Active-turn ring (iter-23). Replaces the prior text turn-indicator
   ("Black to play" / "White to play") which forced the status bar to
   wrap at 1024×768 and resize the board. `box-shadow` here paints an
   outer ring that takes no layout space — the chip's position
   doesn't shift, so the surrounding text and the bar's height stay
   put. The orange (--accent-secondary, the CTA/SR colour) carries
   the "this player acts next" signal in the chrome's already-
   established colour vocabulary. No transition: the swap is
   instantaneous to match the discrete nature of a move.
   magic-literal: 2px ring thickness — wide enough to read at the
   ~13px chip diameter (0.85em × text-emphasis), narrow enough that
   the ring doesn't visually merge with the chip's own border on the
   white side. */
.stone-chip.active {
  box-shadow: 0 0 0 2px var(--accent-secondary);
}

/* Rules dropdown — same low-contrast register as the komi input
   (transparent, dashed underline, accent-primary on focus/hover).
   `.defaulted` is a subtle informational hint (italic), not a warning
   accent — this is a represented fact about provenance, not a refused
   or error state (live-testing adjudication superseded the prior
   fail-loud 'unrecognized — choose' UI state; see
   `.claude/dispatch-reports/ruleset-default-wedge-fix.md`). Query
   construction proceeds either way, so the styling shouldn't read as
   "something is broken." */
.rules-select {
  background: transparent;
  border: none;
  border-bottom: 1px dashed var(--border-3);
  color: var(--text-1);
  font-size: var(--text-body);
  font-family: inherit;
  padding: 0;
  outline: none;
  transition: color var(--duration-default), border-color var(--duration-default);
}
.rules-select:focus, .rules-select:hover {
  color: var(--accent-primary);
  border-bottom: 1px solid var(--accent-primary);
}
.rules-select.defaulted {
  font-style: italic;
  color: var(--text-2);
}

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

.caps { font-family: monospace; color: var(--text-2); font-size: var(--text-body); }

/* Pass affordance — always-visible board-chrome control per genre
   convention (Sabaki/KaTrain/OGS survey, design-engine-features.md
   PASS SUPPORT §"Genre convention"): a labeled button, not a
   hidden/modifier-only hotkey, disabled (not hidden) when a pass
   would be a no-op (review session mid-transition). Text label
   ("Pass") rather than a glyph — this is the one control in the bar
   whose meaning must never be color- or icon-only (ADR-0019 appendix
   C18), and "Pass" has no established single-glyph convention the
   way move-numbers' "#" does. */
.pass-btn {
  background: transparent;
  border: 1px solid var(--border-3);
  border-radius: var(--radius-default);
  color: var(--text-1);
  font-size: var(--text-body);
  font-family: inherit;
  cursor: pointer;
  padding: 1px 8px;
  line-height: 1.4;
  transition: color var(--duration-default), border-color var(--duration-default);
}
.pass-btn:hover:not(:disabled) {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}
.pass-btn:disabled {
  color: var(--text-2);
  border-color: var(--border-2);
  cursor: default;
  opacity: 0.5;
}

/* Two-consecutive-passes status message — the game-end signal is a
   status only (no scoring), so it reads as informational rather than
   a warning/error accent. */
.game-end-badge {
  color: var(--accent-primary);
  font-weight: 600;
  font-size: var(--text-body);
}

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
   permanent status vocabulary so it reads as ephemeral.

   `position: absolute` (ledger row 811 fix): mounting/unmounting
   this span used to be an ordinary flex-flow insertion into
   `.status-right`, which widened the row on hover-enter and
   squeezed `.caps` (no `white-space: nowrap` there) into wrapping
   onto two lines — the status bar's `min-height` then grew to fit
   the wrapped line, and because the board square derives its size
   from the bar's remaining height budget, the ENTIRE BOARD resized
   on every hover-enter/leave. Taking the hint out of flow entirely
   removes it from `.status-right`'s width computation altogether —
   the row's rendered width, the bar's height, and every neighbor's
   position are now byte-for-byte identical whether the hint is
   mounted or not. Floats just above the bar (`bottom: 100%`) rather
   than inline with it, so it never overlaps the row's own controls;
   `pointer-events: none` keeps it from intercepting hover/click on
   whatever it floats over. Opaque `--surface-2` background (matches
   the bar itself) rather than transparent, since it now floats over
   the board rather than sitting inside the bar's own backdrop — a
   diffuse/transparent tooltip here would be illegible against board
   content, which is the case the standing no-transparent-backdrop
   rule is about; this is a small opaque label, not an overlay
   backdrop. */
.transient-hint {
  position: absolute;
  left: 0;
  bottom: 100%;
  margin-bottom: var(--space-tight);
  padding: 1px 6px;
  background: var(--surface-2);
  border: 1px solid var(--border-3);
  border-radius: var(--radius-default);
  color: var(--text-2);
  font-style: italic;
  font-size: var(--text-body);
  white-space: nowrap;
  pointer-events: none;
}
</style>
