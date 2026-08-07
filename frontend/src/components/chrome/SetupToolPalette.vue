<!--
  src/components/chrome/SetupToolPalette.vue

  Toolbar surface for the setup toolkit (ledger rows 603/604): a
  toolbar button that CLICKS open a small tool palette — it looks like
  the app's other toolbar popovers (`ToolbarSliderPopover`,
  `PboPopover`) but is deliberately NOT hover-driven. Click opens,
  click again closes; closing (this way, ESC, or an outside click)
  auto-deselects any armed tool and returns the board to normal-click
  (play/navigate) behaviour — `useSetupTools.closePalette` is the one
  place that contract lives, so it cannot drift between the three
  dismiss paths.

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

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useSetupTools, type SetupTool } from '../../composables/board/useSetupTools';
import { useHandicap } from '../../composables/board/useHandicap';
import HandicapPanel from './HandicapPanel.vue';

const { activeTool, paletteOpen, selectTool, togglePalette, closePalette } = useSetupTools();
const { panelOpen: handicapPanelOpen, togglePanel: toggleHandicapPanel, closePanel: closeHandicapPanel } = useHandicap();

const rootRef = ref<HTMLElement | null>(null);

// Outside-click dismiss, same shape as LocalePicker.vue: `pointerdown`
// in the capture phase so this fires before an in-palette click
// handler, and only installed while open (zero-listener steady state,
// the resource-ownership convention `frontend/CLAUDE.md` names).
function onDocumentPointerDown(e: PointerEvent): void {
  if (!rootRef.value) return;
  if (rootRef.value.contains(e.target as Node)) return; // DOM: event.target is EventTarget; Node is contains()'s arg type
  closePalette();
}

function onKeydown(e: KeyboardEvent): void {
  // The palette is NOT a modal (it doesn't gate on / register with
  // `anyModalOpen` — `useModalKeyboard.ts`'s ESC-priority stack is for
  // actual modal dialogs); ESC here is a plain local dismiss, scoped
  // to this component's own open state via the listener lifecycle
  // below, same as LocalePicker.vue.
  if (e.key === 'Escape') closePalette();
}

watch(paletteOpen, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('keydown', onKeydown);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
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
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onKeydown);
});

const TOOLS: ReadonlyArray<{ id: SetupTool; labelKey: string; swatch: 'black' | 'white' | 'triangle' }> = [
  { id: 'stone-black', labelKey: 'toolbar.setupToolkit.stoneBlack', swatch: 'black' },
  { id: 'stone-white', labelKey: 'toolbar.setupToolkit.stoneWhite', swatch: 'white' },
  { id: 'triangle',    labelKey: 'toolbar.setupToolkit.triangle',   swatch: 'triangle' },
];
</script>

<template>
  <div ref="rootRef" class="setup-toolkit" :class="{ open: paletteOpen }">
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
.setup-toolkit { position: relative; display: flex; align-items: center; }

/* Matches Toolbar.vue's `.toolbar-btn` look (styles can't cross the
   scoped-CSS boundary between SFCs, so this mirrors rather than
   reuses that class — same duplication ToolbarSliderPopover's
   `.sliders-metric` already accepts for the same reason). */
.setup-trigger {
  background: var(--surface-0);
  border: 1px solid var(--border-3);
  color: var(--text-1);
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
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--surface-0);
  border: 1px solid var(--border-3);
  border-radius: var(--radius-default);
  padding: var(--space-default);
  min-width: 180px;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
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
  color: var(--text-1);
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
  color: var(--text-1);
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
