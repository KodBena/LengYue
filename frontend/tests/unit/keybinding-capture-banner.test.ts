/**
 * tests/unit/keybinding-capture-banner.test.ts
 *
 * Regression guard for M8(c) (menus-ui audit row 1291): "at minimum a
 * prominent persistent banner while capture is armed." App.vue is not
 * mounted directly anywhere in this suite (its composable graph —
 * auth, sync, engine responders, multiple modal refs — is out of
 * proportion to what changed here); this is a source-text assertion,
 * the same Tier-1 posture `analysis-palette-select-label.test.ts`
 * (M27) and `pointer-target-minimum-size.test.ts` (M16) already use
 * for exactly this kind of localized fix inside a heavy host.
 *
 * Two properties under test:
 *   1. The banner is gated on `captureMode`/`capturingActionLabel`
 *      (the SAME module-scope ref KeybindingRow.vue sets on Edit
 *      click) — not a separate, driftable flag.
 *   2. Its fill is opaque (a solid `--state-attention`), never the
 *      `color-mix(…, transparent)` translucent treatment
 *      `#workspace-save-banner` uses — the standing ruling this
 *      dispatch was briefed under: no diffuse transparent overlays.
 *
 * The actual id -> label DERIVATION (registry lookup, translate,
 * not-found fallback) is a plain function,
 * `resolveCapturingActionLabel` (keybindings-capture.ts), and is unit-
 * tested directly in
 * `keybindings-capture-resolve-label.test.ts` (review remedy, ledger
 * row 1335) — this file stays a source-text check of App.vue's own
 * wiring (App.vue itself is not mounted here; its composable graph —
 * auth, sync, engine responders, multiple modal refs — is out of
 * proportion to what changed).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_SRC = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf-8');

describe('App.vue — keybinding-capture banner (M8(c))', () => {
  it('imports the real captureMode ref and the shared resolver (not locally-reinvented logic)', () => {
    expect(APP_SRC).toMatch(/import\s*\{\s*captureMode,\s*resolveCapturingActionLabel\s*\}\s*from\s*'\.\/lib\/keybindings-capture'/);
  });

  it('the banner is gated on capturingActionLabel, which wraps resolveCapturingActionLabel(captureMode.value, …)', () => {
    const computedMatch = /const capturingActionLabel = computed<string \| null>\(\(\) =>\s*resolveCapturingActionLabel\(captureMode\.value, KEYBINDINGS_REGISTRY, t\),?\s*\);/.exec(APP_SRC);
    expect(computedMatch).not.toBeNull();

    const bannerMatch = /<div\s+v-if="capturingActionLabel !== null"[\s\S]*?id="keybinding-capture-banner"/.exec(APP_SRC);
    expect(bannerMatch).not.toBeNull();
  });

  it('carries role="alert" (same accessibility idiom as the save-failure banner)', () => {
    const bannerBlock = /<div\s+v-if="capturingActionLabel !== null"[\s\S]*?<\/div>/.exec(APP_SRC)![0];
    expect(bannerBlock).toContain('role="alert"');
  });

  it('the fill is opaque — a solid --state-attention, never color-mix(…, transparent)', () => {
    const rule = /#keybinding-capture-banner\s*\{[^}]*\}/.exec(APP_SRC);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/background:\s*var\(--state-attention\)/);
    expect(rule![0]).not.toMatch(/color-mix/);
    expect(rule![0]).not.toMatch(/rgba\(/);
  });
});
