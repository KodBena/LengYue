/**
 * tests/unit/keybindings-capture-resolve-label.test.ts
 *
 * Review remedy (ledger row 1335): unit coverage for
 * `resolveCapturingActionLabel` (keybindings-capture.ts) — the actual
 * id -> label derivation App.vue's `capturingActionLabel` computed
 * wraps for the M8(c) capture banner. `keybinding-capture-banner.
 * test.ts` only pins that App.vue WIRES this function in; this file
 * exercises the function's own logic path directly: a capturing row
 * id resolves to the right action's translated label, an id with no
 * matching registry entry falls back to the bare id (defensive —
 * ADR-0002 non-fatal degradation, same posture
 * `AnalysisDashboard.vue`'s unknown-panel-id drop takes), and `null`
 * (nothing capturing) resolves to `null`.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { resolveCapturingActionLabel } from '../../src/lib/keybindings-capture';
import { KEYBINDINGS_REGISTRY } from '../../src/composables/keybindings-catalog';
import type { KeybindingActionDecl } from '../../src/lib/keybindings';
import type { KeybindingActionId } from '../../src/types';

// Identity "translate" — the property under test is the RESOLUTION
// (which decl, which labelKey), not vue-i18n's own message formatting.
const identityTranslate = (labelKey: string) => labelKey;

describe('resolveCapturingActionLabel', () => {
  it('null capturingId resolves to null (nothing capturing)', () => {
    expect(resolveCapturingActionLabel(null, KEYBINDINGS_REGISTRY, identityTranslate)).toBeNull();
  });

  it('a real registry id resolves to that action\'s translated labelKey', () => {
    const action = KEYBINDINGS_REGISTRY[0];
    const label = resolveCapturingActionLabel(action.id, KEYBINDINGS_REGISTRY, identityTranslate);
    expect(label).toBe(action.labelKey);
  });

  it('resolves the RIGHT action out of several, not just the first', () => {
    // Guards against an implementation that ignores the id and always
    // returns registry[0]'s label.
    const target = KEYBINDINGS_REGISTRY[KEYBINDINGS_REGISTRY.length - 1];
    const label = resolveCapturingActionLabel(target.id, KEYBINDINGS_REGISTRY, identityTranslate);
    expect(label).toBe(target.labelKey);
    expect(label).not.toBe(KEYBINDINGS_REGISTRY[0].labelKey);
  });

  it('passes the resolved labelKey through the injected translate function', () => {
    const action = KEYBINDINGS_REGISTRY[0];
    const label = resolveCapturingActionLabel(
      action.id,
      KEYBINDINGS_REGISTRY,
      (key) => `TRANSLATED(${key})`,
    );
    expect(label).toBe(`TRANSLATED(${action.labelKey})`);
  });

  it('an id absent from the registry falls back to the bare id (non-fatal degradation)', () => {
    const fakeId = 'not-a-real-action-id' as KeybindingActionId;
    const label = resolveCapturingActionLabel(fakeId, KEYBINDINGS_REGISTRY, identityTranslate);
    expect(label).toBe(fakeId);
  });

  it('is registry-agnostic — works over a hand-built registry, not just the production catalog', () => {
    const fakeRegistry: KeybindingActionDecl[] = [
      {
        id: 'fakeAction' as KeybindingActionId,
        labelKey: 'fake.label',
        descriptionKey: 'fake.description',
        defaultKey: 'x',
        dispatchMode: 'immediate',
        enabledWhen: () => true,
        handler: () => {},
      },
    ];
    const label = resolveCapturingActionLabel('fakeAction' as KeybindingActionId, fakeRegistry, identityTranslate);
    expect(label).toBe('fake.label');
  });
});
