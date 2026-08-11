<!--
  src/components/chrome/ToolbarAppCluster.vue

  LYT toolbar ontology reencode (commissioner-ratified 2026-08-11, ledger
  rows 1930/1931, item 3 "ONE APP CLUSTER"). Extracted from the former
  Toolbar.vue: Load/Save SGF, the sliders/setup/PBO popover triggers, and
  the remaining application-scoped chrome (the engine WebSocket URI editor,
  the locale picker) form the second cluster — mounted into the `.lyt`
  encoding's own `A_app` leaf, structurally independent of engine
  connection state (no widget here reads `useEngineControls` at all, which
  is the audit ToolbarEngineCluster.vue's own header cites).

  Self-contained (ADR-0010 read-locality applied to actions, not just
  reads): SGF load/save and the locale picker were previously wired
  through App.vue-local composable calls threaded into the template.
  Every dependency here (`useSgfLoader`, `useSgfDownload`,
  ToolbarEngineUri/ToolbarSliderPopover/PboPopover/SetupToolPalette/
  LocalePicker) is itself a self-sourcing composable or a self-contained
  component with no external props, so this cluster owns its own wiring
  rather than App.vue threading it through — one fewer place App.vue's
  template has to duplicate per screen class (this cluster mounts
  identically at both `#leaf-A_app` (landscape) and portrait's own A_app
  leaf, replacing the prior duplicated `.lyt-toolbar-strip` block).

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import ToolbarEngineUri from './ToolbarEngineUri.vue';
import ToolbarSliderPopover from './ToolbarSliderPopover.vue';
import PboPopover from '../qeubo/PboPopover.vue';
import SetupToolPalette from './SetupToolPalette.vue';
import LocalePicker from './LocalePicker.vue';
import { useSgfLoader } from '../../composables/sgf/useSgfLoader';
import { useSgfDownload } from '../../composables/sgf/useSgfDownload';

const { openFileDialog } = useSgfLoader();
const { downloadActiveBoard } = useSgfDownload();
</script>

<template>
  <div class="app-cluster">
    <div class="toolbar-cluster">
      <button class="toolbar-btn lyt-sgf-btn" @click="openFileDialog">{{ $t('sidebar.loadSgf') }}</button>
      <button class="toolbar-btn lyt-sgf-btn" @click="downloadActiveBoard">{{ $t('sidebar.saveSgf') }}</button>
      <!-- The engine WebSocket URI — address-bar-like, click-to-edit.
           Application config, not an engine-state-conditional control:
           renders unconditionally so it's usable to fix a bad URI while
           disconnected, which is precisely the case where it's most
           needed (carried over from the pre-split Toolbar.vue's own
           rationale, unchanged). -->
      <ToolbarEngineUri />
    </div>
    <div class="toolbar-cluster">
      <ToolbarSliderPopover />
      <PboPopover />
      <SetupToolPalette />
    </div>
    <LocalePicker />
  </div>
</template>

<style scoped>
/* magic-literal: 28px min-height — same rationale as the pre-split
   Toolbar.vue's own `.toolbar` rule. `flex-wrap` degrades onto a second
   row at narrow widths (same mechanism the W1 REPAIR pass's measured
   sweep relies on) rather than clipping. */
.app-cluster { min-height: 28px; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-default); min-width: 0; }
/* See ToolbarEngineCluster.vue's own comment on this same rule shape —
   wrap+shrink authored directly here rather than via an external
   App.vue override, since this component only ever mounts in the
   narrow side-column context. */
.toolbar-cluster { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-tight); flex-shrink: 1; min-width: 0; }
/* magic-literal: .toolbar-btn padding `1px 5px` — verbatim carry-over
   from Toolbar.vue's own rule. G30 (WCAG 2.5.8): 24px min-height
   pointer-target floor. */
.toolbar-btn { background: var(--surface-0); border: 1px solid var(--border-3); color: var(--text-0); padding: 1px 5px; font-size: var(--text-emphasis); cursor: pointer; border-radius: var(--radius-default); font-family: 'Courier New', monospace; text-transform: uppercase; letter-spacing: var(--tracking-tight); min-height: 24px; display: inline-flex; align-items: center; justify-content: center; }
</style>
