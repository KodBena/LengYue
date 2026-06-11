/**
 * tests/integration/analysis-persistence-fake-fidelity.test.ts
 *
 * Fake-fidelity pin for the storage-error throw seam.
 *
 * The `fakeAnalysisPersistenceService` substitutes the real
 * `AnalysisPersistenceService` in the auto-save integration tests. For
 * those tests to mean anything, the fake's `save()` rejection MUST be
 * the same SHAPE the real `save()` throws — otherwise the composable
 * under test is exercised against an error shape production never
 * produces, and a real divergence passes green. That is exactly what
 * happened in the `autosave-pause-unreachable` defect: the fake rejected
 * with a raw `ApiError`, the real service rethrew the already-parsed
 * structural union, and the pause path (unreachable against the real
 * union) was never actually tested.
 *
 * This file is the net. It drives the REAL `AnalysisPersistenceService`
 * into its storage-error catch branch (by spying the api-client's
 * `request` so it rejects with the wire `ApiError` the backend would
 * send) and captures what the service actually throws. It then asserts
 * that value deep-equals what the fake's `realServiceStorageThrow`
 * helper produces from the SAME wire inputs. If the real seam ever
 * changes the throw shape (e.g. someone converts the union to an Error
 * subclass), this pin goes red and the fake must be updated in lockstep
 * — the seam cannot silently diverge again.
 *
 * Tier 3 (integration): real service singleton, real production parser
 * (`parseStorageError`), real `ApiError`; only `api.request` is spied,
 * at exactly the HTTP boundary. `vi.spyOn` (not `vi.mock`) is used
 * deliberately: the service captured the real `api` singleton at module
 * construction, so patching the method on that actual object is what
 * intercepts the call — a `vi.mock` factory that returns a fresh `api`
 * object does not reach the binding the service already holds.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError } from '../../src/services/api-client';
import { analysisPersistenceService } from '../../src/services/analysis-persistence-service';
import { realServiceStorageThrow } from '../fakes/analysis-persistence-service';
import type { BoardId } from '../../src/types';

// The three terminal storage envelopes the backend communicates as
// structured error bodies (the wire shape the real api-client puts on
// `ApiError.body`). Each row is (status, wireBody) — the exact pair the
// fake's `realServiceStorageThrow` is handed in the auto-save tests.
const STORAGE_ENVELOPES: ReadonlyArray<readonly [number, string]> = [
  [
    413,
    '{"detail":{"kind":"bundle_too_large","request_bytes":1000000,"cap_bytes":500000,"detail":"bundle exceeds cap"}}',
  ],
  [
    413,
    '{"detail":{"kind":"user_quota_exceeded","current_bytes":900,"quota_bytes":500,"detail":"quota full"}}',
  ],
  [
    500,
    '{"detail":{"kind":"unknown_scheme","scheme":"q9","detail":"unknown encoder scheme"}}',
  ],
];

describe('fake fidelity — storage-error throw shape matches the real service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(STORAGE_ENVELOPES)(
    'real save() throws the same shape the fake reproduces (status %i)',
    async (status, wireBody) => {
      vi.spyOn(api, 'request').mockRejectedValueOnce(new ApiError(status, wireBody));

      // Drive the real service to its catch branch. An unknown board
      // id projects to an empty bundle (fail-quiet), so `save()` reaches
      // the `api.request` call and rethrows whatever the catch yields.
      let realThrow: unknown;
      try {
        await analysisPersistenceService.save('board-not-in-store' as BoardId);
        throw new Error('expected save() to reject');
      } catch (err) {
        realThrow = err;
      }

      const fakeThrow = realServiceStorageThrow(status, wireBody);

      // The real seam throws the parsed structural union (a plain POJO,
      // not an Error subclass). The fake must reproduce that exact shape.
      expect(realThrow).not.toBeInstanceOf(Error);
      expect(realThrow).toEqual(fakeThrow);
    },
  );

  it('the fake helper refuses a body the real parser does not recognise', () => {
    // Fidelity guard's own guard: `realServiceStorageThrow` must only
    // ever hand back a shape the real service would actually throw. A
    // body the real `parseStorageError` rejects (here: an unknown kind)
    // is a fake-authoring error, surfaced loudly rather than letting a
    // bespoke POJO masquerade as a real throw.
    expect(() =>
      realServiceStorageThrow(413, '{"detail":{"kind":"mystery"}}'),
    ).toThrow(/fake-fidelity/);
  });
});
