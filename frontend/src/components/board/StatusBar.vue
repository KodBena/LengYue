<!--
  src/components/board/StatusBar.vue
  Purely presentational game status bar. Engine info (version,
  model, telemetry) lives in ToolbarEngineControls/ToolbarEngineMetrics
  (M2 stage B2b boot-restoration wiring split the retired
  ToolbarEngineCluster into these — `.claude/dispatch-reports/lyt-boot-
  restoration.md`) — this bar is for board-state vocabulary (move
  number, players, captures, turn).

  Move-navigation cluster (LYT toolbar ontology reencode,
  commissioner-ratified 2026-08-11, ledger rows 1930/1931, item 1
  "BOARD CONTROLS GO TO THE BOARD"): the |< < > >| cluster
  (`ToolbarMoveNav.vue`) relocates here from the side-column toolbar —
  this component is the one mount that already spans BOTH the `.lyt`
  encoding's `I_board` (24px info) and `A_board` (28px action) bands
  (`lyt-widget-registry.ts`'s own I_board note: A_board is 'absorbed'
  into I_board because StatusBar already carries both an info readout
  and action buttons internally), so board-scoped navigation joins the
  board-scoped action row it already reserves rather than opening a
  third band. No new component, no new wiring beyond mounting the
  existing `ToolbarMoveNav.vue` (unchanged, still wired to the same
  `useNavigation()` actions the keybindings dispatch).

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
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { StoneColor, BoardState, GameNode, NodeId } from '../../types';
import UserBadge from '../chrome/UserBadge.vue';
import ToolbarMoveNav from '../chrome/ToolbarMoveNav.vue';
import { useTransientHint } from '../../composables/useTransientHint';
import { useSetupTools, SETUP_TOOL_LABEL_KEYS } from '../../composables/board/useSetupTools';
import { useDeferredContainerBreakpoint } from '../../composables/chrome/useDeferredContainerBreakpoint';
import { store, touchSession } from '../../store';
import { getRulesetResolution, getGameEndStatus } from '../../engine/util';
import { getPath } from '../../engine/navigator';
import { RULESET_NAMES, type RulesetName } from '../../engine/rulesets';
import { komiDomainStep } from '../../engine/katago/komi-calibration';

// G12 (opus-uiux-geometry-consult.md): the bar had NO overflow policy —
// below ~1000px the Pass button, capture counts and the user badge fell
// past the viewport edge with no scroll/wrap/collapse, and `.player-names`
// wrapped onto three lines (growing `.status-bar`'s own height, which the
// board derives its square from — see `min-height`'s own doc above).
// Genre fix (status bars in Sabaki/CGoban3/KaTrain): priority collapse,
// not scroll — right-side OPTIONAL segments yield first; the primary
// action (Pass) and core game state (move number, captures) are never
// removed. `narrow` collapses the three lowest-priority segments in one
// step — the rules/komi editors (`.game-info`, editable from Settings ▸
// Session too, so losing this copy loses no unique capability), the
// move-numbers toggle (`.move-numbers-btn`, a display preference), and
// the user badge (`UserBadge`, identity chrome, not game state) — and
// caps `.player-names` to a single ellipsized line instead of letting it
// wrap. `.pass-btn`, `.move-badge` and `.caps` are NEVER hidden by this
// class (see the CSS below): they stay in the DOM and in flow regardless
// of tier, satisfying "Pass must never be unreachable" by construction
// rather than by convention.
//
// Threshold (assumption, not spec-given): WITNESSED natural (unforced)
// content width at 1920px — `.status-left` 447px + `.status-right` 256px
// + the bar's own 16px horizontal padding ≈ 719px (playwright geometry
// probe, `.claude/dispatch-reports/geo-d-overflow-build.md`). 700px
// engages narrow mode fractionally BEFORE that natural need is reached,
// so the collapse lands before any wrap/clip is visible rather than
// after. `useDeferredContainerBreakpoint` reuses the SAME drag-continuity
// discipline `useResizablePanel.ts`'s splitter drags already established
// elsewhere in this app (`isAnyPanelResizing`-gated commit, frozen mid-
// drag, committed once on release) — the board (and so this bar) resizes
// live while the outer splitter is dragged, so this bar's own discrete
// reorganization must not flip superimposed on that gesture either.
const STATUS_BAR_NARROW_THRESHOLD_PX = 700;

const statusBarRef = ref<HTMLElement | null>(null);
const { committed: statusBarNarrow, observe: observeStatusBarWidth, stop: stopObservingStatusBarWidth } =
  useDeferredContainerBreakpoint(STATUS_BAR_NARROW_THRESHOLD_PX);

// `typeof ResizeObserver !== 'undefined'` guard: mirrors
// `useResizablePanel.ts`'s `attachRowObserver` convention — jsdom (this
// codebase's unit/integration test substrate, `vite.config.ts`) has no
// ResizeObserver global, and the many existing StatusBar mounts across
// the test suite (setup-mode-indicator, hint-no-reflow, tool-label-
// consistency, …) never stubbed one because this bar had no observer
// before G12. `committed` degrades to its `ref(false)` default (wide/
// not-narrow) under that guard — the same "no narrow mode" behaviour
// this bar always had — so unrelated tests asserting on its OTHER
// markup stay unaffected instead of crashing at mount.
onMounted(() => {
  if (statusBarRef.value && typeof ResizeObserver !== 'undefined') {
    observeStatusBarWidth(statusBarRef.value);
  }
});
onUnmounted(() => {
  stopObservingStatusBarWidth();
});

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

// M8(b) (menus-ui audit row 1291): the setup toolkit's sticky mode
// (SetupToolPalette.vue's header — a selected tool persists after the
// palette itself closes) was indicated ONLY by the toolbar trigger's
// own highlight, invisible once the palette is closed. `activeTool` is
// the same module-scope ref the palette reads/writes
// (useSetupTools.ts) — this bar renders a persistent, board-adjacent
// chip for as long as a tool stays armed, genre precedent (Sabaki/
// CGoban3: persistent toolbar/status-bar state while an edit mode is
// live), independent of whether the palette is open.
const { activeTool } = useSetupTools();

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

// The komi `<input>`'s native `step` (ledger row 1146): `1` under
// Tromp-Taylor (its komi domain is integers-only —
// `engine/katago/komi-calibration.ts`'s `komiDomainStep`), `0.5`
// otherwise. This only governs the input's up/down-arrow increment and
// browser validity styling — App.vue's `handleUpdateKomi` is the actual
// enforcement point (a typed-in value bypasses `step` entirely), but
// the control should still LOOK like it only accepts the ruleset's
// domain, not silently disagree with what gets persisted.
const komiStep = computed(() => komiDomainStep(rulesetResolution.value.name));

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
  <div class="status-bar" ref="statusBarRef" :class="{ 'status-bar--narrow': statusBarNarrow }">
    <div class="status-left">
      <!-- Move-navigation cluster (item 1, see header comment above) —
           leftmost, board-adjacent, genre position (Sabaki/KaTrain/
           Lizzie: |< < > >| sits directly under/beside the board). -->
      <ToolbarMoveNav />
      <!-- M8(b): persistent setup-mode indicator. Opaque chip (no
           translucent overlay — standing ruling), visible for as long
           as `activeTool` is armed regardless of the palette's own
           open/closed state. -->
      <span
        v-if="activeTool"
        class="setup-mode-chip"
        data-testid="setup-mode-chip"
      >{{ $t('statusBar.setupModeActive', { tool: $t(SETUP_TOOL_LABEL_KEYS[activeTool]) }) }}</span>
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
          :step="komiStep"
          @change="(e) => emit('update-komi', parseFloat((e.target as HTMLInputElement /* bound on the komi <input> */).value))"
          :title="$t('statusBar.editKomi')"
        />
      </span>
    </div>
    <!-- Permanently-present in-flow slot (commission row 837): always
         rendered — never `v-if`-inserted/removed — so its presence in
         the layout never toggles. Empty text when no hint is active. -->
    <span class="transient-hint">{{ hint }}</span>
    <div class="status-right">
      <span v-if="gameStatus.kind === 'ended-by-pass'" class="game-end-badge">{{ $t('statusBar.gameEndedByPass') }}</span>
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
  color: var(--text-0);
  flex-shrink: 0;
}

.status-left  { display: flex; gap: var(--space-medium); align-items: center; }
.status-right { display: flex; gap: var(--space-medium); align-items: center; }

.move-badge {
  /* wC-contrast (F9 named site — the "MOVE 95" chip): --surface-0 text
     on an --accent-primary fill measured 2.08:1 in the default cluster
     theme (surface-0 and accent-primary are the same two colors the
     CLEAR ALL defect measures, just swapped fill/text). --text-on-accent
     is the token minted for exactly this "text directly on an accent
     fill" role (theme.css, ledger rows 1018/1144; ~7.7:1 here) — the
     same token LibraryTable.vue's .library-row.selected and
     LibraryPreviewPane.vue's .preview-btn.primary already use. */
  background: var(--accent-primary);
  color: var(--text-on-accent);
  padding: 1px 6px;
  font-weight: bold;
  border-radius: var(--radius-default);
  font-family: monospace;
  font-size: var(--text-body);
}

/* Setup-mode chip (M8(b)): opaque solid fill (never a translucent
   overlay, per the standing ruling), `--state-attention` — the same
   accent the app already uses for "this is an interruptive/board-
   mutating mode" (see Toolbar.vue's `.btn-stop-match`) — so the color
   vocabulary for "board edits are live" is consistent app-wide.
   `--text-on-accent` (theme.css, minted for LibraryTable.vue's
   `.library-row.selected`) is the established "text directly on a
   saturated chrome fill" role token in this codebase — reused here
   rather than adding a new one for the same category of pairing. */
.setup-mode-chip {
  background: var(--state-attention);
  color: var(--text-on-accent);
  padding: 1px 6px;
  font-weight: bold;
  border-radius: var(--radius-default);
  font-family: monospace;
  font-size: var(--text-body);
  text-transform: uppercase;
  letter-spacing: var(--tracking-tight);
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
   wrap at 1024×768 and resize the board. `outline` here paints an
   outer ring that takes no layout space — the chip's position
   doesn't shift, so the surrounding text and the bar's height stay
   put (box-shadow banned per ledger row 1506; outline is the
   layout-neutral substitute — border would grow the chip's box).
   The orange (--accent-secondary, the CTA/SR colour) carries
   the "this player acts next" signal in the chrome's already-
   established colour vocabulary. No transition: the swap is
   instantaneous to match the discrete nature of a move.
   magic-literal: 2px ring thickness — wide enough to read at the
   ~13px chip diameter (0.85em × text-emphasis), narrow enough that
   the ring doesn't visually merge with the chip's own border on the
   white side. */
.stone-chip.active {
  outline: 2px solid var(--accent-secondary);
  outline-offset: 1px;
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
  color: var(--text-0);
  font-size: var(--text-body);
  font-family: inherit;
  padding: 0;
  outline: none;
}
/* wC-contrast (F9): readable text is --text-0, not accent-primary — 2.08:1 in the default cluster theme. Border stays accent (ornament). */
.rules-select:focus, .rules-select:hover {
  color: var(--text-0);
  border-bottom: 1px solid var(--accent-primary);
}
/* G29 (audit finding, opus-uiux-geometry-consult.md): the base rule's
   `outline: none` applied at every focus, including keyboard focus,
   leaving this tab stop with no visible indicator. Restores the
   app's existing :focus-visible outline idiom (TabWidget.vue's
   `.tab-header li:focus-visible`) — accent outline — on top of, not
   instead of, the existing focus/hover colour change above.
   Visibility only: tabindex and tab order are unchanged. */
.rules-select:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}
.rules-select.defaulted {
  font-style: italic;
  color: var(--text-0);
}

.komi-input {
  width: 42px;
  background: transparent;
  border: none;
  border-bottom: 1px dashed var(--border-3);
  color: var(--text-0);
  font-size: var(--text-body);
  font-family: inherit;
  padding: 0;
  outline: none;
  text-align: center;
}
/* wC-contrast (F9): readable text is --text-0, not accent-primary — 2.08:1 in the default cluster theme. Border stays accent (ornament). */
.komi-input:focus, .komi-input:hover {
  color: var(--text-0);
  border-bottom: 1px solid var(--accent-primary);
}
/* G29 (audit finding, opus-uiux-geometry-consult.md): same defect and
   same fix as `.rules-select:focus-visible` above — the base rule's
   `outline: none` left this tab stop with no visible keyboard-focus
   indicator. Visibility only: tabindex and tab order are unchanged. */
.komi-input:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
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

/* `white-space: nowrap`: the permanent `.transient-hint` slot (below)
   already absorbs the bar's free space via `flex: 1 1 0`, so `.caps`
   should never need to wrap — but pin it explicitly so a future long
   capture count (or a narrower viewport) can't wrap this block onto a
   second line and grow the bar's `min-height` (the original ledger
   row 811 reflow mechanism). */
.caps { font-family: monospace; color: var(--text-0); font-size: var(--text-body); white-space: nowrap; }

/* G12 narrow-mode collapse (see the `statusBarNarrow` doc in <script>):
   the three lowest-priority segments are removed from flow entirely
   (not just visually hidden) so their claimed width goes back to
   `.pass-btn`/`.caps`/`.player-names`, and `.player-names` — never
   hidden, only truncated — gets a single-line ellipsis instead of the
   wrap that used to grow the bar's own height (and so the board's
   square, which derives its size from the bar's remaining height
   budget — see this file's `min-height` comment). `.move-badge`,
   `.pass-btn` and `.caps` carry NO rule in this block: they are never
   touched by narrow mode, which is what makes "Pass never unreachable"
   a structural property of this stylesheet rather than a threshold
   someone has to keep tuned. `:deep()` reaches `UserBadge`'s own root
   class from this scoped stylesheet — the component has no narrow-mode
   concept of its own, this bar's overflow policy owns the decision to
   drop it. */
.status-bar--narrow .game-info,
.status-bar--narrow .move-numbers-btn,
.status-bar--narrow :deep(.user-badge) {
  display: none;
}
.status-bar--narrow .player-names {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40%;
}

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
  color: var(--text-0);
  font-size: var(--text-body);
  font-family: inherit;
  cursor: pointer;
  padding: 1px 8px;
  line-height: 1.4;
}
/* wC-contrast (F9): readable text is --text-0, not accent-primary — 2.08:1 in the default cluster theme. Border stays accent (ornament). */
.pass-btn:hover:not(:disabled) {
  color: var(--text-0);
  border-color: var(--accent-primary);
}
.pass-btn:disabled {
  color: var(--text-disabled);
  border-color: var(--border-2);
  cursor: default;
  opacity: 0.5;
}

/* Two-consecutive-passes status message — the game-end signal is a
   status only (no scoring), so it reads as informational rather than
   a warning/error accent. */
.game-end-badge {
  /* wC-contrast (F9): readable text is --text-0, not accent-primary — 2.08:1 in the default cluster theme. */
  color: var(--text-0);
  font-weight: 600;
  font-size: var(--text-body);
}

/* Move-number toggle. Inactive: --text-disabled (rows 1478/1479/
   1481/1497 — an on/off toggle affordance, not readable prose; the
   commissioner's disabled-control exception), no background.
   Active: --text-0 (wC-contrast, F9 — accent-primary measured 2.08:1
   in the default cluster theme; "active" is not a disabled state, so
   the disabled-control exception doesn't cover it), hinting "on"
   without a separate indicator (the board itself is the indicator).
   Borderless to match the chrome's low-contrast register; `.caps`
   nearby is now --text-0 (readable capture-count text, rows
   1478/1479/1481), so this button's resting state is deliberately
   dimmer than its neighbor — the toggle-off signal, not a shared
   tonal scale. */
/* G30 (WCAG 2.5.8): witnessed at 14x10 — under the 24x24 pointer-target
   floor. min-width/min-height is the same transparent-expansion floor
   KeybindingRow's .row-btn already carries (M16 era) — background stays
   transparent and border stays none, so the "#" glyph's visual size is
   unchanged; flex-centering keeps it centred in the taller/wider box. */
.move-numbers-btn {
  background: transparent;
  border: none;
  color: var(--text-disabled);
  font-family: monospace;
  font-size: var(--text-body);
  font-weight: bold;
  cursor: pointer;
  padding: 0 var(--space-tight);
  line-height: 1;
  min-width: 24px;
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.move-numbers-btn:hover { color: var(--text-0); }
.move-numbers-btn.active { color: var(--text-0); }

/* Transient hint surface — populated by `useTransientHint` from
   hover-driven affordances (e.g. the PV-paste discoverability text on
   move-suggestion hover). Distinct styling (italic, muted) from the
   permanent status vocabulary so it reads as ephemeral. Empty text
   when no hint is active, not `v-if`-removed — see the template.

   Commission row 837, third mechanism, superseding two defective
   priors: (1) an ordinary `v-if`-inserted flex sibling in
   `.status-right` widened the row on mount, squeezed `.caps` (no
   `white-space: nowrap` at the time) into wrapping onto two lines,
   and grew the bar's `min-height` — because the board square derives
   its size from the bar's remaining height budget, the ENTIRE BOARD
   resized on every hover-enter/leave (ledger row 811, first pass).
   (2) `position: absolute; bottom: 100%` took the hint out of flow to
   stop the reflow, but then floated it OVER the board's bottom-right
   corner (occluding edge coordinates) and let an ancestor clip long
   text mid-word into an illegible "Ctrl+cli…" box (ledger row 811,
   second pass; screenshots ~/occluded.png, ~/occluded2.png).

   This slot is a PERMANENT in-flow flex child, always present in the
   layout regardless of hint state, occupying the bar's existing dead
   gap between the komi field (`.status-left`) and the Pass button
   (`.status-right`). Because it never mounts/unmounts, the bar's
   geometry is byte-for-byte identical whether a hint is active or
   not — reflow is impossible by construction, not by an out-of-flow
   escape hatch. Being in-flow (not `position: absolute`) also makes
   occlusion of board content impossible: it can only ever displace
   its own flex siblings within the bar, never overlay the board.
   `flex: 1 1 0` lets it claim exactly the bar's spare width; `min-
   width: 0` overrides the flexbox default `min-width: auto`, which
   would otherwise refuse to shrink the item below its text's natural
   width and force the row to overflow instead of the text eliding;
   `overflow: hidden` + `text-overflow: ellipsis` + `white-space:
   nowrap` clip an over-long hint to a trailing ellipsis at a whole-
   line boundary — never mid-word, and never by wrapping. */
.transient-hint {
  /* Longhand, not the `flex: 1 1 0` shorthand: jsdom's CSSOM (the
     substrate the geometry regression test in
     `status-bar-hint-no-reflow.test.ts` reads via `getComputedStyle`)
     does not expand that shorthand into its longhand computed values
     the way a real browser does — `flex-grow` read back as `0`
     despite the shorthand setting it to `1`. Real browsers apply the
     shorthand identically either way; longhand is the form that is
     legible to both. */
  flex-grow: 1;
  flex-shrink: 1;
  flex-basis: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-0);
  font-style: italic;
  font-size: var(--text-body);
}
</style>
