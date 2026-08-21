/**
 * tests/unit/gamma-plain-language-labels.test.ts
 *
 * Regression guard for ledger row 1292 (menus-ui-audit finding M21):
 * three fields were labelled in notation the audience of a flashcard
 * app doesn't read — MintCardModal's "Discount γ:", CardMetadataPanel's
 * "Gamma (discount)", and the Card Visit-Count Override's
 * "Multiplier (a):" / "Offset (b):". Each is now a plain domain-name
 * label with the symbol/coefficient/formula demoted to a `title`
 * tooltip (the app's existing tooltip convention — see e.g.
 * KeybindingRow.vue's `:title="t(action.descriptionKey)"`).
 *
 * Source-text + locale-catalog assertions (Tier 1 — no DOM/Vue mount,
 * same posture as analysis-palette-select-label.test.ts): confirms
 * (a) each label's i18n VALUE in en.json no longer contains the bare
 * symbol/coefficient-letter notation, (b) each label element in the
 * component source carries a `:title` pointing at a hint key, and (c)
 * every new/changed key actually resolves in en.json.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import en from '../../src/locales/en.json';

function readSrc(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf-8');
}

const messages: Record<string, string> = en as unknown as Record<string, string>;

describe('Gamma / a-b coefficient labels are plain language, with notation demoted (audit M21)', () => {
  it('mint.field.discountGamma no longer reads as bare notation ("Discount γ:")', () => {
    expect(messages['mint.field.discountGamma']).not.toMatch(/^Discount\s*γ/);
    expect(messages['mint.field.discountGamma']).toMatch(/decay/i);
  });

  it('mint.field.discountGammaHint exists and carries the demoted γ symbol/formula', () => {
    expect(messages['mint.field.discountGammaHint']).toBeTruthy();
    expect(messages['mint.field.discountGammaHint']).toContain('γ');
  });

  it('MintCardModal.vue demotes the symbol to a title tooltip on the label', () => {
    const src = readSrc('src/components/modals/MintCardModal.vue');
    expect(src).toMatch(/<label :title="\$t\('mint\.field\.discountGammaHint'\)">\{\{\s*\$t\('mint\.field\.discountGamma'\)/);
  });

  it('cardMetadata.gammaLabel no longer reads as bare notation ("Gamma (discount)")', () => {
    expect(messages['cardMetadata.gammaLabel']).not.toMatch(/^Gamma/);
    expect(messages['cardMetadata.gammaLabel']).toMatch(/decay/i);
  });

  it('cardMetadata.gammaHint exists and carries the demoted γ symbol/formula', () => {
    expect(messages['cardMetadata.gammaHint']).toBeTruthy();
    expect(messages['cardMetadata.gammaHint']).toContain('γ');
  });

  it('CardMetadataPanel.vue demotes the symbol to a title tooltip on the label', () => {
    const src = readSrc('src/components/CardMetadataPanel.vue');
    expect(src).toMatch(/<label :title="\$t\('cardMetadata\.gammaHint'\)">\{\{\s*\$t\('cardMetadata\.gammaLabel'\)/);
  });

  it('visitsLerp.multiplierLabel / offsetLabel no longer read as bare coefficient letters', () => {
    expect(messages['visitsLerp.multiplierLabel']).not.toMatch(/\(a\)/);
    expect(messages['visitsLerp.offsetLabel']).not.toMatch(/\(b\)/);
  });

  it('visitsLerp multiplier/offset hints exist and carry the demoted a/b coefficient formula', () => {
    expect(messages['visitsLerp.multiplierHint']).toContain('a·x + b');
    expect(messages['visitsLerp.offsetHint']).toContain('a·x + b');
  });

  it('VisitsLerpConfig.vue demotes the a/b coefficients to title tooltips on both labels', () => {
    const src = readSrc('src/components/VisitsLerpConfig.vue');
    expect(src).toMatch(/<label :title="t\('visitsLerp\.multiplierHint'\)">\{\{\s*t\('visitsLerp\.multiplierLabel'\)/);
    expect(src).toMatch(/<label :title="t\('visitsLerp\.offsetHint'\)">\{\{\s*t\('visitsLerp\.offsetLabel'\)/);
  });
});
