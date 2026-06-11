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
import {
  fakeAnalysisPersistenceService,
  realServiceStorageThrow,
  resetFakeAnalysisPersistenceService,
  seedFakeSummary,
} from '../fakes/analysis-persistence-service';
import type { BoardId } from '../../src/types';
import type { AnalysisBundleStorageError } from '../../src/services/analysis-bundle';

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

// ── Fake-fidelity: the per-board DRAIN seam ──────────────────────────────────
//
// The storage-error pin above guards one seam (what save() throws). The OTHER
// seam the fake mirrors is the per-board *drain*: the real forgetBoard()/
// discard() empties all three board-keyed Maps, and the fake must do the same
// or a closeBoard-cleanup test passes against a fake that no longer matches
// production — the exact class (`persistence-board-keyed-drain`) the
// summaries-only fake was an instance of. These tests drive the REAL service
// and assert it drains all three; a paired assertion checks the fake reproduces
// the same observable post-state from the same inputs. If the real drain ever
// drops a Map (or the fake's mirror drifts), this pin goes red.
describe('fake fidelity — per-board drain shape matches the real service', () => {
  function uniqueBoardId(): BoardId {
    return `drain-probe-${Math.random().toString(36).slice(2, 10)}-${Date.now()}` as BoardId;
  }

  const QUOTA_ERROR: AnalysisBundleStorageError = realServiceStorageThrow(
    413,
    '{"detail":{"kind":"user_quota_exceeded","current_bytes":900,"quota_bytes":500,"detail":"quota full"}}',
  );

  // The wire summary shape the backend returns from a PUT — drives the real
  // service's private `summaries` map via save() so the drain has a summary to
  // clear (the only one of the three Maps with no public setter).
  function summaryWire(boardId: BoardId): Record<string, unknown> {
    return {
      board_id: boardId,
      record_count: 0,
      stored_scheme: 'json-projected-v1',
      stored_byte_size: 16,
      updated_at: '2026-06-11T00:00:00Z',
      uncompressed_byte_size: 16,
      format_descriptor: null,
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    resetFakeAnalysisPersistenceService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function populateRealService(boardId: BoardId): Promise<void> {
    // summaries: drive save() with a spied PUT so the real fromWireSummary
    // path sets the private map (unknown board → empty bundle → reaches PUT).
    vi.spyOn(api, 'request').mockResolvedValueOnce(summaryWire(boardId));
    await analysisPersistenceService.save(boardId);
    // dirtyVersions + autoSaveErrors: public setters.
    analysisPersistenceService.markDirty(boardId);
    analysisPersistenceService.setAutoSaveError(boardId, QUOTA_ERROR);
  }

  it('real discard() drains all three board-keyed maps for the board', async () => {
    const boardId = uniqueBoardId();
    await populateRealService(boardId);

    // All three present.
    expect(analysisPersistenceService.summaryFor(boardId)).toBeDefined();
    expect(analysisPersistenceService.dirtyVersionFor(boardId)).toBe(1);
    expect(analysisPersistenceService.autoSaveErrorFor(boardId)).toBeDefined();

    // DELETE resolves; discard() then drains via forgetBoard.
    vi.spyOn(api, 'request').mockResolvedValueOnce(undefined);
    await analysisPersistenceService.discard(boardId);

    expect(analysisPersistenceService.summaryFor(boardId)).toBeUndefined();
    expect(analysisPersistenceService.dirtyVersionFor(boardId)).toBe(0);
    expect(analysisPersistenceService.autoSaveErrorFor(boardId)).toBeUndefined();
  });

  it('real forgetBoard() drains all three without an HTTP call', async () => {
    const boardId = uniqueBoardId();
    await populateRealService(boardId);

    // forgetBoard makes no request — spy throws if one is attempted.
    // Clear the populate-phase save() call from the spy's history first
    // (vi.spyOn returns the existing spy with its calls intact).
    const reqSpy = vi.spyOn(api, 'request').mockImplementation(() => {
      throw new Error('forgetBoard must not make an HTTP call');
    });
    reqSpy.mockClear();
    analysisPersistenceService.forgetBoard(boardId);
    expect(reqSpy).not.toHaveBeenCalled();

    expect(analysisPersistenceService.summaryFor(boardId)).toBeUndefined();
    expect(analysisPersistenceService.dirtyVersionFor(boardId)).toBe(0);
    expect(analysisPersistenceService.autoSaveErrorFor(boardId)).toBeUndefined();
  });

  it('the fake reproduces the same observable drain the real service performs', async () => {
    // Same inputs to the fake; assert the same observable post-state. This is
    // the cross-check that the fake mirrors production rather than being hand-
    // shaped to pass: both must show all three entries present then drained.
    const boardId = uniqueBoardId();

    // Fake: populate all three (summaries via the seed seam, the other two via
    // the public setters the real service also exposes).
    seedFakeSummary(boardId, {
      boardId,
      recordCount: 0,
      storedScheme: 'json-projected-v1',
      storedByteSize: 16,
      updatedAt: '2026-06-11T00:00:00Z',
      uncompressedByteSize: 16,
      formatDescriptor: null,
    });
    fakeAnalysisPersistenceService.markDirty(boardId);
    fakeAnalysisPersistenceService.setAutoSaveError(boardId, QUOTA_ERROR);

    expect(fakeAnalysisPersistenceService.summaryFor(boardId)).toBeDefined();
    expect(fakeAnalysisPersistenceService.dirtyVersionFor(boardId)).toBe(1);
    expect(fakeAnalysisPersistenceService.autoSaveErrorFor(boardId)).toBeDefined();

    await fakeAnalysisPersistenceService.discard(boardId);

    // Same observable post-state the real discard() leaves (asserted above).
    expect(fakeAnalysisPersistenceService.summaryFor(boardId)).toBeUndefined();
    expect(fakeAnalysisPersistenceService.dirtyVersionFor(boardId)).toBe(0);
    expect(fakeAnalysisPersistenceService.autoSaveErrorFor(boardId)).toBeUndefined();
  });
});
