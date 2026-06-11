/**
 * tests/integration/profile-owner.test.ts
 *
 * Integration contract for the `store.profile` owner module
 * (`src/store/profile-owner.ts`; work-status item
 * settings-profile-mutator-owner). The three commissioned write
 * classes are each driven through the owner and asserted on two
 * axes:
 *
 *   1. Value round-trip — the write lands on the store leaf and
 *      reads back identically.
 *   2. Persistence observability — a watcher with EXACTLY
 *      SyncService's `startWatcher()` shape (the same source tuple,
 *      `deep: true`, default flush) fires for the write, so the
 *      owner reroute cannot have changed what the debounced
 *      persistence path observes.
 *
 * Classes covered:
 *   - a v-model write (compiled-SFC harness mirroring
 *     `AnalysisControls.vue`'s owner-routed WritableComputed wiring,
 *     including the `.number` modifier);
 *   - a registry-editor write (`updateProfileAt` — the
 *     `SettingsTab.vue` seam — including the silent-create contract
 *     `updateRegistry` guarantees the editors);
 *   - a knob write (`writeStoreKnobValue` — the `KnobSlider` /
 *     qEUBO seam — including the documented session.ui-targeting
 *     spillover decl and the substrate's policy pass-through).
 *
 * The store is the real reactive singleton; no services are mocked
 * (none are reached — the owner is pure store mutation; the
 * `resetWorkspace()` isolation call's service cleanups no-op on an
 * empty workspace, as in the sibling suites).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, onTestFinished, vi } from 'vitest';
import { nextTick, watch } from 'vue';
import { mount } from '@vue/test-utils';
import {
  store,
  resetWorkspace,
  boardsVersion,
  buildPersistencePayload,
} from '../../src/store';
import {
  mutateProfile,
  updateProfileAt,
  writeStoreKnobValue,
} from '../../src/store/profile-owner';
import type { KnobId } from '../../src/types';
import ProfileOwnerVModelHarness from './profile-owner-vmodel-harness.vue';

beforeEach(() => {
  resetWorkspace();
});

/**
 * Install a watcher with SyncService.startWatcher()'s exact shape —
 * same source tuple, same `deep: true`, default flush — torn down on
 * test end (pass or fail). The spy is the persistence-observability
 * probe: if it fires, `scheduleSync` would have fired.
 */
function installSyncShapeWatcher(): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  const stop = watch(
    () => [
      boardsVersion.value,
      store.activeBoardIndex,
      store.profile,
      store.session,
    ],
    spy,
    { deep: true },
  );
  onTestFinished(() => stop());
  return spy;
}

describe('profile owner — mutateProfile (named mutator)', () => {
  it('round-trips a typed leaf write and fires the sync-shape deep watcher', async () => {
    const spy = installSyncShapeWatcher();
    expect(store.profile.settings.navigation.actionOnDirtyBoard).toBe('ask');

    mutateProfile((p) => { p.settings.navigation.actionOnDirtyBoard = 'overwrite'; });

    expect(store.profile.settings.navigation.actionOnDirtyBoard).toBe('overwrite');
    await nextTick();
    expect(spy).toHaveBeenCalled();
  });

  it('mutates the live persistence payload object (same reactive graph)', () => {
    mutateProfile((p) => { p.settings.engine.katago.adaptiveReevaluate.extraVisits = 4242; });
    expect(
      buildPersistencePayload().profile.settings.engine.katago.adaptiveReevaluate.extraVisits,
    ).toBe(4242);
  });
});

describe('profile owner — updateProfileAt (registry-editor seam)', () => {
  it('round-trips the literal SettingsTab settings-rooted shape and fires the watcher', async () => {
    const spy = installSyncShapeWatcher();

    // The shape handleSettingsUpdate forwards for the palette dropdown
    // (settings-rooted editor path, prefixed with 'settings').
    updateProfileAt(
      ['settings', 'engine', 'katago', 'analysis_env', 'activePaletteId'],
      'palette-under-test',
    );

    expect(store.profile.settings.engine.katago.analysis_env.activePaletteId)
      .toBe('palette-under-test');
    await nextTick();
    expect(spy).toHaveBeenCalled();
  });

  it('preserves updateRegistry\'s silent-create contract for new intermediate paths', async () => {
    const spy = installSyncShapeWatcher();

    // The editors rely on silent-create when authoring a new
    // parameter_meta entry; the owner seam must carry that contract
    // unchanged. parameter_meta is optional and starts absent.
    updateProfileAt(
      ['settings', 'engine', 'katago', 'analysis_env', 'parameter_meta', 'panicThreshold', 'range'],
      [0, 1],
    );

    expect(
      store.profile.settings.engine.katago.analysis_env.parameter_meta?.panicThreshold?.range,
    ).toEqual([0, 1]);
    await nextTick();
    // The created path is inside the deep-watched profile tree, so
    // the persistence watcher observes the brand-new leaf too.
    expect(spy).toHaveBeenCalled();
  });
});

describe('profile owner — writeStoreKnobValue (knob-substrate seam)', () => {
  it('round-trips a profile-targeting knob write and fires the watcher', async () => {
    const spy = installSyncShapeWatcher();

    // Seeded decl: outputs profile.settings.appearance.ownershipOpacityCeiling.
    // KnobId brand re-mint of a seeded registry key (tests sit outside the
    // src lint surface; the key is pinned by defaults.ts).
    const result = writeStoreKnobValue(
      'display.ownership-opacity-ceiling' as KnobId,
      [0.42],
      { kind: 'manual' },
    );

    expect(result.kind).toBe('written');
    expect(store.profile.settings.appearance.ownershipOpacityCeiling).toBe(0.42);
    await nextTick();
    expect(spy).toHaveBeenCalled();
  });

  it('carries the documented session.ui-targeting spillover decl through the same seam', async () => {
    const spy = installSyncShapeWatcher();

    // Seeded decl: outputs session.ui.moveFilterThreshold — outside the
    // profile subtree but inside the sync watcher's source tuple. The
    // owner header documents this spillover; this test pins it.
    const result = writeStoreKnobValue(
      'display.move-filter-threshold' as KnobId, // KnobId brand re-mint (seeded key)
      [0.66],
      { kind: 'manual' },
    );

    expect(result.kind).toBe('written');
    expect(store.session.ui.moveFilterThreshold).toBe(0.66);
    await nextTick();
    expect(spy).toHaveBeenCalled();
  });
});

describe('profile owner — v-model write through the compiled-SFC harness', () => {
  it('checkbox v-model routes through the owner: round-trip + watcher fire', async () => {
    const spy = installSyncShapeWatcher();
    const wrapper = mount(ProfileOwnerVModelHarness);
    onTestFinished(() => wrapper.unmount());

    expect(store.profile.settings.engine.katago.adaptiveReevaluate.enabled).toBe(false);

    await wrapper.find('input.enabled').setValue(true);

    expect(store.profile.settings.engine.katago.adaptiveReevaluate.enabled).toBe(true);
    await nextTick();
    expect(spy).toHaveBeenCalled();

    // Reverse leg of the round-trip: an external owner write reflects
    // back into the bound widget (the WritableComputed's getter).
    mutateProfile((p) => { p.settings.engine.katago.adaptiveReevaluate.enabled = false; });
    await nextTick();
    expect((wrapper.find('input.enabled').element as HTMLInputElement).checked).toBe(false);
  });

  it('v-model.number coerces before the owner-routed setter runs', async () => {
    const wrapper = mount(ProfileOwnerVModelHarness);
    onTestFinished(() => wrapper.unmount());

    await wrapper.find('input.quantile').setValue('0.25');

    const written = store.profile.settings.engine.katago.adaptiveReevaluate.worstQuantile;
    expect(written).toBe(0.25);
    expect(typeof written).toBe('number');
  });
});
