/**
 * tests/integration/useDeltaViewMode-persistence.test.ts
 *
 * Tier-3 test: `useDeltaViewMode()` reads/writes the REAL global store
 * (`session.ui.deltaViewMode`), the persistence idiom this field follows
 * (`qeuboToolbarView`'s WritableComputedRef pattern, per the field's doc
 * comment in `store/schema.ts` and `useDeltaViewMode.ts`'s header). No
 * lifecycle hooks are registered (`useDeltaViewMode` is a bare computed +
 * a setter function), so no `withSetup` wrapper or service fakes are
 * needed — mirrors `useForestNavigation.test.ts`'s bare-composable shape.
 *
 * Covers: the default-'shared' fallback on a freshly-reset workspace, the
 * cycle mutating the persisted field (not a local-only ref), the
 * shared → black → white → shared wrap, and a round trip through a
 * second composable instance reading the same store cell (the actual
 * "does this survive a remount" property `session.ui` fields need).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useDeltaViewMode } from '../../src/composables/analysis/useDeltaViewMode';
import { store, resetWorkspace } from '../../src/store';

beforeEach(() => resetWorkspace());

describe('useDeltaViewMode — persistence against session.ui.deltaViewMode', () => {
  it("defaults to 'shared' on a freshly-reset workspace", () => {
    const { mode } = useDeltaViewMode();
    expect(mode.value).toBe('shared');
    expect(store.session.ui.deltaViewMode).toBe('shared');
  });

  it('cycle() writes through to the persisted store field, not a local-only ref', () => {
    const { mode, cycle } = useDeltaViewMode();
    cycle();
    expect(mode.value).toBe('black');
    expect(store.session.ui.deltaViewMode).toBe('black');
  });

  it('cycles shared → black → white → shared, wrapping exactly once around', () => {
    const { mode, cycle } = useDeltaViewMode();
    expect(mode.value).toBe('shared');
    cycle();
    expect(mode.value).toBe('black');
    cycle();
    expect(mode.value).toBe('white');
    cycle();
    expect(mode.value).toBe('shared');
  });

  it('a direct store write is visible through the accessor (round trip)', () => {
    const { mode } = useDeltaViewMode();
    store.session.ui.deltaViewMode = 'white';
    expect(mode.value).toBe('white');
  });

  it('a second composable instance observes the same persisted mode (survives "remount")', () => {
    const first = useDeltaViewMode();
    first.cycle();
    expect(first.mode.value).toBe('black');

    // A fresh `useDeltaViewMode()` call — the panel-remount case — reads
    // the same store cell, not a fresh default.
    const second = useDeltaViewMode();
    expect(second.mode.value).toBe('black');
  });

  it("setting mode.value directly persists (not just cycle())", () => {
    const { mode } = useDeltaViewMode();
    mode.value = 'white';
    expect(store.session.ui.deltaViewMode).toBe('white');
  });

  it("resetWorkspace() restores the default 'shared', discarding a prior session's choice", () => {
    const { mode, cycle } = useDeltaViewMode();
    cycle();
    expect(mode.value).toBe('black');

    resetWorkspace();

    const afterReset = useDeltaViewMode();
    expect(afterReset.mode.value).toBe('shared');
  });
});
