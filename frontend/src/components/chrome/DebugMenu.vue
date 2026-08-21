<!--
  src/components/chrome/DebugMenu.vue

  W4 commission (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
  §8 W4 item 5; roadmap §7 resolution 4: "debug widgets = the portrait
  mockup's menu shape, debug builds only"). Consolidates the four
  developer-only affordances that used to live scattered across the main
  chrome surface — Clear Cache and Auto-Nav Perf and Popover Stress
  (formerly three buttons inside `Toolbar.vue`'s `.engine-controls`
  cluster) and Jank Test (formerly a button inside `SidebarWidget.vue`'s
  board rail) — into ONE pill-shaped trigger that opens a small dropdown
  listing all four. Each affordance's own composable
  (`useEngineControls`/`useAutoNavigatePerf`/`useAutoPopoverPerf`/
  `useJankTest`) is called directly here now; this component is their
  ONE remaining call site for these four toggles.

  Dev-build gating (`import.meta.env.DEV`, statically folded — the same
  convention every other dev-only affordance in this codebase already
  uses) is on the component's OWN root `v-if`, so the entire menu —
  trigger, popover, and every composable's toggle wiring — never
  RENDERS in a production build (verified: `npm run build` then
  driving the app, the pill never mounts). DISCLOSED, not a new
  finding this file invents: `npm run build`'s own dist output was
  checked (W4 build) and the compiled render-function code plus its
  string literals ("DEBUG", "jank test (stop)", ...) still SHIP in the
  production JS bundle despite the DEV-folded `false` — Vite's default
  minification does not trace `isDevBuild`'s constant value far enough
  through Vue's compiled render function to eliminate the branch as
  dead code. This is a PRE-EXISTING characteristic of every dev-gated
  affordance in this codebase (the original `Toolbar.vue` clearCache
  button's own comment, before this file existed, made the identical
  "dead-code-eliminate" claim under the same mechanism) — not a
  regression this file introduces, and not a gap this six-item
  commission's scope extends to fixing (a bundler/build-config change,
  not a chrome-layout one). Named here so the claim above is precise:
  "never renders" is verified; "never ships" is not.

  Click-toggle (not hover), mirroring `SetupToolPalette.vue`/
  `LocalePicker.vue`'s own precedent for a chrome popover whose content
  is a small set of discrete actions rather than a live readout.

  Mounted in App.vue's corner trigger row (`<CornerStackHost>`'s own
  `triggers` slot — an overlay, not a LYT tree node, SPEC.md §2's
  "overlays... occupy no standing space"), so this menu costs zero
  grid-track reservation in either screen class — exactly the "off the
  main surface" instruction.

  Space-owner cure, dispatch L5 (`.claude/dispatch-reports/
  lyt-space-owner-spec.md` §1.5/§3 step 5): dismissal migrated onto
  `useDismissiblePopover` (`composables/chrome/useDismissiblePopover.ts`)
  with `outsideClick: false` — a DISCLOSED, explicit exception (this
  file's own header already named the reason: "a plain click-toggle
  popover, not a modal," and this component never wired outside-click
  dismiss pre-dispatch either). Escape and the trigger's own re-click
  (`explicitCloseControl`) remain this popover's two live dismissal
  channels, satisfying `overlayContract()`'s own "at least one channel"
  refusal without silently ADDING behavior this dev-only surface never
  had.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useEngineControls } from '../../composables/useEngineControls';
import { useAutoNavigatePerf } from '../../composables/useAutoNavigatePerf';
import { useAutoPopoverPerf } from '../../composables/useAutoPopoverPerf';
import { useJankTest } from '../../composables/perf/useJankTest';
import { useDismissiblePopover } from '../../composables/chrome/useDismissiblePopover';

const { t } = useI18n();

// Statically folded — this whole component (script + template) is
// dead-code-eliminated from the production bundle when false, matching
// every other `import.meta.env.DEV` gate in this codebase.
const isDevBuild = import.meta.env.DEV;

const { isConnected, clearCache } = useEngineControls();
const { isRunning: autoNavRunning, toggle: toggleAutoNav } = useAutoNavigatePerf();
const { isRunning: popoverStressRunning, toggle: togglePopoverStress } = useAutoPopoverPerf();
const jankTest = useJankTest();

// `outsideClick: false` — see this file's own header, "Space-owner cure,
// dispatch L5".
const { open, toggle: toggleMenu } = useDismissiblePopover({ outsideClick: false });
</script>

<template>
  <div v-if="isDevBuild" class="debug-menu">
    <button
      type="button"
      class="debug-pill"
      :aria-haspopup="true"
      :aria-expanded="open"
      title="Developer-only diagnostics (dev build only)"
      @click="toggleMenu"
    >DEBUG</button>

    <div v-if="open" class="debug-popover" role="menu">
      <!-- Verbatim relocation from Toolbar.vue — same i18n keys, same
           disabled/title logic, same `btn-connected` active-state
           class (a shared theme convention, not `Toolbar.vue`-scoped:
           the class name itself carries no component-scoped CSS,
           only `theme.css`-level meaning), only the mount site moved. -->
      <button
        type="button"
        class="debug-item"
        :disabled="!isConnected"
        :title="t('engine.clearCache.title')"
        @click="clearCache"
      >{{ t('toolbar.clearCache') }}</button>
      <button
        type="button"
        class="debug-item"
        :class="{ 'btn-connected': autoNavRunning }"
        :title="t('toolbar.autoNavPerf.title')"
        @click="toggleAutoNav"
      >{{ autoNavRunning ? t('toolbar.autoNavPerf.stop') : t('toolbar.autoNavPerf.start') }}</button>
      <!-- M8(a) (menus-ui audit row 1291): disabled while disconnected
           (unless already running, so an in-flight run can still be
           stopped) — its only target, the queue tooltip, only mounts
           inside ToolbarEngineMetrics while connected. -->
      <button
        type="button"
        class="debug-item"
        :class="{ 'btn-connected': popoverStressRunning }"
        :disabled="!isConnected && !popoverStressRunning"
        :title="isConnected || popoverStressRunning
          ? t('toolbar.popoverStress.title')
          : t('toolbar.popoverStress.titleDisconnected')"
        @click="togglePopoverStress('queue')"
      >{{ popoverStressRunning ? t('toolbar.popoverStress.stop') : t('toolbar.popoverStress.start') }}</button>
      <!-- Jank test: literal (non-i18n) label is intentional, matching
           its pre-move convention in SidebarWidget.vue — a developer
           affordance, not a user-facing string. -->
      <button
        type="button"
        class="debug-item"
        :class="{ running: jankTest.isRunning.value }"
        title="Dev: stress the thumbnail-preview render (loads 16 boards, auto-navs the long Shusaku game, scrubs the hover preview). Click again to stop."
        @click="jankTest.toggle()"
      >{{ jankTest.isRunning.value ? 'jank test (stop)' : 'jank test' }}</button>
    </div>
  </div>
</template>

<style scoped>
.debug-menu { position: relative; }
/* Pill shape (roadmap §7 resolution 4: "the portrait mockup's menu
   shape") — fully rounded ends via a large border-radius, quiet
   chrome register matching the other dev-only affordances this menu
   replaces (surface-2 fill, monospace, uppercase). */
.debug-pill {
  min-height: 24px;
  padding: 1px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border-2);
  border-radius: 999px;
  color: var(--text-0);
  font-family: monospace;
  font-size: var(--text-tiny);
  text-transform: uppercase;
  letter-spacing: var(--tracking-tight);
  cursor: pointer;
}
.debug-popover {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: var(--space-tight);
  display: flex;
  flex-direction: column;
  gap: var(--space-tight);
  background: var(--surface-0);
  border: 1px solid var(--border-3);
  border-radius: var(--radius-default);
  padding: var(--space-default);
  min-width: 180px;
  z-index: var(--z-popover-chrome);
}
.debug-item {
  min-height: 24px;
  padding: var(--space-tight) var(--space-default);
  background: var(--surface-2);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  color: var(--text-0);
  font-family: monospace;
  font-size: var(--text-tiny);
  text-transform: uppercase;
  letter-spacing: var(--tracking-tight);
  cursor: pointer;
  text-align: left;
}
.debug-item:disabled { opacity: 0.5; cursor: default; }
/* `.btn-connected`/`.running` are OWN rules here, not borrowed from
   Toolbar.vue/SidebarWidget.vue — `<style scoped>` never crosses the
   SFC boundary even when the class name is reused (the exact bug this
   W4 pass already fixed twice elsewhere — ToolbarSliderPopover's
   "SLIDERS11" and EngineQueueTooltip's own concatenated-text defect;
   see those files' own header comments). */
.debug-item.btn-connected { border-color: var(--state-success); color: var(--state-success); }
/* wC-contrast (F9 class, MOVE-95-chip pattern): --surface-0 text on an
   --accent-primary fill measures 2.08:1 in the default cluster theme.
   --text-on-accent is the token minted for text directly on an accent
   fill (theme.css, ledger rows 1018/1144). */
.debug-item.running { background: var(--accent-primary); color: var(--text-on-accent); }
</style>
