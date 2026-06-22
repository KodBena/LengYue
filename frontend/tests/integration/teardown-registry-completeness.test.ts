/**
 * tests/integration/teardown-registry-completeness.test.ts
 *
 * The load-guarantee for the board-close / workspace-reset teardown registry
 * (ADR-0012 P2/P3 dependency inversion). After the inversion, `store/index.ts`
 * no longer imports the resource owners — so nothing forces an owner's
 * module-init registration to run unless the bootstrap
 * (`src/store/teardown-registrations.ts`) loads it. A forgotten owner (missing
 * from the bootstrap, or whose registration was dropped/mislabelled) would
 * silently lose its per-board / per-identity cleanup: the exact silent failure
 * the resource-ownership discipline + ADR-0002 exist to prevent.
 *
 * This suite is that guarantee, and it is deliberately UN-MOCKED. It imports
 * ONLY the bootstrap and the registry — the REAL owner modules run their REAL
 * registration bodies (their singletons construct without opening any socket,
 * and no method is invoked here). So a regression in a real owner's
 * registration — a renamed label, a dropped `registerBoardCloseHandler`, a
 * mis-banded `TeardownOrder`, or an owner left out of the bootstrap — fails
 * HERE, loudly.
 *
 * Contrast `store-mutators.test.ts`: that suite `vi.mock`s the network/DOM
 * owners and has each mock factory re-register a delegating handler, so its
 * per-owner CALL assertions (closeBoard drives each handler → the spy fires)
 * are real, but its registered-label SET reflects what the mocks registered,
 * not production. The completeness SET assertion therefore lives here, against
 * the real modules, where it actually pins production. (Out-of-frame audit
 * 2026-06-22 — the circular-completeness finding this file closes.)
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';

// NO owner mocks. Load the bootstrap so every REAL owner module runs its REAL
// module-init registration; then read the registry. (Construction of the owner
// singletons is side-effect-free w.r.t. the network — KataGoClient stores the
// URL without connecting; no cleanup method is called here.)
import '../../src/store/teardown-registrations';
import {
  registeredBoardCloseLabels,
  registeredWorkspaceResetLabels,
} from '../../src/store/teardown-registry';

describe('teardown registry — production completeness (the real load-guarantee)', () => {
  // The COMPLETE board-close handler set, in run order. ENGINE_STOP first
  // (analysis-service:stop), then the two LEDGER_PURGE purges, then the
  // DEFAULT-band handlers (registration order, which the bootstrap's import
  // order + each owner's evaluation fixes). A dropped/renamed/mis-banded REAL
  // registration, or an owner missing from the bootstrap, fails this loudly.
  it('every resource owner registers its board-close handler, in run order', () => {
    expect([...registeredBoardCloseLabels()]).toEqual([
      'analysis-service:stop',
      'analysis-ledger:purge',
      'stability-trajectory:purge',
      'analysis-persistence:discard',
      'review:abort',
      'thumbnails:purge-board',
      'board-card-trees:remove',
    ]);
  });

  // The COMPLETE workspace-reset handler set, in run order. ENGINE_STOP first
  // (analysis:active-board-analyses), the rest DEFAULT-band. Includes
  // `review:abort-all` (abortAllReviews), which the prior IDENTITY_SCOPED_CACHES
  // registry did NOT carry (it was called separately); it is a co-equal handler
  // now.
  it('every resource owner registers its workspace-reset handler, in run order', () => {
    expect([...registeredWorkspaceResetLabels()]).toEqual([
      'analysis:active-board-analyses',
      'analysis-ledger',
      'stability-trajectories',
      'analysis-bundle-summaries',
      'review:abort-all',
      'board-thumbnails',
      'card-thumbnails',
      'board-card-trees',
    ]);
  });

  // The load-bearing ordering constraint, asserted directly: the engine stop
  // MUST precede the ledger purge (engine-stop-before-ledger-purge — an
  // in-flight packet must not re-populate the ledger after it is cleared).
  // Carried by the explicit TeardownOrder band, not by registration timing
  // (analysis-ledger actually registers BEFORE analysis-service, since
  // analysis-service imports it as a dependency — pure registration order
  // would invert this).
  it('orders engine-stop before the ledger purge on board close', () => {
    const labels = [...registeredBoardCloseLabels()];
    expect(labels.indexOf('analysis-service:stop')).toBeLessThan(
      labels.indexOf('analysis-ledger:purge'),
    );
    expect(labels.indexOf('analysis-service:stop')).toBeLessThan(
      labels.indexOf('stability-trajectory:purge'),
    );
  });

  it('orders engine-stop before the ledger purge on workspace reset', () => {
    const labels = [...registeredWorkspaceResetLabels()];
    expect(labels.indexOf('analysis:active-board-analyses')).toBeLessThan(
      labels.indexOf('analysis-ledger'),
    );
    expect(labels.indexOf('analysis:active-board-analyses')).toBeLessThan(
      labels.indexOf('stability-trajectories'),
    );
  });
});
