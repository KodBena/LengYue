/**
 * tests/unit/analysis-engine-status-chip.test.ts
 *
 * Regression guard for M11 (menus-ui audit row 1291): "'Engine:
 * Offline' — the fact explaining the whole screen — is ~10px text in
 * the corner with no colour, icon or as-of time." AnalysisControls.vue
 * now renders a status chip with state colour AND a shape-distinct
 * icon (filled vs hollow dot — never colour alone, ADR-0019 appendix
 * C18) per genre precedent (Lizzie/KaTrain both badge engine
 * reachability rather than leaving it as incidental prose).
 *
 * Source-text assertion (Tier 1 — no DOM, no Vue), same posture
 * `analysis-palette-select-label.test.ts` (M27) already established
 * for this exact file: AnalysisControls.vue pulls in
 * useAnalysisPersistence / the profile-owner mutation seam / the
 * analysis ledger, none of which this fix touches, so a full mount
 * would drag in an unrelated composable graph to check markup and a
 * CSS rule.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'src/components/editors/AnalysisControls.vue'), 'utf-8');
const THEME_CSS = readFileSync(resolve(process.cwd(), 'src/assets/css/theme.css'), 'utf-8');

describe('AnalysisControls.vue — engine status chip (M11)', () => {
  it('classes the chip by connection state, not a bare text swap', () => {
    expect(SRC).toMatch(/class="engine-status-chip"/);
    expect(SRC).toMatch(/store\.engine\.status === 'connected' \? 'is-connected' : 'is-offline'/);
  });

  it('the icon glyph differs by state (never colour alone — ADR-0019 C18)', () => {
    const iconMatch = /<span class="engine-status-icon"[^>]*>\{\{\s*store\.engine\.status === 'connected' \? '([^']+)' : '([^']+)'\s*\}\}<\/span>/.exec(SRC);
    expect(iconMatch).not.toBeNull();
    expect(iconMatch![1]).not.toBe(iconMatch![2]);
  });

  it('.is-connected and .is-offline each declare a distinct, defined color token', () => {
    const connectedRule = /\.engine-status-chip\.is-connected\s*\{[^}]*\}/.exec(SRC);
    const offlineRule = /\.engine-status-chip\.is-offline\s*\{[^}]*\}/.exec(SRC);
    expect(connectedRule).not.toBeNull();
    expect(offlineRule).not.toBeNull();

    const connectedToken = /color:\s*(var\(--[a-zA-Z0-9-]+\))/.exec(connectedRule![0]);
    const offlineToken = /color:\s*(var\(--[a-zA-Z0-9-]+\))/.exec(offlineRule![0]);
    expect(connectedToken).not.toBeNull();
    expect(offlineToken).not.toBeNull();
    expect(connectedToken![1]).not.toBe(offlineToken![1]);
  });

  it('no ghost custom properties: every var(--x) this fix references is defined in theme.css', () => {
    const defined = new Set<string>();
    for (const m of THEME_CSS.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);

    // Isolate the CSS rule blocks (not the template, which also contains
    // the literal string "engine-status-chip" as a class attribute).
    const styleBlock = /<style[^>]*>([\s\S]*?)<\/style>/.exec(SRC)![1];
    const chipStart = styleBlock.indexOf('.engine-status-chip');
    expect(chipStart).toBeGreaterThanOrEqual(0);
    const chipCss = styleBlock.slice(chipStart, styleBlock.indexOf('.engine-status-icon', chipStart) + 200);

    const referenced = new Set<string>();
    for (const m of chipCss.matchAll(/var\((--[a-zA-Z0-9-]+)\)/g)) referenced.add(m[1]);

    const ghosts = [...referenced].filter((name) => !defined.has(name));
    expect(ghosts).toEqual([]);
  });
});
