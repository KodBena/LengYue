<!--
  src/components/chrome/ToolbarMoveNav.vue

  Phase 3 + S7 rider (resolution roadmap, commissioner-adjudicated,
  ledger rows 929/926) — the genre-standard move-navigation cluster
  (Sabaki/KaTrain/Lizzie: |< < > >|) toolbar convention was entirely
  absent; keyboard shortcuts (Home/ArrowUp/ArrowDown/End,
  `keybindings-catalog.ts`) existed with no visible on-screen
  affordance. Wired to the EXACT SAME `useNavigation()` actions the
  shortcuts already dispatch (`nav.home` / `nav.prev` / `nav.next` /
  `nav.end`) — no new navigation logic, this is chrome only.

  Disabled state: `canGoPrev`/`canGoNext` (`useNavigation.ts`) read the
  active board's CURRENT node the same way `navigateNext`/`navigatePrev`
  themselves do (`engine/navigator.ts`), so a game-start/game-end
  disabled state can never drift from the actions' own no-op
  conditions — see that composable's doc for the full argument.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { useNavigation } from '../../composables/useNavigation';

const nav = useNavigation();
</script>

<template>
  <div class="toolbar-cluster toolbar-move-nav">
    <button
      class="toolbar-btn"
      :disabled="!nav.canGoPrev.value"
      :title="$t('toolbar.moveNav.first')"
      @click="nav.home"
    >|&lt;</button>
    <button
      class="toolbar-btn"
      :disabled="!nav.canGoPrev.value"
      :title="$t('toolbar.moveNav.prev')"
      @click="nav.prev"
    >&lt;</button>
    <button
      class="toolbar-btn"
      :disabled="!nav.canGoNext.value"
      :title="$t('toolbar.moveNav.next')"
      @click="nav.next"
    >&gt;</button>
    <button
      class="toolbar-btn"
      :disabled="!nav.canGoNext.value"
      :title="$t('toolbar.moveNav.last')"
      @click="nav.end"
    >&gt;|</button>
  </div>
</template>

<style scoped>
/* Vue's scoped CSS can't cross the SFC boundary (styles declared in
   Toolbar.vue don't reach this component's own root elements) — both
   rules below mirror Toolbar.vue's copies rather than reuse them, the
   same duplication ToolbarSliderPopover's `.sliders-metric` and
   SetupToolPalette's `.setup-trigger` already accept for the identical
   reason (see SetupToolPalette.vue's own comment on its copy). */
.toolbar-cluster { display: flex; align-items: center; gap: var(--space-tight); flex-shrink: 0; }
/* G30 (WCAG 2.5.8): witnessed at 18px tall — under the 24x24 pointer-target
   floor. min-height is a floor only (padding/border/font-size, i.e. the
   visual language, are untouched); flex-centering keeps the |</>| glyphs
   centred in the taller box. Mirrored in Toolbar.vue's copy of this same
   rule — see this file's own header note on why the two copies exist. */
.toolbar-btn {
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
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.toolbar-btn:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }
</style>
