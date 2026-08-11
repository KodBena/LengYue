/**
 * tests/unit/lyt-w4-chrome.test.ts
 *
 * W4 commission (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
 * §8 W4) — source-text-level (Tier 1) regression guards for items 1-5.
 * jsdom runs with `css: false` (`vitest.config.ts`), so this file
 * cannot measure real rendered geometry — that half is covered by the
 * live Playwright probe (`.claude/dispatch-reports/lyt-w4-chrome-
 * probe.mjs`, run under the standing probe-isolation rule; its own
 * header names exactly what it verified live: overlay no-push,
 * popover z-index ordering, and previewBoard containment at 900x600).
 * What THIS file pins is the durable, committed-to-CI half: the source
 * facts that make the live behaviour possible in the first place, so a
 * future edit that silently reverts one of them fails red here rather
 * than only in a hand-run probe.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function src(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf-8');
}

// ── Item 1: overlay stratum ─────────────────────────────────────────
describe('App.vue — banners + system log overlay stratum (W4 item 1)', () => {
  const app = src('src/App.vue');

  it('#lyt-overlay-stack is position: fixed (never an in-flow flex-column sibling)', () => {
    const rule = /#lyt-overlay-stack\s*\{[^}]*\}/.exec(app);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/position:\s*fixed/);
  });

  it('#lyt-overlay-stack uses the --z-chrome-overlay token, not a raw literal', () => {
    const rule = /#lyt-overlay-stack\s*\{[^}]*\}/.exec(app)![0];
    expect(rule).toMatch(/z-index:\s*var\(--z-chrome-overlay\)/);
  });

  it('the capture banner, save banner, and SystemLogPanel are all direct descendants of the SAME #lyt-overlay-stack wrapper', () => {
    const block = /<div id="lyt-overlay-stack">([\s\S]*?)<\/div>\s*\n\s*<!-- The LYT skeleton/.exec(app);
    expect(block).not.toBeNull();
    const inner = block![1];
    expect(inner).toMatch(/id="keybinding-capture-banner"/);
    expect(inner).toMatch(/id="workspace-save-banner"/);
    expect(inner).toMatch(/<SystemLogPanel/);
  });

  it('no banner/log markup remains OUTSIDE #lyt-overlay-stack (a stray in-flow copy would defeat the no-push guarantee)', () => {
    const beforeStack = app.split('<div id="lyt-overlay-stack">')[0];
    expect(beforeStack).not.toMatch(/id="keybinding-capture-banner"/);
    expect(beforeStack).not.toMatch(/id="workspace-save-banner"/);
    expect(beforeStack).not.toMatch(/<SystemLogPanel/);
  });
});

// ── Item 2: toolbar structure ────────────────────────────────────────
describe('ToolbarEngineMetrics.vue — envelope-reserved metric cells (W4 item 2)', () => {
  const sfc = src('src/components/chrome/ToolbarEngineMetrics.vue');

  it.each([
    ['winrate', /\.eval-val\.winrate-val,\s*\.m-val\.winrate-val\s*\{[^}]*min-width:\s*\d+ch/],
    ['scoreLead', /\.eval-val\.score-lead-val,\s*\.m-val\.score-lead-val\s*\{[^}]*min-width:\s*\d+ch/],
    ['pps', /\.metric-pps \.m-val\s*\{[^}]*min-width:\s*\d+ch/],
    ['latency', /\.metric-latency \.m-val\s*\{[^}]*min-width:\s*\d+ch/],
  ])('%s declares a ch-based min-width reservation', (_name, pattern) => {
    expect(sfc).toMatch(pattern);
  });

  it('the growth-stable text-align is right (new digits fill the cell rather than shifting its left edge)', () => {
    const rule = /\.m-val\s*\{[^}]*\}/.exec(sfc)![0];
    expect(rule).toMatch(/text-align:\s*right/);
  });
});

describe('SidebarWidget.vue — one home for Load/Save SGF (W4 item 2)', () => {
  const sfc = src('src/components/chrome/SidebarWidget.vue');
  it('no longer emits load-sgf/save-sgf (the toolbar strip is the one remaining source)', () => {
    expect(sfc).not.toMatch(/\(e:\s*'load-sgf'\)/);
    expect(sfc).not.toMatch(/\(e:\s*'save-sgf'\)/);
  });
  it('no longer renders a .board-actions header', () => {
    expect(sfc).not.toMatch(/class="board-actions"/);
  });
});

describe('App.vue — toolbar strip is the one home for Load/Save SGF (W4 item 2)', () => {
  const app = src('src/App.vue');
  it('both #leaf-A_go and #leaf-A_top mount the SGF buttons exactly once each', () => {
    const buttonMatches = app.match(/<button class="lyt-sgf-btn"/g);
    // Two buttons (load+save) x two slots (A_go landscape, A_top portrait) = 4.
    expect(buttonMatches?.length).toBe(4);
  });
});

describe('BoardRailPopoverTrigger.vue — dead SGF event-forwarding removed (W4 fix, review item 2)', () => {
  const sfc = src('src/components/chrome/BoardRailPopoverTrigger.vue');
  it('no longer declares load-sgf/save-sgf emits', () => {
    expect(sfc).not.toMatch(/\(e:\s*'load-sgf'\)/);
    expect(sfc).not.toMatch(/\(e:\s*'save-sgf'\)/);
  });
  it('no longer forwards load-sgf/save-sgf onto its SidebarWidget mount (template directive usage, not prose mentions)', () => {
    expect(sfc).not.toMatch(/@load-sgf=/);
    expect(sfc).not.toMatch(/@save-sgf=/);
  });
});

describe('App.vue — corner-chrome BoardRailPopoverTrigger mount has no dead SGF listeners (W4 fix, review item 2)', () => {
  const app = src('src/App.vue');
  it('the corner-chrome mount does not listen for load-sgf/save-sgf', () => {
    const mount = /<BoardRailPopoverTrigger[^>]*\/>/.exec(app);
    expect(mount).not.toBeNull();
    expect(mount![0]).not.toMatch(/@load-sgf=/);
    expect(mount![0]).not.toMatch(/@save-sgf=/);
  });
});

describe('ToolbarSliderPopover.vue — real button, not raw concatenated text (W4 item 2)', () => {
  const sfc = src('src/components/chrome/ToolbarSliderPopover.vue');
  it('the trigger is a real <button>', () => {
    expect(sfc).toMatch(/<button[^>]*class="sliders-trigger"/);
  });
  it('.sliders-trigger declares its OWN flex/gap layout (not borrowed cross-SFC)', () => {
    const rule = /\.sliders-trigger\s*\{[^}]*\}/.exec(sfc)![0];
    expect(rule).toMatch(/display:\s*flex/);
    expect(rule).toMatch(/gap:/);
  });
});

// ── Item 3: popover z-index ladder ───────────────────────────────────
describe('Toolbar/corner-chrome popovers share ONE z-index token (W4 item 3)', () => {
  const sites: Array<[string, string]> = [
    ['LocalePicker.vue', 'src/components/chrome/LocalePicker.vue'],
    ['BoardRailPopoverTrigger.vue', 'src/components/chrome/BoardRailPopoverTrigger.vue'],
    ['EngineQueueTooltip.vue', 'src/components/chrome/EngineQueueTooltip.vue'],
    ['PboPopover.vue', 'src/components/qeubo/PboPopover.vue'],
    ['ToolbarSliderPopover.vue', 'src/components/chrome/ToolbarSliderPopover.vue'],
    ['LytPresenceMenu.vue', 'src/components/chrome/LytPresenceMenu.vue'],
    ['DebugMenu.vue', 'src/components/chrome/DebugMenu.vue'],
  ];

  it.each(sites)('%s uses var(--z-popover-chrome), not a hardcoded literal', (_name, path) => {
    const sfc = src(path);
    expect(sfc).toMatch(/z-index:\s*var\(--z-popover-chrome\)/);
    // No stray hardcoded 100/1000 literal z-index left behind.
    expect(sfc).not.toMatch(/z-index:\s*(100|1000);/);
  });
});

describe('theme.css — the z-index ladder documents the new role aliases (W4 item 3)', () => {
  const theme = src('src/assets/css/theme.css');
  it('declares --z-popover-chrome between --z-affordance and --z-modal', () => {
    expect(theme).toMatch(/--z-popover-chrome:\s*1000;/);
  });
  it('declares --z-chrome-overlay above --z-popover-chrome', () => {
    expect(theme).toMatch(/--z-chrome-overlay:\s*2000;/);
  });
});

// ── Item 4: MiniBoard containment ────────────────────────────────────
describe('previewBoard MiniBoard clamp (W4 item 4)', () => {
  it('LytNode.vue lets a fixed-track ASPECT leaf shrink (minmax(0,Npx)) instead of forcing overflow', () => {
    const sfc = src('src/components/chrome/LytNode.vue');
    expect(sfc).toMatch(/isAspectLeaf\(c\)\s*&&\s*c\.track\.kind\s*===\s*'fixed'/);
    expect(sfc).toMatch(/`minmax\(0px,\s*\$\{c\.track\.px\}px\)`/);
  });

  it('PreviewBoardPanel.vue sizes via min(100cqw,100cqh) so the leaf stays square whatever shape its cell provides', () => {
    const sfc = src('src/components/board/PreviewBoardPanel.vue');
    const rule = /\.preview-board-panel\s*\{[^}]*\}/.exec(sfc)![0];
    expect(rule).toMatch(/width:\s*min\(100cqw,\s*100cqh\)/);
    expect(rule).toMatch(/height:\s*min\(100cqw,\s*100cqh\)/);
    // The FIRST-DRAFT bug this fix replaced (aspect-ratio inert when
    // width/height are both pinned to 100%) must not silently return.
    expect(rule).not.toMatch(/aspect-ratio/);
  });
});

// ── Item 5: debug widgets -> debug menu, dev-build-only ─────────────
describe('DebugMenu.vue — consolidated dev-only affordances (W4 item 5)', () => {
  const sfc = src('src/components/chrome/DebugMenu.vue');

  it('gates its entire root on import.meta.env.DEV', () => {
    expect(sfc).toMatch(/const isDevBuild = import\.meta\.env\.DEV;/);
    expect(sfc).toMatch(/<div v-if="isDevBuild" class="debug-menu">/);
  });

  it('owns Clear Cache / Auto-Nav / Popover Stress / Jank Test', () => {
    expect(sfc).toMatch(/useEngineControls/);
    expect(sfc).toMatch(/useAutoNavigatePerf/);
    expect(sfc).toMatch(/useAutoPopoverPerf/);
    expect(sfc).toMatch(/useJankTest/);
  });

  it('is a pill shape (fully rounded trigger)', () => {
    const rule = /\.debug-pill\s*\{[^}]*\}/.exec(sfc)![0];
    expect(rule).toMatch(/border-radius:\s*999px/);
  });
});

describe('the four dev-only affordances no longer live on the main chrome surface (W4 item 5)', () => {
  it('Toolbar.vue no longer IMPORTS useAutoNavigatePerf/useAutoPopoverPerf, nor renders a Clear Cache button', () => {
    const sfc = src('src/components/chrome/Toolbar.vue');
    expect(sfc).not.toMatch(/from '..\/..\/composables\/useAutoNavigatePerf'/);
    expect(sfc).not.toMatch(/from '..\/..\/composables\/useAutoPopoverPerf'/);
    expect(sfc).not.toMatch(/@click="clearCache"/);
  });
  it('SidebarWidget.vue no longer IMPORTS useJankTest, nor renders a jank-test button', () => {
    const sfc = src('src/components/chrome/SidebarWidget.vue');
    expect(sfc).not.toMatch(/from '..\/..\/composables\/perf\/useJankTest'/);
    expect(sfc).not.toMatch(/class="jank-test-btn"/);
  });
});
