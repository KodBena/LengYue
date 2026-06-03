/**
 * tests/integration/qeubo-apply-bookmark.test.ts
 *
 * Tier-3 tests for `useQeubo().applyBookmark` after the
 * knob-registry-plan §11 follow-up that routes per-key writes
 * through the substrate. Closes the deferred Phase-5 leak: a
 * bookmark apply against parameters under qEUBO hard claim used
 * to clobber the held value via whole-record reseat; now it's
 * refused atomically with a system message.
 *
 * The function-under-test is itself substrate-aware, so the
 * tests mutate the real store + claim machinery (no fakes for
 * those) and mock only the network-touching qEUBO HTTP service.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

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
import { useQeubo, reconcileQeuboKnobs } from '../../src/composables/useQeubo';
import { _resetClaimStateForTests, claimKnob } from '../../src/lib/knobs';
import type { BookmarkId, KnobId, QeuboBookmark } from '../../src/types';

function bookmark(name: string, parameters: Record<string, number>): QeuboBookmark {
  // Call sites pass the readable param-name → scalar map; the helper
  // reshapes it into the stored KnobId-keyed / vector form
  // (`qeubo.<name>` → [scalar]) so the fixtures stay legible while the
  // bookmark matches the post-56→57 schema.
  const reshaped: Record<KnobId, number[]> = {};
  for (const [k, v] of Object.entries(parameters)) {
    reshaped[('qeubo.' + k) as KnobId] = [v];
  }
  return {
    id: ('bm-' + name) as unknown as BookmarkId,
    name,
    createdAt: Date.now(),
    parameters: reshaped,
  };
}

beforeEach(() => {
  resetWorkspace();
  _resetClaimStateForTests();
  // Clear pre-seeded knobs so each test starts from a known state
  for (const key of Object.keys(store.profile.settings.knobs)) {
    if (key.startsWith('qeubo.')) delete store.profile.settings.knobs[key];
  }
  store.profile.settings.engine.katago.analysis_env.parameter_meta = {};
  store.profile.qeuboPinnedBookmarks = [];
  // Reset parameters
  store.profile.settings.engine.katago.analysis_env.parameters = {};
});

describe('applyBookmark — substrate-aware apply', () => {
  it('writes parameter values when no KnobDecls exist (legacy fall-through)', () => {
    store.profile.qeuboPinnedBookmarks = [bookmark('a', { alpha: 0.4, beta: 0.7 })];
    useQeubo().applyBookmark(('bm-a' as unknown) as BookmarkId);
    expect(store.profile.settings.engine.katago.analysis_env.parameters).toEqual({
      alpha: 0.4,
      beta: 0.7,
    });
  });

  it('writes per-key through the substrate when KnobDecls exist', () => {
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [0, 1] },
    };
    store.profile.settings.engine.katago.analysis_env.parameters = { alpha: 0.1 };
    reconcileQeuboKnobs();
    store.profile.qeuboPinnedBookmarks = [bookmark('a', { alpha: 0.6 })];
    useQeubo().applyBookmark(('bm-a' as unknown) as BookmarkId);
    expect(
      store.profile.settings.engine.katago.analysis_env.parameters.alpha,
    ).toBe(0.6);
  });

  it('preserves whole-record-reseat semantic: deletes keys absent from bookmark', () => {
    store.profile.settings.engine.katago.analysis_env.parameters = {
      alpha: 0.1,
      beta: 0.2,
      gamma: 0.3,
    };
    store.profile.qeuboPinnedBookmarks = [bookmark('a', { alpha: 0.4 })];
    useQeubo().applyBookmark(('bm-a' as unknown) as BookmarkId);
    expect(store.profile.settings.engine.katago.analysis_env.parameters).toEqual({
      alpha: 0.4,
    });
  });

  it('refuses atomically when a bookmarked param is hard-claimed', () => {
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [0, 1] },
    };
    store.profile.settings.engine.katago.analysis_env.parameters = { alpha: 0.1 };
    reconcileQeuboKnobs();
    // qEUBO holds a hard claim on alpha
    claimKnob('qeubo.alpha' as KnobId, {
      consumerId: 'qeubo',
      policy: 'hard',
      reason: 'experiment-in-progress',
    });
    store.profile.qeuboPinnedBookmarks = [bookmark('a', { alpha: 0.6 })];
    useQeubo().applyBookmark(('bm-a' as unknown) as BookmarkId);
    // Refused: alpha unchanged
    expect(
      store.profile.settings.engine.katago.analysis_env.parameters.alpha,
    ).toBe(0.1);
  });

  it('refuses atomically when ANY bookmarked param is hard-claimed (no partial writes)', () => {
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [0, 1] },
      beta: { range: [0, 1] },
    };
    store.profile.settings.engine.katago.analysis_env.parameters = {
      alpha: 0.1,
      beta: 0.2,
    };
    reconcileQeuboKnobs();
    // Hard claim on beta only — alpha is free, but the partial-apply
    // would leave the bookmark's joint intent half-realised.
    claimKnob('qeubo.beta' as KnobId, {
      consumerId: 'qeubo',
      policy: 'hard',
    });
    store.profile.qeuboPinnedBookmarks = [bookmark('a', { alpha: 0.4, beta: 0.5 })];
    useQeubo().applyBookmark(('bm-a' as unknown) as BookmarkId);
    // Both values unchanged — atomic refusal
    expect(
      store.profile.settings.engine.katago.analysis_env.parameters.alpha,
    ).toBe(0.1);
    expect(
      store.profile.settings.engine.katago.analysis_env.parameters.beta,
    ).toBe(0.2);
  });

  it('proceeds normally when only soft claims are held (manual policy releases on write)', () => {
    store.profile.settings.engine.katago.analysis_env.parameter_meta = {
      alpha: { range: [0, 1] },
    };
    store.profile.settings.engine.katago.analysis_env.parameters = { alpha: 0.1 };
    reconcileQeuboKnobs();
    // Soft claim — should not block manual writes
    claimKnob('qeubo.alpha' as KnobId, {
      consumerId: 'autonomous-sr',
      policy: 'soft',
    });
    store.profile.qeuboPinnedBookmarks = [bookmark('a', { alpha: 0.6 })];
    useQeubo().applyBookmark(('bm-a' as unknown) as BookmarkId);
    expect(
      store.profile.settings.engine.katago.analysis_env.parameters.alpha,
    ).toBe(0.6);
  });
});
