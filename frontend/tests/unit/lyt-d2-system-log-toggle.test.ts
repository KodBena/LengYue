/**
 * tests/unit/lyt-d2-system-log-toggle.test.ts
 *
 * D2 fix (`.claude/dispatch-reports/lyt-w5-parity-build.md` Defect D2,
 * reclassified REWORK-CAUSED) — source-text-level (Tier 1) regression
 * guards, matching `lyt-w4-chrome.test.ts`'s own established shape
 * (jsdom runs with `css: false`, so this file cannot measure real
 * rendered geometry; the live half is
 * `.claude/dispatch-reports/lyt-d2-fix-probe.mjs`, run under the
 * standing probe-isolation rule).
 *
 * Pins: SystemLogToggle mounts in App.vue's `#lyt-corner-chrome`
 * cluster; the overlay's v-if condition (manual OR transient) is
 * unchanged from the pre-fix shape (the fix adds the write side, not
 * a new read gate); the toggle button clears the 24x24 pointer-target
 * floor; the toggle writes through `touchSession()`.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function src(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf-8');
}

describe('App.vue — SystemLogToggle mounted in #lyt-corner-chrome (D2 fix)', () => {
  const app = src('src/App.vue');

  it('imports SystemLogToggle from the chrome components directory', () => {
    expect(app).toMatch(/import SystemLogToggle from '\.\/components\/chrome\/SystemLogToggle\.vue';/);
  });

  it('mounts <SystemLogToggle /> inside the corner trigger row, alongside its siblings (re-pinned, dispatch L5)', () => {
    // Space-owner cure, dispatch L5 (`.claude/dispatch-reports/
    // lyt-space-owner-spec.md` §1.4/§3 step 5): `#lyt-corner-chrome`
    // (a plain `position: fixed` div) is RETIRED — the same cluster now
    // lives inside `<CornerStackHost>`'s own `triggers` named slot (see
    // that component's own header). Anchored on the known LAST element
    // this cluster mounts (`<SystemLogToggle />`) instead, robust to
    // whatever nested markup precedes it — see App.vue's own template
    // for the current order.
    const block = /<template #triggers>([\s\S]*?<SystemLogToggle\s*\/>)/.exec(app);
    expect(block).not.toBeNull();
    const inner = block![1];
    expect(inner).toMatch(/<DebugMenu\s*\/>/);
    expect(inner).toMatch(/<LytPresenceMenu[\s\S]*?\/>/);
    expect(inner).toMatch(/<SystemLogToggle\s*\/>/);
  });

  it('the overlay v-if gate is unchanged: manual OR transient, not a new condition', () => {
    const rule = /<SystemLogPanel\s+v-if="([^"]+)"/.exec(app);
    expect(rule).not.toBeNull();
    expect(rule![1]).toBe("store.session.ui.systemLogExpanded || transientLogReveal");
  });
});

describe('SystemLogToggle.vue — the restored manual affordance (D2 fix)', () => {
  const sfc = src('src/components/chrome/SystemLogToggle.vue');

  it('reads/writes through useSystemLogToggle, not an inline store poke', () => {
    expect(sfc).toMatch(/useSystemLogToggle/);
    expect(sfc).not.toMatch(/store\.session\.ui\.systemLogExpanded\s*=/);
  });

  it('the trigger button clears the 24x24 WCAG 2.5.8 pointer-target floor (M16 discipline)', () => {
    const rule = /\.system-log-toggle\s*\{[^}]*\}/.exec(sfc)![0];
    const w = /width:\s*(\d+)px/.exec(rule);
    const h = /height:\s*(\d+)px/.exec(rule);
    expect(w).not.toBeNull();
    expect(h).not.toBeNull();
    expect(Number(w![1])).toBeGreaterThanOrEqual(24);
    expect(Number(h![1])).toBeGreaterThanOrEqual(24);
  });

  it('binds aria-pressed to the persisted expanded state (accessible toggle semantics)', () => {
    expect(sfc).toMatch(/:aria-pressed="expanded"/);
  });

  it('click handler calls toggle()', () => {
    expect(sfc).toMatch(/@click="toggle"/);
  });
});

describe('useSystemLogToggle.ts — write side (D2 fix)', () => {
  const src_ = src('src/composables/chrome/useSystemLogToggle.ts');

  it('toggle() flips systemLogExpanded and calls touchSession()', () => {
    expect(src_).toMatch(/store\.session\.ui\.systemLogExpanded\s*=\s*!store\.session\.ui\.systemLogExpanded;/);
    expect(src_).toMatch(/touchSession\(\);/);
  });
});
