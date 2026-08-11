<!--
  src/components/chrome/Toolbar.vue
  Purely presentational application toolbar.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PboPopover from '../qeubo/PboPopover.vue';
import ToolbarEngineMetrics from './ToolbarEngineMetrics.vue';
import ToolbarEngineUri from './ToolbarEngineUri.vue';
import ToolbarSliderPopover from './ToolbarSliderPopover.vue';
import ToolbarMoveNav from './ToolbarMoveNav.vue';
import SetupToolPalette from './SetupToolPalette.vue';
import { useEngineControls } from '../../composables/useEngineControls';

const { t } = useI18n();

// RB-1 (App-decouple from engine metrics —
// docs/notes/perf-audit-range-query-nav-2026-05-29.md): status/metrics are
// self-sourced via useEngineControls (store-backed computeds) rather than
// received as props. The live PPS / latency / winrate / scoreLead / watchdog
// telemetry — the per-packet/per-tick reads — now lives in the
// <ToolbarEngineMetrics> leaf below, so this Toolbar reads only `isConnected`
// (low-frequency) and no longer re-renders per packet during analysis.
const { isConnected } = useEngineControls();

// Dev-only affordances (Clear Cache, Auto-Nav Perf, Popover Stress) moved
// OFF this main surface, W4 item 5 (roadmap §7 resolution 4: "debug
// widgets = the portrait mockup's menu shape, debug builds only") — see
// `DebugMenu.vue` (mounted in App.vue's corner chrome cluster), which now
// owns `clearCache`/`useAutoNavigatePerf`/`useAutoPopoverPerf` directly.

const props = defineProps<{
  title?:       string;
  // Match-running state from `usePlayMatch.isRunning`. When true the
  // MATCH button switches into STOP MATCH mode and emits the stop
  // event instead of opening the modal. Defaults to `false` so
  // existing call sites that don't pass the prop keep the static
  // MATCH-opens-modal behaviour.
  isMatchRunning?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-engine'): void;
  (e: 'mint-card'):    void;
  (e: 'open-match'):   void;
  (e: 'stop-match'):   void;
  (e: 'open-play'):    void;
  (e: 'open-learn-path'): void;
}>();

// isConnected is destructured from useEngineControls() above (RB-1).
// Symmetric verb pairing with the disconnected label; the connected
// branch previously read 'Engine', which left the action ambiguous.
const engineBtnLabel = computed(() => isConnected.value ? t('toolbar.disconnect') : t('toolbar.connect'));

// Single state-driven button: MATCH opens the modal when idle, STOP
// MATCH cancels the cooperative-stop signal when a match is running.
// Two roles on one chrome slot keeps the toolbar compact and avoids
// surfacing a stop button that never fires for users who don't use
// engine matches.
const matchBtnLabel = computed(() => props.isMatchRunning ? t('toolbar.stopMatch') : t('toolbar.match'));
function onMatchClick() {
  if (props.isMatchRunning) emit('stop-match');
  else emit('open-match');
}
</script>

<template>
  <div class="toolbar">
    <!-- Toolbar clustering (Phase 3 + S7 rider, resolution roadmap,
         audit finding R4): the toolbar's direct flex children used to
         be SEVEN individual items under `justify-content:
         space-between` — at 4K that spread ~690px between adjacent
         buttons that read as one group (e.g. the engine-controls
         action row). Genre convention (Sabaki/KaTrain/Lizzie): buttons
         anchor as GROUPED CLUSTERS, and surplus space lands OUTSIDE
         the groups, between them — not inside a group, between two
         buttons that belong together. `.toolbar` keeps its existing
         `justify-content: space-between`; wrapping the items below
         into `.toolbar-cluster`s (a handful, not seven) makes that
         same CSS rule distribute space between CLUSTERS instead of
         between individual buttons, with no other CSS change needed. -->
    <div class="toolbar-cluster">
      <!-- The toolbar-title element is preserved as a layout slot
           (it participates in the toolbar's flex layout); the text
           binding is opt-in via the `title` prop. No caller passes
           it today; the element renders empty by default. -->
      <span class="toolbar-title">{{ title }}</span>

      <!-- The engine WebSocket URI — address-bar-like, click-to-edit.
           Views and edits the same store cell as the Settings tab's
           Advanced Registry editor (ADR-0012). Renders unconditionally
           (unlike ToolbarEngineMetrics below) so it's usable to fix a
           bad URI while disconnected, which is precisely the case
           where it's most needed. -->
      <ToolbarEngineUri />
    </div>

    <div class="toolbar-cluster">
      <!-- Live engine telemetry (version / model / winrate / scoreLead / PPS /
           latency / watchdog / queue). Extracted to its own leaf so its
           per-packet / per-tick reads re-render only it, not the whole toolbar
           (render-coupling fix — see ToolbarEngineMetrics.vue). Mounted only
           while connected; the `v-if` is the sole engine-state read left in
           this Toolbar's render. -->
      <ToolbarEngineMetrics v-if="isConnected" />

      <!-- Knob registry quick-access — hover the badge to drop down a
           compact, priority-ordered list of every scalar knob in the
           registry. Sits visually adjacent to the engine-metrics row
           (PPS, LATENCY, WATCHDOG, QUEUE) when connected, but the badge
           itself is substrate-driven (ADR-0003 band 1) and renders
           unconditionally — preferences like ownership opacity and hue
           offset have nothing to do with engine reachability. Mounting
           INSIDE the v-if="isConnected" wrapper above was the PR #225
           band/chrome-neighbourhood mismatch; see
           `docs/notes/postmortem-knob-toolbar-popover-2026-05.md` for
           the discipline this placement preserves. -->
      <ToolbarSliderPopover />

      <!-- PBO (preference-based Bayesian optimisation) calibration
           popover. Self-gating on `calibrationEnabled &&
           experimentExists` — feature constraint, not an inherited
           engine-lifecycle gate (see
           `docs/notes/postmortem-knob-toolbar-popover-2026-05.md`
           for the band-coherence discipline). Sits between metrics
           and engine controls so it shares horizontal space with
           engine telemetry without competing for the title region.
           The user-facing name is PBO; code identifiers and the
           backend's `/qeubo/*` routes retain `qeubo` (the
           acquisition function / library name). -->
      <PboPopover />

      <!-- Setup toolkit (ledger rows 603/604): the classic Go-editor
           setup mode — click to open a small tool palette (BLACK/WHITE
           setup stone, TRIANGLE mark), click again to close. Renders
           unconditionally, same band-1 reasoning as ToolbarSliderPopover
           above: setup edits don't require an engine connection. -->
      <SetupToolPalette />
    </div>

    <!-- S7 rider (commissioner-adjudicated, riding on this phase):
         genre-standard move-navigation cluster (|< < > >|), wired to
         the SAME useNavigation() actions the existing Home/ArrowUp/
         ArrowDown/End keybindings already dispatch — see
         ToolbarMoveNav.vue. -->
    <ToolbarMoveNav />

    <div class="engine-controls toolbar-cluster">
      <button class="toolbar-btn highlight-btn" @click="emit('mint-card')">{{ $t('toolbar.mintCard') }}</button>
      <!-- "Learn this path" (wiki #8) — opens LearnPathModal. Works
           from ANY board position (commission row 832): the anchor is
           resolved from the current cursor — an existing card at this
           position, else a freshly minted one (useLearnPath.ts's
           resolveAnchor). Every board state is a valid click target;
           the modal reports its own errors (bad depth/tag, no board)
           rather than this button disabling ahead of time. -->
      <button class="toolbar-btn" @click="emit('open-learn-path')">{{ $t('toolbar.learnPath') }}</button>
      <!-- PLAY opens the manage-games-on-this-board modal. Single
           surface for both "start new game vs engine" and "end an
           existing game" — see `PlayEngineModal.vue` for the
           shape. Sibling to MATCH (engine-vs-engine self-play)
           and intentionally adjacent so the two engine-driven
           game affordances are visually grouped. -->
      <button class="toolbar-btn" @click="emit('open-play')">{{ $t('toolbar.play') }}</button>
      <button
        class="toolbar-btn"
        :class="{ 'btn-stop-match': isMatchRunning }"
        @click="onMatchClick"
      >{{ matchBtnLabel }}</button>
      <!-- Dev-only Clear Cache / Auto-Nav Perf / Popover Stress buttons
           — REMOVED from this surface, W4 item 5. See DebugMenu.vue. -->
      <button
        class="toolbar-btn"
        :class="{ 'btn-connected': isConnected }"
        @click="emit('toggle-engine')"
      >{{ engineBtnLabel }}</button>
    </div>
  </div>
</template>

<style scoped>
/* magic-literal: 28px `.toolbar` min-height. The toolbar renders
   one row of metric badges + engine-controls at the project author's
   text-emphasis font (~13px). 28 leaves the badges room for their
   ~1px vertical padding plus the line-box without crowding the
   border-bottom. Composes with `.top-nav-bar`'s 32px (parent in
   App.vue) — the 4px gap is implicit centring room inside the parent.
   `min-height` (not `height`) + `flex-wrap: wrap` (iter-13, audit
   Finding G): at narrow viewports the metric cluster previously got
   crushed while `engine-identity` / `engine-controls` (both
   flex-shrink: 0) kept their full width — labels became unreadable,
   CONNECT clipped off the right edge. Wrapping lets the toolbar
   grow vertically instead. `justify-content: space-between` still
   spreads items within each wrapped row. */
.toolbar { min-height: 28px; background: var(--surface-0); display: flex; flex-wrap: wrap; align-items: center; padding: 0 var(--space-default); gap: var(--space-default); justify-content: space-between; border-bottom: 1px solid var(--surface-1); flex-shrink: 0; }
.toolbar-title { font-size: var(--text-body); color: var(--text-0); text-transform: uppercase; letter-spacing: var(--tracking-default); white-space: nowrap; }
/* R4's grouping unit — see the template's own comment (top of the
   toolbar-cluster wrapping) for the "surplus OUTSIDE the groups"
   argument this implements. `.engine-controls` already had this exact
   shape (kept as its own class name too — nothing else in the app
   selects `.toolbar-cluster` specifically for it). */
.toolbar-cluster { display: flex; align-items: center; gap: var(--space-tight); flex-shrink: 0; }
.engine-controls { display: flex; gap: var(--space-tight); flex-shrink: 0; }
/* magic-literal: .toolbar-btn padding `1px 5px` — toolbar buttons are
   visually-compact one-line action triggers; tighter than the substrate's
   --space-tight (4px) on both axes for the dense top-toolbar's aesthetic.
   G30 (WCAG 2.5.8): witnessed at 18px tall (widths 20-106px) — under the
   24x24 pointer-target floor. min-height is a floor only (padding/border/
   font-size, i.e. the visual language, are untouched); flex-centering
   keeps single-line button text centred in the taller box. Mirrored in
   ToolbarMoveNav.vue's copy of this same rule — Vue scoped styles don't
   cross the SFC boundary (see that file's own duplication note). */
.toolbar-btn { background: var(--surface-0); border: 1px solid var(--border-3); color: var(--text-0); padding: 1px 5px; font-size: var(--text-emphasis); cursor: pointer; border-radius: var(--radius-default); font-family: 'Courier New', monospace; text-transform: uppercase; letter-spacing: var(--tracking-tight); min-height: 24px; display: inline-flex; align-items: center; justify-content: center; }
.btn-connected { border-color: var(--state-success) !important; color: var(--state-success) !important; }
/* Match-running attention border on the same slot the MATCH button
   normally occupies. Reuses the existing attention substrate so the
   colour reads as "this button does something interruptive" without
   adding a new theme exception. */
.btn-stop-match { border-color: var(--state-attention) !important; color: var(--state-attention) !important; }
/* theme-exception: .highlight-btn uses muted-cyan border (#2a5a7a)
   — same muted-action-button pattern as QeuboToolbar's .apply-btn.
   Hover-state literal retired with the no-mouseover-change sweep. */
.highlight-btn { border-color: #2a5a7a; color: var(--accent-primary); }
</style>
