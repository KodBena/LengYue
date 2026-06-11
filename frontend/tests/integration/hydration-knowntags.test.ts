/**
 * tests/integration/hydration-knowntags.test.ts
 *
 * Guards the structural fix for `tags-fetch-hydration-race`: `knownTags`
 * moved out of the persisted `ProfileState` to a non-persisted top-level
 * `GlobalStore` field, so the boot-time getTags() write and SyncService's
 * un-awaited hydration target different fields and can no longer race.
 *
 * These assert the boundary directly (the investigation found zero prior
 * coverage of `updateFromRemote` / `deepMerge`): hydration does not touch
 * the live tag dictionary, persistence excludes it, and a legacy blob's
 * stale `profile.knownTags` is stripped on the way in (migration 57→58).
 * After the move these mostly guard against re-introduction (someone
 * re-persisting the field).
 *
 * Drives the real store singleton + the real `updateFromRemote` /
 * `buildPersistencePayload` (both synchronous and service-free at call
 * time), so no fakes are needed.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  store,
  updateFromRemote,
  buildPersistencePayload,
  CURRENT_SCHEMA_VERSION,
} from '../../src/store';
import type { GlobalStore, ProfileState } from '../../src/store/schema';

// `updateFromRemote`'s parameter is `Partial<GlobalStore> & { schemaVersion?:
// number }` — `Partial<GlobalStore>` keeps `profile` a FULL `ProfileState`,
// but the function deep-merges whatever partial profile a remote blob carries
// (the production type is stricter than the runtime). These tests deliberately
// hydrate from minimal / legacy blobs, so the remote shape is modelled as a
// deep-partial GlobalStore: every leg optional, the profile a `Partial<…>`.
// This replaces the prior `as any` fixtures (which escaped vue-tsc entirely —
// the tests-outside-typecheck gap the stage-2 rider names) with a single
// typed seam that still type-checks the field names the tests assert on.
type RemoteBlob = Partial<Omit<GlobalStore, 'profile'>> & {
  schemaVersion?: number;
  // Legacy blobs may carry a now-removed `knownTags` profile key (the
  // migration-57→58 strip path), so the profile leg admits that dead field
  // alongside the live `Partial<ProfileState>` shape.
  profile?: Partial<ProfileState> & { knownTags?: string[] };
};
const remote = (blob: RemoteBlob): Parameters<typeof updateFromRemote>[0] =>
  // The deep-partial RemoteBlob is what updateFromRemote's deepMerge accepts at
  // runtime; widen to the declared (stricter) parameter type at this one seam.
  blob as Parameters<typeof updateFromRemote>[0];

describe('knownTags — non-persisted, hydration-immune', () => {
  it('buildPersistencePayload excludes knownTags (not a top-level key, not in profile)', () => {
    const payload = buildPersistencePayload();
    expect('knownTags' in payload).toBe(false);
    expect('knownTags' in payload.profile).toBe(false);
  });

  it('updateFromRemote does not touch store.knownTags — the race is structurally gone', () => {
    store.knownTags = ['fresh-a', 'fresh-b'];
    // A current-shape remote blob carries no profile.knownTags; hydration
    // merges the profile but never reads or writes a top-level knownTags.
    updateFromRemote(remote({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      profile: { username: 'remote-user' },
    }));
    expect(store.knownTags).toEqual(['fresh-a', 'fresh-b']); // untouched
    expect(store.profile.username).toBe('remote-user'); // hydration did run
  });

  it('strips a legacy blob\'s stale profile.knownTags on hydrate (migration 57→58), live dictionary intact', () => {
    store.knownTags = ['live-1'];
    updateFromRemote(remote({
      schemaVersion: 57,
      profile: { knownTags: ['stale-persisted'] },
    }));
    // Migration deleted the dead key before deepMerge, so it never
    // re-lands on store.profile…
    expect('knownTags' in store.profile).toBe(false);
    // …and the live (top-level) dictionary is untouched by hydration.
    expect(store.knownTags).toEqual(['live-1']);
  });
});
