/**
 * tests/integration/CacheReplaySettings.test.ts
 *
 * Round-trip contract for `CacheReplaySettings.vue` — the Settings-
 * surface control pair for the proxy replay-cache flags
 * (`engine.katago.cache` / `engine.katago.lookup_cache`), the
 * maintainer's original cache-wiki ask #1. Both checkboxes must
 * read/write the SAME single source of truth `analysis-service.ts`
 * reads at query time — `store.profile.settings.engine.katago.cache`
 * / `.lookup_cache` — through the owner-routed `mutateProfile` seam
 * (`profile-owner.test.ts`'s v-model harness is the sibling
 * precedent for this write path; this file exercises the production
 * component directly rather than a synthetic harness).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, onTestFinished } from 'vitest';
import { mount } from '@vue/test-utils';
import { store, resetWorkspace } from '../../src/store';
import { mutateProfile } from '../../src/store/profile-owner';
import { i18n } from '../../src/i18n';
import CacheReplaySettings from '../../src/components/editors/CacheReplaySettings.vue';

beforeEach(() => {
  resetWorkspace();
});

describe('CacheReplaySettings — round-trip to store.profile.settings.engine.katago', () => {
  it('cache (write) checkbox reflects and mutates the store leaf', async () => {
    const wrapper = mount(CacheReplaySettings, { global: { plugins: [i18n] } });
    onTestFinished(() => wrapper.unmount());

    expect(store.profile.settings.engine.katago.cache).toBe(false);
    expect((wrapper.find('.cache-write-checkbox').element as HTMLInputElement).checked).toBe(false);

    await wrapper.find('.cache-write-checkbox').setValue(true);

    expect(store.profile.settings.engine.katago.cache).toBe(true);

    // Reverse leg: an external owner write reflects back into the
    // bound widget (the WritableComputed's getter).
    mutateProfile((p) => { p.settings.engine.katago.cache = false; });
    await wrapper.vm.$nextTick();
    expect((wrapper.find('.cache-write-checkbox').element as HTMLInputElement).checked).toBe(false);
  });

  it('lookup_cache (read) checkbox reflects and mutates the store leaf, independently of cache', async () => {
    const wrapper = mount(CacheReplaySettings, { global: { plugins: [i18n] } });
    onTestFinished(() => wrapper.unmount());

    expect(store.profile.settings.engine.katago.lookup_cache).toBe(false);

    await wrapper.find('.cache-lookup-checkbox').setValue(true);

    expect(store.profile.settings.engine.katago.lookup_cache).toBe(true);
    // The write flag is untouched by the lookup toggle — the two are
    // independent leaves (see store/schema.ts's field-level doc).
    expect(store.profile.settings.engine.katago.cache).toBe(false);
  });
});
