<!--
  src/components/chrome/SetupToolPalette.vue

  Toolbar surface for the setup toolkit (ledger rows 603/604): a
  toolbar button that CLICKS open a small tool palette — it looks like
  the app's other toolbar popovers (`ToolbarSliderPopover`,
  `PboPopover`) but is deliberately NOT hover-driven. Click opens,
  click again closes; closing (this way or ESC) auto-deselects any
  armed tool and returns the board to normal-click (play/navigate)
  behaviour — `useSetupTools.closePalette` is the one place that
  contract lives, so it cannot drift between the two dismiss paths.

  STICKY MODE (setup-tool-sticky-mode, commission row 914; ADR-0019):
  a selected setup tool is a genre-standard sticky mode — cgoban/q5go
  precedent — that persists until the user EXPLICITLY ends it. There
  is deliberately no outside-click dismiss: an earlier revision had a
  document-level `pointerdown` listener that treated any click outside
  the palette's own DOM (a tree node, a panel button, anywhere but the
  board) as "dismiss", which violated ADR-0019 (only cgoban/q5go's own
  chrome, never a document-wide catch-all, gates a setup tool) and
  required a `data-setup-tool-surface` exemption marker on
  `BoardWidget.vue` just to keep the board itself from being treated
  as "outside". Both are removed. The only ends of the mode now are:
  re-clicking the armed tool's own button (toggle-off, `selectTool`),
  picking a different tool (switch, `selectTool`), closing the palette
  via its own toolbar button (`togglePalette`), and Escape while no
  modal has priority (`onKeydown` below, gated on `anyModalOpen` so a
  modal's own Escape-to-close always wins over this palette's).

  Genre precedent for the click-toggle (not hover) interaction:
  `LocalePicker.vue` — same open/toggle/outside-click/ESC shape, not
  re-abstracted into a shared composable here because two instances
  don't cross this codebase's own extraction threshold (see
  `useHoverPopover.ts`'s header: extraction fired at the THIRD
  instance).

  Skeleton scope, deliberately (maintainer ruling, ledger rows
  603/604): three tools (BLACK / WHITE setup stone, TRIANGLE mark).
  The `.tool-grid`'s layout (a wrapping flex row of uniform tool
  buttons) and `SetupTool`'s union type are where a future eraser /
  square / circle / label tool adds a case — named here as the visible
  seam, not built.

  Placement, SUPERSEDED (stable-activation, commission rows 1556/1559,
  finding G6): the in-flow docked panel this comment previously
  specified ("`.setup-toolkit` stacks its trigger and panel in a
  column ... opening it grows the toolbar's own row height") IS the
  "activating a control displaces that control" class defect the
  current commission fixes — WITNESSED by the independent geometry
  consult (`.claude/dispatch-reports/opus-uiux-geometry-consult.md`,
  finding G6): one click on `.setup-trigger` grew `.top-nav-bar`
  32→93px, pushed `#split-workspace` down 30px, and moved the trigger
  itself 81px left, out from under the pointer. The in-flow growth
  this file previously defended (against an EARLIER occlusion defect,
  commission row 756) was itself the root cause of a worse one.

  Current placement: `.setup-palette` is `position: absolute`,
  anchored under `.setup-trigger` — the SAME idiom this codebase
  already uses for `ToolbarSliderPopover.vue`'s `.sliders-popover` and
  `LocalePicker.vue`'s `.locale-menu` (both `position: absolute; top:
  100%`, opaque `--surface-0` background, no backdrop, genre-precedent
  q5go/cgoban toolstrip popovers). Being out of flow, it adds no
  height or width to `.toolbar`'s own layout — neither the trigger nor
  any toolbar sibling moves when it opens or closes (the rect-
  stability property this commission requires). It stays OPAQUE, never
  a transparent overlay — that standing rule is unchanged; only the
  reflow-avoidance strategy is. It CAN sit over the top-left corner of
  `#board-column` while open, same as any anchored toolbar popover in
  this app overlapping whatever renders beneath it — accepted here
  because the alternative (in-flow growth) demonstrably broke a worse
  property (control identity under activation) to avoid it. Rejected
  for THIS defect: (a) keep the in-flow column layout but permanently
  reserve a fixed two-row `.toolbar` height so opening never changes
  it — sound in principle, but pays a constant strip of dead vertical
  space on every load to host a rarely-open panel, for no benefit the
  anchored popover doesn't already give; (b) dock the panel beside
  `#board-column` itself (App.vue) — correct in spirit but couples
  this leaf's open/closed state into the App-level layout grid for no
  gain the anchored popover doesn't already give; (c) a modal/backdrop
  dialog — still wrong genre (a modal blocks the very board clicks the
  tool exists to receive) and still excluded by the no-transparent-
  overlay rule if it used a scrim.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { useSetupTools, SETUP_TOOL_LABEL_KEYS, type SetupTool } from '../../composables/board/useSetupTools';
import { useHandicap } from '../../composables/board/useHandicap';
import { anyModalOpen } from '../../composables/useModalKeyboard';
import HandicapPanel from './HandicapPanel.vue';

const { activeTool, paletteOpen, selectTool, togglePalette, closePalette } = useSetupTools();
const { panelOpen: handicapPanelOpen, togglePanel: toggleHandicapPanel, closePanel: closeHandicapPanel } = useHandicap();

// ESC dismiss ONLY — see the header's STICKY MODE note for why there
// is no outside-click dismiss. The palette is NOT a modal (it doesn't
// register with `useModalKeyboard`'s open-count/focus-trap machinery
// — that composable's Escape-priority stack is for actual modal
// dialogs); this is a plain local Escape handler, scoped to this
// component's own open state via the listener lifecycle below, same
// as LocalePicker.vue. Gated on `anyModalOpen` so a modal opened on
// top of an armed setup tool (e.g. from a board action) keeps its own
// Escape-to-close priority: the modal closes, the tool stays armed —
// both listeners are on the bubble path for the same keydown
// (this one on `document`, `useModalKeyboard`'s on `window`, which
// document precedes), so without this guard an Escape meant for the
// modal would also silently disarm the tool underneath it.
function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  if (anyModalOpen.value) return;
  closePalette();
}

watch(paletteOpen, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onKeydown);
  } else {
    document.removeEventListener('keydown', onKeydown);
    // The handicap sub-panel has no dismiss listeners of its own (it
    // rides the parent palette's — see this component's header); it
    // must still not stay expanded into the NEXT time the palette
    // opens, so closing the palette by any path closes it too.
    closeHandicapPanel();
  }
});

// Defensive cleanup if the component unmounts while open (parent
// re-key, full app teardown) — same precedent as LocalePicker.vue.
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
});

// Review remedy (ledger row 1335): labelKey previously re-literalled the
// same three i18n keys SETUP_TOOL_LABEL_KEYS (useSetupTools.ts) already
// names — a duplicate that could silently drift from the chip
// StatusBar.vue derives from that shared map. Reading the map here
// instead makes this the map's only other reader, so the two surfaces
// cannot disagree on a tool's label.
const TOOLS: ReadonlyArray<{ id: SetupTool; labelKey: string; swatch: 'black' | 'white' | 'triangle' }> = [
  { id: 'stone-black', labelKey: SETUP_TOOL_LABEL_KEYS['stone-black'], swatch: 'black' },
  { id: 'stone-white', labelKey: SETUP_TOOL_LABEL_KEYS['stone-white'], swatch: 'white' },
  { id: 'triangle',    labelKey: SETUP_TOOL_LABEL_KEYS['triangle'],    swatch: 'triangle' },
];
</script>

<template>
  <div class="setup-toolkit" :class="{ open: paletteOpen }">
    <button
      type="button"
      class="setup-trigger"
      :class="{ 'tool-armed': activeTool !== null }"
      :title="$t('toolbar.setupToolkit.tooltip')"
      :aria-haspopup="true"
      :aria-expanded="paletteOpen"
      @click="togglePalette"
    >{{ $t('toolbar.setupToolkit.button') }}</button>

    <div v-if="paletteOpen" class="setup-palette" role="tooltip">
      <!-- .tool-grid: a wrapping row of uniform tool buttons — the
           layout a future eraser/square/circle/label tool extends by
           adding another button here, no restructuring. -->
      <div class="tool-grid">
        <button
          v-for="tool in TOOLS"
          :key="tool.id"
          type="button"
          class="tool-btn"
          :class="{ active: activeTool === tool.id }"
          :aria-pressed="activeTool === tool.id"
          @click="selectTool(tool.id)"
        >
          <span class="swatch" :class="tool.swatch" aria-hidden="true" />
          <span class="tool-label">{{ $t(tool.labelKey) }}</span>
        </button>
      </div>

      <!-- Handicap trigger row: a second click-toggle nested inside the
           already-open palette (ADR-0019: click, never hover). Kept as
           its own row rather than folded into `.tool-grid` — a
           handicap pick is a one-shot "set the board up" action, not a
           toggleable tool the board-click handler arms. -->
      <button
        type="button"
        class="handicap-trigger"
        :class="{ active: handicapPanelOpen }"
        :title="$t('toolbar.setupToolkit.handicapTooltip')"
        :aria-expanded="handicapPanelOpen"
        @click="toggleHandicapPanel"
      >{{ $t('toolbar.setupToolkit.handicapButton') }}</button>
      <HandicapPanel v-if="handicapPanelOpen" />
    </div>
  </div>
</template>

<style scoped>
/* Anchor for the absolutely-positioned `.setup-palette` below — see
   the header's "Placement" note (stable-activation, G6). The trigger
   is the toolkit's only in-flow child now; the palette floats off it
   and never affects this element's own box size. */
.setup-toolkit { position: relative; display: flex; align-items: center; }

/* Matches Toolbar.vue's `.toolbar-btn` look (styles can't cross the
   scoped-CSS boundary between SFCs, so this mirrors rather than
   reuses that class — same duplication ToolbarSliderPopover's
   `.sliders-metric` already accepts for the same reason). */
.setup-trigger {
  background: var(--surface-0);
  border: 1px solid var(--border-3);
  color: var(--text-0);
  padding: 1px 5px;
  font-size: var(--text-emphasis);
  cursor: pointer;
  border-radius: var(--radius-default);
  font-family: 'Courier New', monospace;
  text-transform: uppercase;
  letter-spacing: var(--tracking-tight);
}
.setup-toolkit.open .setup-trigger,
.setup-trigger.tool-armed {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.setup-palette {
  /* Anchored popover, out of flow (see the header's "Placement"
     note, stable-activation G6) — matches `ToolbarSliderPopover.vue`'s
     `.sliders-popover` / `LocalePicker.vue`'s `.locale-menu` exactly:
     `position: absolute; top: 100%`, opaque background, no backdrop.
     Adds no height or width to `.setup-toolkit`'s own box, so opening
     it cannot move the trigger or any toolbar sibling. */
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--surface-0);
  border: 1px solid var(--border-3);
  border-radius: var(--radius-default);
  padding: var(--space-default);
  min-width: 180px;
  z-index: 1000;
}

.tool-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-tight);
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: var(--space-tight);
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  color: var(--text-0);
  padding: var(--space-tight) var(--space-default);
  cursor: pointer;
  border-radius: var(--radius-default);
  font-size: var(--text-emphasis);
}
.tool-btn:hover { border-color: var(--border-3); color: var(--text-0); }
.tool-btn.active { border-color: var(--accent-primary); color: var(--accent-primary); }

.handicap-trigger {
  margin-top: var(--space-tight);
  width: 100%;
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  color: var(--text-0);
  padding: var(--space-tight) var(--space-default);
  cursor: pointer;
  border-radius: var(--radius-default);
  font-size: var(--text-emphasis);
  text-align: left;
}
.handicap-trigger:hover { border-color: var(--border-3); color: var(--text-0); }
.handicap-trigger.active { border-color: var(--accent-primary); color: var(--accent-primary); }

.swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}
.swatch.black { background: #111; border: 1px solid #000; }
.swatch.white { background: #fff; border: 1px solid #aaa; }
.swatch.triangle {
  width: 0;
  height: 0;
  border-radius: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 11px solid var(--state-attention);
}
</style>
