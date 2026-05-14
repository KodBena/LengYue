/**
 * tests/integration/qeubo-knob-reconcile.test.ts
 *
 * Tier-3 (composable / store integration) tests for
 * `reconcileQeuboKnobs` in `src/composables/useQeubo.ts`. The
 * reconciler is the reactive bridge that keeps the `qeubo.*`
 * portion of `profile.settings.knobs` in sync with
 * `analysis_env.parameter_meta` — without it, the KnobRegistryEditor
 * only learns about parameter_meta entries at migration time or on
 * `startNewExperiment`, and a mid-session range edit via
 * PaletteEditor wouldn't surface the new knob.
 *
 * Tests exercise the real reactive store (mutating
 * `profile.settings.engine.katago.analysis_env.parameter_meta` and
 * asserting `profile.settings.knobs` matches), with the qEUBO HTTP
 * service mocked so the useQeubo import chain doesn't touch the
 * network.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the network-touching service so the composable's import
// chain doesn't try to hit a backend during test setup.
vi.mock('../../src/services/qeubo-service', () => ({
  qeuboService: {
    getStatus: vi.fn(),
    getPair: vi.fn(),
    createExperiment: vi.fn(),
    deleteExperiment: vi.fn(),
    submitPreference: vi.fn(),
    getBest: vi.fn(),
  },
}));

import { store, resetWorkspace } from '../../src/store';
import { reconcileQeuboKnobs } from '../../src/composables/useQeubo';
import { _resetClaimStateForTests, claimKnob } from '../../src/lib/knobs';
import type { KnobId } from '../../src/types';

beforeEach(() => {
  resetWorkspace();
  _resetClaimStateForTests();
  // Clear any pre-seeded knobs from defaults so each test starts
  // from a known-empty registry for the qeubo.* domain.
  for (const key of Object.keys(store.profile.settings.knobs)) {
    if (key.startsWith('qeubo.')) {
      delete store.profile.settings.knobs[key];
    }
  }
  // Empty parameter_meta to start.
  store.profile.settings.engine.katago.analysis_env.parameter_meta = {};
});

describe('reconcileQeuboKnobs', () => {
  it('is a no-op against empty parameter_meta', () => {
    reconcileQeuboKnobs();
    const qeuboKeys = Object.keys(store.profile.settings.knobs).filter((k) =>
      k.startsWith('qeubo.'),
    );
    expect(qeuboKeys).toEqual([]);
  });

  it('seeds a qeubo.<name> KnobDecl when parameter_meta gains a valid range', () => {
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [0, 1] },
    };
    reconcileQeuboKnobs();
    const decl = store.profile.settings.knobs['qeubo.alpha'];
    expect(decl).toMatchObject({
      id: 'qeubo.alpha',
      label: 'alpha',
      domain: 'qeubo',
      inputs: [{ range: [0, 1] }],
      outputs: [{
        path: 'profile.settings.engine.katago.analysis_env.parameters.alpha',
      }],
      qeuboControlled: false,
    });
  });

  it('mirrors qeubo_controlled: true onto the seeded decl', () => {
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [0, 1], qeubo_controlled: true },
    };
    reconcileQeuboKnobs();
    expect(store.profile.settings.knobs['qeubo.alpha'].qeuboControlled).toBe(true);
  });

  it('updates the decl when the range narrows', () => {
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [0, 1] },
    };
    reconcileQeuboKnobs();
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [0.2, 0.8] },
    };
    reconcileQeuboKnobs();
    expect(store.profile.settings.knobs['qeubo.alpha'].inputs[0].range).toEqual([
      0.2,
      0.8,
    ]);
  });

  it('updates the decl when qeubo_controlled toggles', () => {
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [0, 1], qeubo_controlled: false },
    };
    reconcileQeuboKnobs();
    expect(store.profile.settings.knobs['qeubo.alpha'].qeuboControlled).toBe(false);
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [0, 1], qeubo_controlled: true },
    };
    reconcileQeuboKnobs();
    expect(store.profile.settings.knobs['qeubo.alpha'].qeuboControlled).toBe(true);
  });

  it('removes a decl when the range is dropped', () => {
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [0, 1] },
    };
    reconcileQeuboKnobs();
    expect(store.profile.settings.knobs['qeubo.alpha']).toBeDefined();
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: {},
    };
    reconcileQeuboKnobs();
    expect(store.profile.settings.knobs['qeubo.alpha']).toBeUndefined();
  });

  it('removes a decl when the parameter_meta entry is deleted', () => {
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [0, 1] },
    };
    reconcileQeuboKnobs();
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {};
    reconcileQeuboKnobs();
    expect(store.profile.settings.knobs['qeubo.alpha']).toBeUndefined();
  });

  it('skips a parameter_meta entry with an invalid range', () => {
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [1, 0] as [number, number] }, // inverted
      beta: { range: [Number.NaN, 1] as [number, number] },
      gamma: { range: [0, 1] }, // valid
    };
    reconcileQeuboKnobs();
    expect(store.profile.settings.knobs['qeubo.alpha']).toBeUndefined();
    expect(store.profile.settings.knobs['qeubo.beta']).toBeUndefined();
    expect(store.profile.settings.knobs['qeubo.gamma']).toBeDefined();
  });

  it('preserves a claim-held decl even when the parameter loses its range', () => {
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [0, 1] },
    };
    reconcileQeuboKnobs();
    // Simulate qEUBO holding a hard claim on this knob.
    claimKnob('qeubo.alpha' as KnobId, {
      consumerId: 'qeubo',
      policy: 'hard',
      reason: 'experiment in progress',
    });
    // User invalidates the range mid-experiment.
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: {},
    };
    reconcileQeuboKnobs();
    // The decl survives — yanking it would leave the claim
    // un-anchored and the next writeKnobValue would throw.
    expect(store.profile.settings.knobs['qeubo.alpha']).toBeDefined();
  });

  it('does not touch non-qeubo.* entries in the registry', () => {
    store.profile.settings.knobs['display.brightness'] = {
      id: 'display.brightness' as KnobId,
      label: 'Brightness',
      domain: 'display',
      inputs: [{ range: [0, 1] }],
      outputs: [{ path: 'profile.settings.appearance.intensityHueShift' }],
    };
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {};
    reconcileQeuboKnobs();
    expect(store.profile.settings.knobs['display.brightness']).toBeDefined();
  });

  it('short-circuits on equivalent state (idempotent re-run)', () => {
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [0, 1] },
    };
    reconcileQeuboKnobs();
    const before = store.profile.settings.knobs['qeubo.alpha'];
    reconcileQeuboKnobs();
    const after = store.profile.settings.knobs['qeubo.alpha'];
    // Reference equality — the short-circuit avoided rewriting the
    // entry, which means dependent reactive watchers in production
    // don't see spurious churn on every keystroke.
    expect(after).toBe(before);
  });

  it('handles multiple parameters in one reconcile', () => {
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [0, 1], qeubo_controlled: true },
      beta: { range: [-10, 10], qeubo_controlled: false },
      gamma: {}, // no range, no decl
    };
    reconcileQeuboKnobs();
    expect(store.profile.settings.knobs['qeubo.alpha']).toBeDefined();
    expect(store.profile.settings.knobs['qeubo.beta']).toBeDefined();
    expect(store.profile.settings.knobs['qeubo.gamma']).toBeUndefined();
    expect(store.profile.settings.knobs['qeubo.alpha'].qeuboControlled).toBe(true);
    expect(store.profile.settings.knobs['qeubo.beta'].qeuboControlled).toBe(false);
  });
});
