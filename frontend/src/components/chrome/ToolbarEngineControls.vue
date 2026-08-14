<!--
  src/components/chrome/ToolbarEngineControls.vue

  M2 stage B2b boot-restoration wiring (`.claude/dispatch-reports/lyt-boot-
  restoration.md`; ledger row 2346; ruling row 2073, "three-vocabulary
  engine-status decomposition"). Extracted from the retired
  `ToolbarEngineCluster.vue`: the connect/disconnect + engine-controls
  button cluster (mint-card / learn-path / play / match) is the fourth of
  the four leaves that ruling's own decomposition needs a home for.
  Mounted at the compiled program's own `A_engine_controls` leaf
  (`lyt-widget-registry.ts`), unconditionally (connect/disconnect must be
  reachable while disconnected, unlike the metrics groups which only
  render once connected). The four leaves share one CSS Grid row
  (`lyt-layout.gen.ts` path "2.0") — LytNode.vue's grid does the row
  layout the retired `ToolbarEngineCluster.vue`'s own flex wrapper used to.

  ── Finish-pass wave B2 (F2 + W-B1's adjacent 420px finding) ──────────
  Realizes `lyt-capability-registry.ts`'s ratified IR: these five
  capabilities are DATA with per-class-point realizations —
  `button-cluster` | `menu-path` | `popover` — and grouping them into a
  single component must not petrify which shape they take. Before this
  wave, this component rendered `button-cluster` UNCONDITIONALLY; F2
  found Connect unreachable at 1280x1024/420x880 because the cluster's
  own wrap need (3+ rows at those narrower columns) exceeds the row's
  compiled `80px` reservation, silently clipped by `.lyt-toolbar-strip`'s
  `overflow-y: auto`. `useEngineControlsRealization` (own header: full
  measurement methodology) now decides, PER LIVE MEASUREMENT of this
  component's own column width and the WORST-CASE label widths its own
  label logic can ever produce, whether the cluster fits; when it
  doesn't, the five capabilities realize as the ratified SMALL-CLASS
  `menu-path` form instead — a compact trigger opening a menu carrying
  all five. No new styling idiom, every button reuses `.toolbar-btn`.
  Every capability stays reachable in EITHER form — the same five
  `emit(...)` calls this component always had, wired from two
  alternative templates instead of one.

  Space-owner cure, dispatch L5 discharge (`.claude/dispatch-reports/
  lyt-space-owner-l5-review.md`; `.claude/dispatch-reports/
  lyt-space-owner-spec.md` §1.5/§3 step 5): this menu's dismissal was
  the one bespoke click/outside-click/Escape survivor the L5 review's
  own grep sweep found — `useClickTogglePopover.ts` (this component's
  sole consumer, generalized from `LocalePicker.vue`/`LytPresenceMenu.vue`'s
  OWN pre-dispatch inline versions, but never itself migrated onto the
  overlay primitive those two were). Dismissal now goes through
  `useDismissiblePopover()` — the same shared composable
  `LytPresenceMenu.vue`/`BoardRailPopoverTrigger.vue`/`LocalePicker.vue`/
  `DebugMenu.vue`/App.vue's control-panel-summon popover already use —
  with `useFixedAnchoredPopover` composed alongside it for the
  fixed-anchor position math, the SAME split `LocalePicker.vue`'s own
  post-L5 shape already established (dismissal and position are two
  independent concerns; `useDismissiblePopover` owns the first,
  `useFixedAnchoredPopover` the second). `useClickTogglePopover.ts` had
  no other consumer (confirmed by a repo-wide grep) and is DELETED, not
  left as a second, now-dead near-duplicate of the primitive.

  ── State-invariance correction (W-B2 review MAJOR finding, 2026-08-13) ──
  The shadow clone (template, below) used to render the SAME reactive
  labels the visible cluster/menu shows, which made the realization
  form a function of engine/match STATE, not just column width — the
  review traced a reachable mid-match form flip at 1920x1080
  (`.claude/dispatch-reports/lyt-wB2-controls-menu-review.md` §1). The
  shadow now renders BOTH label variants for every state-varying button
  (`toolbar.match`/`toolbar.stopMatch`, `toolbar.connect`/
  `toolbar.disconnect`) unconditionally, each tagged `data-slot` so
  `useEngineControlsRealization` can take the wider of the two per slot
  — see that composable's own header for the full mechanism and the
  honestly-stated consequence (1920x1080 now selects `menu-path` even
  at idle, pending a parallel model-side wave widening the column's own
  reservation past the worst-case need).

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, ref, type ComponentPublicInstance } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEngineControls } from '../../composables/useEngineControls';
import { useEngineControlsRealization } from '../../composables/chrome/useEngineControlsRealization';
import { useDismissiblePopover } from '../../composables/chrome/useDismissiblePopover';
import { useFixedAnchoredPopover } from '../../composables/chrome/useFixedAnchoredPopover';

const { t, locale } = useI18n();

const { isConnected } = useEngineControls();

const props = defineProps<{
  // Match-running state from `usePlayMatch.isRunning`. When true the
  // MATCH button switches into STOP MATCH mode and emits the stop event
  // instead of opening the modal.
  isMatchRunning?: boolean;
  // Test-only seam (finish-pass wave B2): forces the realization form,
  // bypassing live measurement — jsdom has no real flex layout, so a
  // test exercising the `menu-path` form's markup has no other
  // deterministic way in. `undefined` (default) means "let
  // `useEngineControlsRealization` decide", byte-identical to every
  // consumer that doesn't know this prop exists.
  forceForm?: 'button-cluster' | 'menu-path';
}>();

const emit = defineEmits<{
  (e: 'toggle-engine'): void;
  (e: 'mint-card'):    void;
  (e: 'open-match'):   void;
  (e: 'stop-match'):   void;
  (e: 'open-play'):    void;
  (e: 'open-learn-path'): void;
}>();

const engineBtnLabel = computed(() => isConnected.value ? t('toolbar.disconnect') : t('toolbar.connect'));

const matchBtnLabel = computed(() => props.isMatchRunning ? t('toolbar.stopMatch') : t('toolbar.match'));
function onMatchClick() {
  if (props.isMatchRunning) emit('stop-match');
  else emit('open-match');
}

// The shadow clone (template, below) renders EVERY label variant its
// own label logic can ever produce, unconditionally — no engine/match
// state feeds it — so the ACTIVE LOCALE alone is what can ever change
// its measured content. See `useEngineControlsRealization`'s own
// header for the full state-invariance rationale.
const labelsKey = computed(() => locale.value);

const { form: measuredForm, setRegionEl, setShadowEl } = useEngineControlsRealization(labelsKey);
const form = computed(() => props.forceForm ?? measuredForm.value);

// Menu-path dismissal (dispatch L5 discharge) + fixed-anchor position —
// two independent composables now, matching `LocalePicker.vue`'s own
// post-L5 split (see this file's own header). `align: 'right'` mirrors
// `ToolbarSliderPopover`/`PboPopover`.
const { open: menuOpen, rootRef: menuRootRef, toggle: toggleMenu, close: closeMenu } = useDismissiblePopover();
const menuTriggerEl = ref<HTMLElement | null>(null);
const menuPopoverEl = ref<HTMLElement | null>(null);
const { style: menuPopoverStyle } = useFixedAnchoredPopover(menuOpen, menuTriggerEl, menuPopoverEl, { align: 'right' });
// Function-ref setters (not plain `ref="menuTriggerEl"`): these refs are
// DESTRUCTURED from the composable's return, and vue-tsc's `noUnusedLocals`
// pass loses template-ref tracking through destructuring — the same gap
// `usePopoverEdgeClamp.ts`'s own header documents and fixes the same way.
function setTriggerEl(el: Element | ComponentPublicInstance | null): void {
  menuTriggerEl.value = el as HTMLElement | null; // DOM: bound only to a plain <button> in this component's template
}
function setMenuPopoverEl(el: Element | ComponentPublicInstance | null): void {
  menuPopoverEl.value = el as HTMLElement | null; // DOM: bound only to a plain <div> in this component's template
}
function onMenuMintCard(): void { emit('mint-card'); closeMenu(); }
function onMenuLearnPath(): void { emit('open-learn-path'); closeMenu(); }
function onMenuPlay(): void { emit('open-play'); closeMenu(); }
function onMenuMatch(): void { onMatchClick(); closeMenu(); }
function onMenuToggleEngine(): void { emit('toggle-engine'); closeMenu(); }

// Single function-ref: this component's root serves TWO independent
// purposes (`useDismissiblePopover`'s own outside-click boundary, and
// the column-width measurement `useEngineControlsRealization` needs) —
// Vue permits only one `ref`/`:ref` binding per element, so both are
// combined here rather than fighting over the template's one ref slot.
function bindRootEl(el: Element | ComponentPublicInstance | null): void {
  menuRootRef.value = el as HTMLElement | null; // DOM: bound only to a plain <div> in this component's template
  setRegionEl(el);
}

const menuId = 'engine-controls-menu';
</script>

<template>
  <div class="engine-controls toolbar-cluster" :ref="bindRootEl">
    <template v-if="form === 'button-cluster'">
      <button class="toolbar-btn highlight-btn" @click="emit('mint-card')">{{ $t('toolbar.mintCard') }}</button>
      <button class="toolbar-btn" @click="emit('open-learn-path')">{{ $t('toolbar.learnPath') }}</button>
      <button class="toolbar-btn" @click="emit('open-play')">{{ $t('toolbar.play') }}</button>
      <button
        class="toolbar-btn"
        :class="{ 'btn-stop-match': isMatchRunning }"
        @click="onMatchClick"
      >{{ matchBtnLabel }}</button>
      <button
        class="toolbar-btn"
        :class="{ 'btn-connected': isConnected }"
        @click="emit('toggle-engine')"
      >{{ engineBtnLabel }}</button>
    </template>

    <template v-else>
      <button
        :ref="setTriggerEl"
        type="button"
        class="toolbar-btn engine-controls-trigger"
        :title="$t('toolbar.engineControlsMenuTooltip')"
        aria-haspopup="true"
        :aria-expanded="menuOpen"
        :aria-controls="menuId"
        @click="toggleMenu"
      >
        <span>{{ $t('toolbar.engineControlsMenu') }}</span>
        <span class="caret" aria-hidden="true">▾</span>
      </button>

      <div
        v-if="menuOpen"
        :id="menuId"
        :ref="setMenuPopoverEl"
        class="engine-controls-menu"
        role="menu"
        :style="{ top: menuPopoverStyle.top, left: menuPopoverStyle.left }"
      >
        <button class="toolbar-btn highlight-btn" role="menuitem" @click="onMenuMintCard">{{ $t('toolbar.mintCard') }}</button>
        <button class="toolbar-btn" role="menuitem" @click="onMenuLearnPath">{{ $t('toolbar.learnPath') }}</button>
        <button class="toolbar-btn" role="menuitem" @click="onMenuPlay">{{ $t('toolbar.play') }}</button>
        <button
          class="toolbar-btn"
          role="menuitem"
          :class="{ 'btn-stop-match': isMatchRunning }"
          @click="onMenuMatch"
        >{{ matchBtnLabel }}</button>
        <button
          class="toolbar-btn"
          role="menuitem"
          :class="{ 'btn-connected': isConnected }"
          @click="onMenuToggleEngine"
        >{{ engineBtnLabel }}</button>
      </div>
    </template>

    <!-- Hidden measurement shadow (finish-pass wave B2, state-invariance
         corrected 2026-08-13): always mounted, off-screen, unconstrained
         width, never wraps. Renders BOTH label variants for every
         state-varying button (match/stop-match, connect/disconnect)
         UNCONDITIONALLY — not the current state's label — each tagged
         `data-slot` naming the visible-cluster slot it stands in for;
         `useEngineControlsRealization` takes the wider measured width
         per slot. Only a locale change (via `labelsKey`) re-measures;
         no engine/match state read appears in this block at all, which
         is what makes the measurement state-invariant by construction.
         Not interactive. -->
    <div class="engine-controls-shadow" aria-hidden="true" :ref="setShadowEl">
      <button class="toolbar-btn highlight-btn" tabindex="-1" data-slot="mint-card">{{ $t('toolbar.mintCard') }}</button>
      <button class="toolbar-btn" tabindex="-1" data-slot="learn-path">{{ $t('toolbar.learnPath') }}</button>
      <button class="toolbar-btn" tabindex="-1" data-slot="play">{{ $t('toolbar.play') }}</button>
      <button class="toolbar-btn" tabindex="-1" data-slot="match">{{ $t('toolbar.match') }}</button>
      <button class="toolbar-btn" tabindex="-1" data-slot="match">{{ $t('toolbar.stopMatch') }}</button>
      <button class="toolbar-btn" tabindex="-1" data-slot="engine">{{ $t('toolbar.connect') }}</button>
      <button class="toolbar-btn" tabindex="-1" data-slot="engine">{{ $t('toolbar.disconnect') }}</button>
    </div>
  </div>
</template>

<style scoped>
/* Verbatim carry-over from the retired ToolbarEngineCluster.vue's own
   rules for this same markup — see that file's git history for the
   pre-split rationale (magic-literal 28px min-height / flex-wrap
   degradation / 24px pointer-target floor). */
.engine-controls { display: flex; flex-wrap: wrap; gap: var(--space-tight); flex-shrink: 1; min-width: 0; min-height: 28px; align-items: center; position: relative; }
.toolbar-cluster { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-tight); flex-shrink: 1; min-width: 0; }
.toolbar-btn { background: var(--surface-0); border: 1px solid var(--border-3); color: var(--text-0); padding: 1px 5px; font-size: var(--text-emphasis); cursor: pointer; border-radius: var(--radius-default); font-family: 'Courier New', monospace; text-transform: uppercase; letter-spacing: var(--tracking-tight); min-height: 24px; display: inline-flex; align-items: center; justify-content: center; }
.btn-connected { border-color: var(--state-success) !important; color: var(--state-success) !important; }
.btn-stop-match { border-color: var(--state-attention) !important; color: var(--state-attention) !important; }
/* wC-contrast (F9): label text is --text-0, not accent-primary — 2.08:1 in the default cluster theme. Border stays theme-exception ornament. */
.highlight-btn { border-color: #2a5a7a; color: var(--text-0); }

/* Finish-pass wave B2: menu trigger + menu, reusing `.toolbar-btn`'s
   own visual register (no new styling idiom) — the caret follows
   `LocalePicker.vue`'s `.locale-trigger .caret` idiom verbatim. */
.engine-controls-trigger { gap: var(--space-tight); }
.engine-controls-trigger .caret { color: var(--text-disabled); font-size: var(--text-tiny); margin-left: 1px; }

/* `position: fixed` (`useFixedAnchoredPopover`, composed directly —
   see this file's own header, "Space-owner cure, dispatch L5
   discharge"): escapes `.lyt-toolbar-strip`'s `overflow-y: auto` clip
   — the exact class of defect F2 names, which this menu-path
   realization exists to foreclose, not reintroduce. */
.engine-controls-menu {
  position: fixed;
  display: flex;
  flex-direction: column;
  gap: var(--space-tight);
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  padding: var(--space-default);
  min-width: 160px;
  z-index: var(--z-popover-chrome); /* W4 item 3: shared toolbar/corner-chrome popover tier — see theme.css's own doc comment on the token */
}
.engine-controls-menu .toolbar-btn { justify-content: flex-start; width: 100%; }

/* Measurement shadow: off-screen, unconstrained width, single line
   (`flex-wrap: nowrap`) so children's `getBoundingClientRect()` always
   reports each button's true natural width — see
   `useEngineControlsRealization`'s header. */
.engine-controls-shadow {
  position: fixed;
  top: -9999px;
  left: -9999px;
  visibility: hidden;
  pointer-events: none;
  display: flex;
  flex-wrap: nowrap;
  gap: var(--space-tight);
  width: max-content;
}
</style>
