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
import { useI18n } from 'vue-i18n';
import type { StoneColor, BoardState, GameNode, NodeId } from '../../types';
import ToolbarMoveNav from '../chrome/ToolbarMoveNav.vue';
import { useTransientHint } from '../../composables/useTransientHint';
import { useSetupTools, SETUP_TOOL_LABEL_KEYS } from '../../composables/board/useSetupTools';
import { useDeferredContainerBreakpoint } from '../../composables/chrome/useDeferredContainerBreakpoint';
import { store, touchSession } from '../../store';
import { getRulesetResolution } from '../../engine/util';
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
// Session too, so losing this copy loses no unique capability) and the
// move-numbers toggle (`.move-numbers-btn`, a display preference) — and
// caps `.player-names` to a single ellipsized line instead of letting it
// wrap. (A third collapsed segment, the user badge, relocated OUT of this
// bar entirely — commissioner ruling 2026-08-21: identity chrome belongs
// in the toolbar strip, not layout-negotiable board-adjacent content; see
// `ToolbarAppCluster.vue`'s own header. What's left below is two segments, not
// three, but "the lowest-priority segments" framing is otherwise
// unchanged.) `.pass-btn`, `.move-badge` and `.caps` are NEVER hidden by this
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

// status-bar-narrow-0c21: a SECOND breakpoint, added despite the N1/N4
// report below (which tried and reverted a two-tier design for A
// DIFFERENT defect — see its own §5.1). That report's two causes both
// stayed inside the single `narrow` tier because tightening
// spacing/gaps was enough down to the 420px documented floor. This one
// is a different failure CLASS, live-probed below that floor
// (~300px, `.claude/dispatch-reports/statusbar-narrow-0c21-build.md`):
// `.player-names` (now genuinely flexible, no flat cap — see that
// rule's own comment) sharing `.status-left`'s space with the nav
// cluster and move-badge eventually hits a floor (bare stone chips, no
// name text) that ITSELF no longer fits beside `.status-right` on one
// line — and because `.status-left` carries `min-width: 0` (S4, so it
// can shrink for the FIRST cause), its child can overflow `.status-
// left`'s own shrunk box directly into `.status-right`'s territory,
// reproducing the overlap regardless of the reserved `.status-bar`
// `gap`. `ultraNarrow` moves `.status-right` to its own second line
// instead (CSS below) — a discrete reorganization exactly like
// `narrow` itself, so it gets its own committed/deferred breakpoint
// for the SAME drag-continuity reason `narrow` already has one.
const STATUS_BAR_ULTRA_NARROW_THRESHOLD_PX = 300;

// N1/N4 (LYT finish-pass-2, `.claude/dispatch-reports/lyt-finish-pass-2.md`):
// narrow mode's own G12 collapse (above) still wasn't enough — a live
// rig re-measurement (`.claude/dispatch-reports/lyt-n1-statusbar.md`)
// found TWO compounding causes, both fixed below, both still inside
// this single `narrow` tier (no second breakpoint added — see that
// report for why a two-tier design was tried and reverted, for THAT
// defect class; `ultraNarrow` above is a different one):
//
// 1. `.player-names`' old `max-width: 40%` doesn't resolve against a
//    small "just enough" basis the way the mental model of "cap the
//    low-priority segment" suggests. `.status-left` is an auto-width
//    (shrink-to-fit) flex item, and a percentage `max-width` on ITS
//    descendant resolved (witnessed, Chromium) against the BAR's own
//    width — at a witnessed 647px bar width, "capped" `.player-names`
//    still rendered ~250px wide, alone consuming a third of the
//    natural width the bar needed. Fixed now at a flat 90px — bounded
//    regardless of how wide the bar itself is.
// 2. Even with (1) fixed, spacing/padding sized for the wide (non-
//    narrow) bar was still too loose for the tightest supported width
//    (420px). The rules below tighten `.status-left`/`.status-right`
//    gaps, the move-nav button cluster's own gap/padding (reached via
//    `:deep()`, the same cross-component idiom the narrow-mode rules
//    below already use for `ToolbarMoveNav`), and the bar's own
//    horizontal padding — all reductions of an EXISTING declaration's
//    value, never a new rule category.
//
// `.pass-btn`, `.move-badge` and `.caps` are STILL never hidden, and
// their own padding is only lightly trimmed (never below a legible
// floor) — "Pass and the game-state facts are never unreachable"
// stays a structural property of this stylesheet, not a threshold
// someone has to keep tuned per viewport.
const statusBarRef = ref<HTMLElement | null>(null);
const { committed: statusBarNarrow, observe: observeStatusBarWidth, stop: stopObservingStatusBarWidth } =
  useDeferredContainerBreakpoint(STATUS_BAR_NARROW_THRESHOLD_PX);
// status-bar-narrow-0c21: a second, independent breakpoint instance
// against the SAME element — the composable is generic over one
// threshold, so a second tier is a second call, not a parameter. Each
// keeps its own hysteresis/drag-continuity state; they don't interact.
const { committed: statusBarUltraNarrow, observe: observeStatusBarUltraNarrowWidth, stop: stopObservingStatusBarUltraNarrowWidth } =
  useDeferredContainerBreakpoint(STATUS_BAR_ULTRA_NARROW_THRESHOLD_PX);

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
    observeStatusBarUltraNarrowWidth(statusBarRef.value);
  }
});
onUnmounted(() => {
  stopObservingStatusBarWidth();
  stopObservingStatusBarUltraNarrowWidth();
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
// Item 4: sourced for the `.player-names` title tooltip's "vs" text —
// see that computed's own comment below.
const { t } = useI18n();

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

// Item 4 (occluded-names regression, mandate addendum): `.player-names`
// can now genuinely ellipsize (see that rule's own CSS comment), so the
// untruncated pairing needs a discoverable affordance — a native
// `title` tooltip on the element, the same "elided value stays
// reachable on hover" convention `HyperparamPromptModal.vue`'s raw-
// symbol title already establishes (S9,
// `.claude/dispatch-reports/component-shoddiness-build.md`). Reads the
// same `metadata` fields the template already renders, so it can never
// disagree with what's on screen (short of one being elided and the
// other not, which the tooltip covers either way).
const playerNamesTitle = computed(
  () => `${props.metadata?.blackName ?? ''} ${t('statusBar.versus')} ${props.metadata?.whiteName ?? ''}`,
);

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

</script>

<template>
  <div
    class="status-bar"
    ref="statusBarRef"
    :class="{ 'status-bar--narrow': statusBarNarrow, 'status-bar--ultra-narrow': statusBarUltraNarrow }"
  >
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
      <span class="player-names" :title="playerNamesTitle">
        <span class="player-name player-name--black">
          <span class="stone-chip stone-chip--black" :class="{ active: turn === 'B' }" :aria-label="turn === 'B' ? $t('statusBar.blackToPlay') : undefined"></span><span class="player-name-text">{{ metadata?.blackName }}</span>
        </span>
        <span class="vs-text">{{ $t('statusBar.versus') }}</span>
        <span class="player-name player-name--white">
          <span class="stone-chip stone-chip--white" :class="{ active: turn === 'W' }" :aria-label="turn === 'W' ? $t('statusBar.whiteToPlay') : undefined"></span><span class="player-name-text">{{ metadata?.whiteName }}</span>
        </span>
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
    </div>
  </div>
</template>

<style scoped>
/* status-bar-narrow-0c21: `min-height` raised from a standalone 20px
   literal to `--control-height-min` (theme.css, 24px — the G30
   pointer-target floor `ToolbarMoveNav.vue`'s nav cluster already
   requires). The 20px figure predates that cluster's relocation into
   this bar (see the header comment above on item 1 "BOARD CONTROLS GO
   TO THE BOARD") — once the nav buttons mounted here, their own G30
   floor already forced the row to 24px regardless of this
   declaration, so the two numbers had silently drifted apart (a
   `min-height` that no longer described the bar's real floor). Reading
   the same token nav/Pass/komi now share makes the four agree by
   construction instead of by coincidence — no more mismatched-height
   dead space around whichever control was shorter than the row nav
   buttons already forced it to be. `min-height` (not `height`,
   iter-15, unchanged): the bar still grows past the floor if content
   ever needs more at some font/browser combination. */
.status-bar {
  min-height: var(--control-height-min);
  background: var(--surface-2);
  border-top: 1px solid var(--border-1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 var(--space-default);
  /* status-bar-narrow-0c21: a reserved minimum gap between the three
     direct children (`.status-left` / `.transient-hint` /
     `.status-right`) — NOT a tuning choice, a structural guarantee.
     `.transient-hint` (below) is `flex-grow: 1` / `flex-basis: 0` and
     legitimately shrinks to 0px whenever `.status-left`'s own content
     already fills the bar (witnessed live at narrow widths down to
     ~290px, `status-bar-narrow-0c21` rig probe) — at that point,
     without a reserved gap, `.status-left`'s last rendered content (the
     white `.stone-chip`) sits FLUSH against `.status-right`'s first
     content (`.pass-btn`), and the active-turn ring's `outline`
     (deliberately laid outside the chip's border box, "takes no layout
     space" — see `.stone-chip.active`'s own comment) visually bleeds
     ~4px into the Pass button with no DOM-level overlap needed to
     produce it. `--space-default` (8px) clears that 3px bleed
     (outline-width 2px + outline-offset 1px) with margin to spare at
     every width down to where `.status-right` still shares line 1 with
     `.status-left`. Below that (the `.status-bar--ultra-narrow` tier,
     further down this file), `.status-right` moves to its own second
     line instead — this gap alone cannot close that class, since it
     only reserves space BETWEEN `.status-bar`'s direct children, not
     against a child's own descendant (`.player-names`) overflowing its
     shrunk parent's box; the two mechanisms compose, one is not a
     substitute for the other. */
  gap: var(--space-default);
  font-size: var(--text-emphasis);
  color: var(--text-0);
  flex-shrink: 0;
}

/* S4 (component-shoddiness audit, 2026-08-21): `.status-left` had no
   `min-width: 0`, so as a flex item of `.status-bar` it refused to
   shrink below its children's combined min-content width — at 1366×768
   (a width ABOVE the 700px narrow-mode threshold, so narrow mode never
   engaged) that combined width exceeded the space actually available,
   and the browser rendered `.status-left` at its full natural width
   regardless, overrunning into `.status-right` and physically
   overlapping the komi input with the Pass button by ~6px. `min-width:
   0` lets `.status-left` shrink to whatever the bar allocates it;
   `.player-names` (below) is the one child that actually absorbs that
   shrink, via its own `flex: 1 1 auto` + ellipsis. `.status-right`
   gets `flex-shrink: 0` so Pass/caps/the user badge are never
   themselves compressed or pushed off — only `.player-names` yields.

   Item 1 (occluded-names REOPENED, commissioner-witnessed live — the
   fix above only cured "ellipsis renders" but left the names STARVED
   even in a bar with ample free width). Root cause: `.status-left` had
   no `flex-grow` of its own (the shorthand default is `flex: 0 1 auto`),
   so as a flex item of `.status-bar` it never claimed a share of the
   bar's spare width — `.status-bar`'s only `flex-grow` child was
   `.transient-hint` (`flex: 1 1 0`, below), which absorbed 100% of any
   surplus regardless of how it was needed elsewhere. `.player-names`'
   own `flex: 1 1 auto` (below) was consequently INERT: a flex-grow
   factor can only redistribute genuine positive free space *within its
   own containing flex context*, and `.status-left` never had any to
   redistribute — it was never wider than the bare sum of its children's
   content widths, so `.player-names` could never render past its own
   unclamped text width no matter how much blank bar remained to its
   right. `flex: 1 1 auto` here (replacing the bare `display: flex`)
   lets `.status-left` compete with `.transient-hint` for the bar's
   surplus on equal footing; whatever share it wins flows straight into
   `.player-names`, the only `flex-grow` child inside it — so the two
   names are now genuinely free to render at FULL width whenever the
   bar has room, not merely whenever their own bare text happens to fit
   inside a box that was never allowed to grow. */
.status-left  { display: flex; flex: 1 1 auto; gap: var(--space-medium); align-items: center; min-width: 0; }
.status-right { display: flex; gap: var(--space-medium); align-items: center; flex-shrink: 0; }

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
  /* S4: the "MOVE" / "0" pair is two space-separated words, so under
     flexbox's default `min-width: auto` a squeezed `.status-left`
     could satisfy its min-content constraint by wrapping at the space
     — "MOVE" over "0" — growing the badge to two lines and, with it,
     the whole bar's height (witnessed at 1366×768). Never negotiable:
     this badge is essential game state, always one line. */
  white-space: nowrap;
  flex-shrink: 0;
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

/* S4: single-line by construction, not just under narrow mode. This is
   the segment that ABSORBS `.status-left`'s shrink (`flex: 1 1 auto` +
   `min-width: 0`) — it was the only child of `.status-left` with no
   `white-space` rule at all, so a squeezed bar broke it mid-phrase
   ("Black" / "vs" / "White" across two lines, witnessed at 1366×768)
   instead of eliding gracefully. `min-width` floors it at a few
   characters plus a stone chip so it never collapses to nothing.
   (status-bar-narrow-0c21: narrow mode no longer adds its own flat
   `max-width` ceiling here — see that rule's own removal note further
   below — `.player-names` now flexes the same way in both tiers,
   reactive to whatever room `.status-left` actually has.)

   Item 4 (occluded-names regression, mandate addendum): S4's own fix
   still silently clipped mid-word with NO "…" affordance — witnessed as
   "Black vs Whi" at a narrow bar width. Root cause: `text-overflow:
   ellipsis` is only defined (and only reliably implemented) against the
   overflow of a run of INLINE content in a block/inline box with
   `overflow: hidden` + `white-space: nowrap` — it is NOT guaranteed to
   insert the ellipsis glyph when the overflowing box is a FLEX container
   (`display: inline-flex`, as this rule was) with multiple flex-item
   children (the two `.stone-chip` spans + the interleaved text runs).
   Browsers instead hard-clip the last partially-visible flex item with
   no ellipsis inserted — exactly the "cut off mid-word, no affordance"
   symptom. Fix: drop the flex display so `.player-names` is a plain
   inline box whose children (`.stone-chip` is already `display:
   inline-block`) participate in normal inline flow — the shape
   `text-overflow: ellipsis` is actually specified for. Inter-child
   spacing, previously from `gap`, now comes from `.stone-chip`'s own
   `margin-right` (below) plus the template's own literal whitespace
   between the name/"vs" text runs. `:title` on the element (template)
   carries the untruncated "Black vs White" pairing on hover/focus, so
   an elided pairing is never DISCOVERABLE only, per the mandate's
   "ellipsis + affordance" requirement — mirroring the rest of this
   codebase's elided-chrome-label convention (`.claude/dispatch-reports/
   component-shoddiness-build.md` S9, `HyperparamPromptModal.vue`'s own
   hover-title pattern for a value elided from permanent display).

   Item 1 (occluded-names REOPENED, mandate addendum): the single
   `.player-names` blob applied ONE `text-overflow: ellipsis` to the
   whole "Black vs White" run — under narrowing, the ellipsis always
   lands at the TAIL of that run, so Black's name (first) stayed
   perpetually intact while White's name (last) was the only one ever
   eaten, all the way down to nothing. That is first-takes-all tail
   elision, never a symmetric degradation — the defect the mandate
   names explicitly. Fix: `.player-names` is now a flex ROW (not the
   ellipsizing box itself); each name gets its OWN `.player-name` child
   with its own `overflow: hidden` + `text-overflow: ellipsis` +
   `white-space: nowrap` — so whatever width `.player-names` is given
   (ample or narrow, see `.status-left`'s own comment above) is shared
   between the two names, and both abbreviate/elide together as that
   width shrinks. Neither player is privileged by DOM position. The
   `:title` tooltip (below, unchanged) still carries the full
   untruncated pairing regardless of which (or both) names are elided.

   Item 1 REOPENED a second time (live-witnessed at 1920px: BOTH names
   rendered fully elided despite enormous free width — the "equal
   flex-basis split" this comment used to describe). Root cause:
   `flex: 1 1 0` sets each name's flex-BASIS to the literal length
   `0`. A flex item's `flex-basis` isn't only "the size to flex from" —
   per the CSS Flexbox intrinsic-sizing algorithm (§9.9), it is ALSO
   what that item contributes toward ITS OWN FLEX CONTAINER's
   max-content size when an ANCESTOR is sizing that container
   content-based (exactly `.player-names`' own situation: `flex: 1 1
   auto` on `.player-names` itself, resolved against `.status-left`).
   With both children's basis pinned to `0`, `.player-names`'
   max-content contribution up the tree was ~0 regardless of how long
   either name actually was — so `.status-left`/`.status-bar` never
   saw a reason to hand `.player-names` more than its bare `min-width:
   32px` floor, and both names ellipsized immediately even with the
   whole bar empty to their right. `flex-basis: 0` is a well-known
   CSS footgun for exactly this reason: it silently severs a flex
   item's content size from its ancestors' intrinsic-size
   calculations. Fix: `flex: 1 1 auto` (basis = the name's own natural
   content width) restores that propagation — at ample width each name
   asks for, and gets, its full natural size (no shrink needed, no
   ellipsis); under narrowing, `flex-shrink: 1` still applies, weighted
   by each name's own basis (its natural width) rather than an
   artificial equal split, so both degrade together — proportionally,
   not first-takes-all — as the mandate requires. `min-width: 0`
   (unchanged) is what still lets each name shrink below its content
   width once genuine narrowing forces it. */
.player-names {
  display: flex;
  align-items: center;
  gap: var(--space-tight);
  flex: 1 1 auto;
  min-width: 32px;
}
/* Ring-occlusion repair (defect (f), live-refuted twice: the padding-
   left band-aid below — commit 87455822, "StatusBar active-turn ring
   no longer clipped" — was witnessed STILL occluded live in both
   to-move states. That fix only opened 3px of headroom on the LEFT
   edge of `.player-name`'s own `overflow: hidden` box, reasoning that
   the ring's top/bottom/right arcs had "vertical line-height slack" to
   bleed into — an assumption, not a measurement, and evidently false:
   `.stone-chip`'s `vertical-align: middle` centers it tightly on the
   text line box, leaving near-zero vertical slack, so the ring's
   top/bottom arcs were STILL clipped by the same `overflow: hidden`
   the left-padding fix never touched. Padding any one edge of a box
   that clips on all four sides was always going to be a partial fix
   at best.

   Root fix: stop clipping the CHIP at all. `.player-name` (this rule)
   no longer carries `overflow: hidden` / `text-overflow: ellipsis`
   itself — those move to the NEW inner `.player-name-text` span
   (below), wrapping ONLY the name text, not the chip. The ring's
   outline (painted outside the chip's own border box) now has no
   clipping ancestor at all, on any edge, at any width.

   This also resolves the earlier "`display: inline-block`, NOT
   `inline-flex`" constraint the prior version of this comment
   documented: THAT constraint was about ellipsis failing to insert
   when applied directly to a flex CONTAINER with multiple flex-item
   children (chip + text runs) — Chromium hard-clips instead. Ellipsis
   here is now applied to `.player-name-text`, a plain inline-block
   LEAF with a single text-node child, never a flex container itself —
   so `.player-name` is free to be `inline-flex` (needed so the chip
   and the text span can independently size: the chip fixed, the text
   span flexing/shrinking with its own ellipsis) without reopening
   that defect. */
.player-name {
  display: inline-flex;
  align-items: center;
  color: var(--text-0);
  font-weight: 600;
  flex: 1 1 auto;
  min-width: 0;
}
.player-name-text {
  display: inline-block;
  min-width: 0;
  flex: 1 1 auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vs-text {
  color: var(--text-0);
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}
/* S4: fixed-content segment (ruleset + komi) — never wraps, never
   shrinks below its own legible size. `.player-names` above is the
   segment that yields when the bar is tight, so this one holds its
   shape instead of being squeezed into the overlap the audit found. */
.game-info    { color: var(--border-3); font-size: var(--text-body); display: flex; align-items: center; gap: var(--space-tight); flex-shrink: 0; white-space: nowrap; }

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
  /* Item 4 / item 1 (mandate addendum): each `.player-name` is a plain
     inline-block, not a flex container (see its own rule's comment —
     ellipsis needs inline flow), so the chip-to-name spacing comes from
     a plain right-margin on the chip rather than `gap`. The name-to-
     "vs" spacing is `.player-names`' own `gap` (it IS a flex row, one
     level up — see that rule's comment) between `.player-name` and
     `.vs-text`. `vertical-align: middle` keeps the circle centered on
     the text's line box in normal inline flow, matching flex
     `align-items: center`'s visual effect without needing to BE flex. */
  vertical-align: middle;
  margin-right: var(--space-tight);
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

/* S4 (component-shoddiness audit, 2026-08-21): a bare `border-bottom:
   dashed` on a 12px-tall unpadded box reads, at zoom, as a rendering
   fault rather than a control — no box, no click affordance beyond
   `cursor: text`, and far below any usable pointer target. A full
   border + padding gives it an honest field outline and a real pointer
   target without departing from the bar's low-contrast register —
   `border-3` is the same token the dashed underline already used.
   status-bar-narrow-0c21: raised from a standalone 20px to the shared
   `--control-height-min` token (theme.css) — the same height
   `.pass-btn`/`ToolbarMoveNav.vue`'s `.toolbar-btn` now read — so every
   control in this row agrees on one floor instead of three
   independently-chosen numbers that happened to be close. */
.komi-input {
  width: 42px;
  min-height: var(--control-height-min);
  box-sizing: border-box;
  background: transparent;
  border: 1px solid var(--border-3);
  border-radius: var(--radius-default);
  color: var(--text-0);
  font-size: var(--text-body);
  font-family: inherit;
  padding: 2px 4px;
  outline: none;
  text-align: center;
}
/* wC-contrast (F9): readable text is --text-0, not accent-primary — 2.08:1 in the default cluster theme. Border stays accent (ornament).
   S4: the border is now a full box (see the base rule above), so the
   focus/hover highlight recolors all four sides, not just the bottom
   edge, to match. */
.komi-input:focus, .komi-input:hover {
  color: var(--text-0);
  border-color: var(--accent-primary);
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
   the lowest-priority segments are removed from flow entirely (not
   just visually hidden) so their claimed width goes back to
   `.pass-btn`/`.caps`/`.player-names`, and `.player-names` — never
   hidden, only truncated — gets a single-line ellipsis instead of the
   wrap that used to grow the bar's own height (and so the board's
   square, which derives its size from the bar's remaining height
   budget — see this file's `min-height` comment). `.move-badge`,
   `.pass-btn` and `.caps` carry NO rule in this block: they are never
   touched by narrow mode, which is what makes "Pass never unreachable"
   a structural property of this stylesheet rather than a threshold
   someone has to keep tuned. (The user badge was a third collapsed
   segment here — `:deep(.user-badge)` — until it relocated to the
   toolbar strip, commissioner ruling 2026-08-21: identity chrome must
   stay visible at every width, not be layout-negotiable board-adjacent
   content that a resize could hide entirely.) */
.status-bar--narrow .move-numbers-btn,
.status-bar--narrow .game-info {
  display: none;
}
/* N1/N4 fix (rig witness, `.claude/dispatch-reports/lyt-n1-statusbar.md`)
   — SUPERSEDED, status-bar-narrow-0c21: the flat 90px `.player-names`
   `max-width` this comment used to document here is REMOVED — it was a
   step function independent of genuine available width (live-witnessed
   re-occluding both names entirely, `.claude/dispatch-reports/
   statusbar-narrow-0c21-build.md`). The replacement mechanism —
   `.status-bar--narrow .transient-hint { flex-grow: 0; }`, freeing the
   room the flat cap used to withhold — is declared alongside the BASE
   `.transient-hint` rule further down this file (not here), a jsdom
   cascade-ordering requirement: jsdom's computed-style resolution was
   witnessed NOT preferring the more-specific narrow-mode selector over
   a same-property base-rule declaration that appears later in source
   (a real browser's specificity-over-order cascade does prefer it
   either way — this is a jsdom-only accommodation, the same family as
   this file's other documented CSSOM quirks). See that rule's own
   comment for the full derivation. */
.status-bar--narrow.status-bar {
  padding: 0 var(--space-tight);
}
.status-bar--narrow .status-left,
.status-bar--narrow .status-right {
  gap: var(--space-tight);
}
/* `:deep()` reaches `ToolbarMoveNav`'s own root/children from this
   scoped stylesheet — this bar owns the overflow policy, the move-nav
   component has no narrow-mode concept of its own. Padding/gap only:
   the |</>| glyphs' own font-size and the 24px pointer-target floor
   (G30, `ToolbarMoveNav.vue`'s own `min-height`/`min-width`) are
   untouched — only the horizontal padding around the already-legible
   glyph, and the gap between the four buttons, shrink. */
.status-bar--narrow :deep(.toolbar-move-nav) {
  gap: 2px;
}
.status-bar--narrow :deep(.toolbar-move-nav .toolbar-btn) {
  padding: 1px 3px;
}
.status-bar--narrow .move-badge {
  padding: 1px 4px;
}
.status-bar--narrow .pass-btn {
  padding: 1px 6px;
}

/* status-bar-narrow-0c21 — the ultra-narrow tier (below ~300px bar
   width, `STATUS_BAR_ULTRA_NARROW_THRESHOLD_PX` in <script>). See that
   constant's own comment for the root cause: below this width, even
   `.player-names` at its bare-chip floor no longer fits beside
   `.status-right` on the SAME line as the nav cluster and move-badge,
   and because `.status-left` is allowed to shrink narrower than its
   own children (`min-width: 0`, S4), the overflow bleeds past
   `.status-left`'s box into `.status-right` — the "chip inside Pass"
   overlap the mandate's second witness shot
   (`~/ys/63a0_gaslighted.png`) shows, live-reproduced at this tier in
   the dispatch report's rig probe.

   Fix: `.status-right` moves to ITS OWN second line instead of
   sharing line 1 at all — two elements on different lines cannot
   overlap regardless of how tight either line's own content is. This
   is the commissioner-ruled shape for this class (status-bar-narrow-
   0c21 ruling): the bar's height is not a fixed cap, it grows to fit
   its content's honest demand once no single-line arrangement can
   avoid overlap, rather than starving `.player-names` further (there
   is no further floor below "bare chips, no name") or letting content
   corrupt Pass. `flex-basis: 100%` deterministically forces
   `.status-right` onto a new flex line (unlike an unscoped top-level
   `flex-wrap: wrap`, which this codebase tried and reverted here — see
   the build report's own §"a top-level flex-wrap was tried and
   reverted" — Chromium's line-breaking pass uses each item's
   HYPOTHETICAL (pre-shrink) main size, and `.status-left`'s is its
   full unclamped natural content width once `.player-names` is
   genuinely uncapped [the very fix this file's `.status-bar--narrow
   .transient-hint` rule above depends on] — large enough that
   `.status-right` was found wrapping prematurely at 900px and even
   1920px bar widths, an unrelated regression an *unscoped* wrap would
   have introduced). Scoping the 100%-basis force to ONLY
   `.status-right`, gated by its own dedicated breakpoint rather than
   the browser's implicit fit decision, avoids that regression
   entirely — confirmed clean at every non-ultra-narrow width tested
   (`.claude/dispatch-reports/statusbar-narrow-0c21-build.md`).
   `.status-bar`'s own `gap` (above) becomes the row-gap between the
   two lines too (the CSS `gap` property is symmetric across both
   flex axes), so the wrapped Pass/caps line never sits flush against
   line 1 either. The extra height this tier costs is a genuine,
   measured demand on the column this bar is mounted in — named as a
   handoff in the dispatch report, not manufactured by this component
   on its own (LytNode/track allocation is outside this file's fence). */
.status-bar--ultra-narrow {
  flex-wrap: wrap;
}
.status-bar--ultra-narrow .status-right {
  flex-basis: 100%;
  order: 3;
  justify-content: flex-end;
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
/* status-bar-narrow-0c21: witnessed rendering 18px tall beside the
   move-nav cluster's 24px-floored buttons (`ToolbarMoveNav.vue`'s
   `.toolbar-btn`, G30/WCAG 2.5.8) — same row, two different control
   heights, plus the mismatch itself forced `.status-bar` taller than
   either control alone needed (align-items: center then split the
   difference as dead space above/below the shorter ones). Reads the
   SAME `--control-height-min` token `.toolbar-btn` reads (theme.css;
   ADR-0012 P1 — one home for the G30 24px floor, not two agreeing
   literals) rather than leaving Pass unfloored; flex-centering matches
   `.toolbar-btn`'s own recipe so the label centers in the taller box
   without touching padding/font-size (the visual language). */
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
  min-height: var(--control-height-min);
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
   unchanged; flex-centering keeps it centred in the taller/wider box.
   status-bar-narrow-0c21: the two `24px` literals now read
   `--control-height-min` (theme.css) — the same anchor `.pass-btn` and
   `ToolbarMoveNav.vue`'s `.toolbar-btn` read, so this row's whole
   control-height floor lives in one place (ADR-0012 P1). */
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
  min-width: var(--control-height-min);
  min-height: var(--control-height-min);
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
/* status-bar-narrow-0c21. Placed HERE, immediately after the base
   `.transient-hint` rule (not up in the `.status-bar--narrow` block
   with its narrow-mode siblings), because jsdom's computed-style
   resolution was witnessed NOT applying CSS specificity-over-order
   correctly for this property: a more-specific narrow-mode selector
   declared BEFORE this base rule in source lost to the base rule's own
   `flex-grow: 1` when read back via `getComputedStyle` in the test
   tier, even though a real browser's cascade (specificity first, order
   only as a tie-break) prefers the more-specific selector regardless
   of which one appears first. Declaring this rule AFTER the base one
   makes it win under BOTH cascade models — the real browser (by
   specificity) and jsdom's test substrate (apparently by source
   order for this case) — rather than trusting jsdom to replicate the
   specificity rule a real browser applies. This is the same family of
   accommodation as this rule's own "longhand, not shorthand" comment
   above.

   N1/N4 fix (rig witness, `.claude/dispatch-reports/
   lyt-n1-statusbar.md`) — SUPERSEDED, status-bar-narrow-0c21. History
   preserved: a flat 90px `.player-names` `max-width` (replacing an
   earlier `40%` that resolved against the wrong basis — Chromium
   resolved it against the BAR's own width, not a "just enough" one)
   closed the N1/N4 overflow class and, per the mandate active at the
   time, gave both names symmetric treatment via `.player-names`' own
   `flex: 1 1 auto` children.

   Live-witnessed AGAIN at 0c21 (`.claude/dispatch-reports/
   statusbar-narrow-0c21-build.md`), the flat cap itself is what
   produced the regression it was meant to prevent: the 90px ceiling is
   a STEP FUNCTION independent of how much room the bar actually has
   the moment `.status-bar--narrow` engages — at a bar width just under
   700px there can be 300+px of genuinely free space, yet the cap still
   allows only 90 of it to `.player-names`, because `.transient-hint`
   (an ephemeral, usually-EMPTY hover-hint slot — see the base rule's
   own comment) keeps its base-rule `flex-grow: 1` and silently absorbs
   every pixel of that free space instead. At the genuinely narrow end
   of the range (rig-probed down to ~290px bar width), `.status-left`'s
   fixed content (nav cluster + move-badge) alone approaches the bar's
   total width, `.transient-hint` collapses to its `flex-basis: 0`
   floor, and `.player-names` — still hard-capped at 90px even though
   there is now no free space ANYWHERE to give it — renders both names
   fully elided (a bare stone chip, no character of either name) while
   the active-turn ring on the last chip visually bleeds into
   `.pass-btn` (closed structurally by `.status-bar`'s own `gap`,
   defense-in-depth — but the starved-names symptom itself needed its
   own fix, not just the overlap).

   Fix: the flat cap is REMOVED. `.player-names` reverts to plain
   `flex: 1 1 auto` (the base rule, unchanged) — genuinely reactive to
   however much room `.status-left` actually has, rather than a ceiling
   that engages the instant `narrow` flips regardless of real
   availability. What makes that room available to names instead of
   the empty hint slot is `.transient-hint`'s OWN narrow-mode demotion
   (this rule): the ephemeral segment steps back below player identity
   in the narrow tier's already-established priority order (game-info
   and move-numbers already fully collapse there; this is the same
   "lowest-priority segments yield first" policy, just extended to a
   segment that previously never yielded because nothing asked it to).
   Both names still degrade together under GENUINE narrowness — that
   symmetric mechanism (`.player-name--black`/`--white`, each
   `flex: 1 1 auto`, sharing `.player-names`' width proportionally) is
   completely unchanged; only the artificial mid-range ceiling is gone. */
.status-bar--narrow .transient-hint {
  /* Demote the hint's claim on the bar's surplus below player
     identity — narrow mode already sheds `.game-info` and
     `.move-numbers-btn` outright; this is the same "yield before
     `.player-names`" ranking applied to a segment that previously had
     no narrow-mode rule at all. `flex-shrink: 1` / `flex-basis: 0`
     (base rule, unchanged) mean this renders at effectively 0px
     whenever there is nothing to show — which is most of the time, an
     ephemeral hover-hint — so the bar's own "byte-for-byte identical
     geometry whether a hint is active or not" invariant (commission
     row 837, this rule's own header comment) still holds: an active
     hint's arrival/departure does not itself move anything, in narrow
     mode either, because this segment's width was already ~0 before
     and after. What DOES change relative to non-narrow mode: an active
     hint's TEXT is effectively invisible here (immediate ellipsis,
     nothing to grow into) — an accepted trade in the tier that already
     hides `.game-info` and `.move-numbers-btn` outright; the hint is
     lower-priority chrome than either. */
  flex-grow: 0;
}
</style>
