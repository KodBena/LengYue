/**
 * tests/integration/analysis-persistence-watch-contract.test.ts
 * Probes the per-key Vue Map reactivity contract that the perf-arc
 * Fix #4 per-board watcher pattern relies on:
 *
 *   `watch(() => svc.dirtyVersionFor(boardId), ...)` for a boardId
 *   not-yet-present in the underlying reactive `dirtyVersions` Map
 *   MUST fire when the key is first inserted via `markDirty`.
 *
 *   Same for `summaryFor(boardId)` when the summary is first inserted
 *   via the service's internal `summaries.set` (which fires from
 *   `save` / `restore` / `refreshSummaries`).
 *
 * If Vue 3's reactive Map collection-handlers DIDN'T register a dep
 * on a `.get(missingKey)` call (only on `.get(presentKey)`), the
 * per-board watchers in `useAutoSaveAnalyses` and `useAppBootstrap`
 * would silently miss the first markDirty / first summary insertion
 * for any board that hadn't been touched by the service yet — a
 * silent failure of the kind the audit doc flagged as the gap that
 * "needs a Vitest probe before relying on it for per-board watchers".
 *
 * This file closes that gap. Two tests: one pure-Vue probe (isolates
 * the assumption from any service wrapper), one production-level
 * probe (exercises the actual `analysisPersistenceService`
 * singleton's contract).
 *
 * Diagnostic substrate:
 * `docs/notes/perf-audit-nav-and-pv-hover-2026-05-27.md` Bug A
 * secondary causes (Fix #4 implementation sketch).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { watch, reactive, nextTick } from 'vue';
import { analysisPersistenceService } from '../../src/services/analysis-persistence-service';
import type { BoardId } from '../../src/types';

describe('Vue reactive Map — per-key watch on previously-absent key', () => {
  it('watch(() => map.get(key) ?? 0) fires on the first set() for that key', async () => {
    const m = reactive(new Map<string, number>());
    let fireCount = 0;
    let lastValue = -1;
    const stop = watch(
      () => m.get('foo') ?? 0,
      (v) => { fireCount++; lastValue = v; },
    );
    await nextTick();
    expect(fireCount).toBe(0);

    m.set('foo', 1);
    await nextTick();
    expect(fireCount).toBe(1);
    expect(lastValue).toBe(1);

    m.set('foo', 2);
    await nextTick();
    expect(fireCount).toBe(2);
    expect(lastValue).toBe(2);

    stop();
  });

  it('watch(() => map.get(key)) sees `undefined → present` as a change', async () => {
    const m = reactive(new Map<string, { v: number }>());
    let lastValue: { v: number } | undefined;
    let fireCount = 0;
    const stop = watch(
      () => m.get('bar'),
      (next) => { fireCount++; lastValue = next; },
    );
    await nextTick();
    expect(fireCount).toBe(0);
    expect(lastValue).toBeUndefined();

    m.set('bar', { v: 42 });
    await nextTick();
    expect(fireCount).toBe(1);
    expect(lastValue).toEqual({ v: 42 });

    stop();
  });
});

describe('analysisPersistenceService — dirtyVersionFor watcher contract', () => {
  // Use unique board ids per test so other test files' state on the
  // singleton can't collide with our probe.
  function uniqueBoardId(): BoardId {
    return `probe-${Math.random().toString(36).slice(2, 10)}-${Date.now()}` as BoardId;
  }

  it('per-board watcher fires on first markDirty for a previously-unseen boardId', async () => {
    const boardId = uniqueBoardId();
    let fireCount = 0;
    let lastVersion = -1;
    const stop = watch(
      () => analysisPersistenceService.dirtyVersionFor(boardId),
      (v) => { fireCount++; lastVersion = v; },
    );
    await nextTick();
    expect(fireCount).toBe(0);
    // The initial read returns 0 (the `?? 0` fallback). The watcher
    // has subscribed to this specific key's reactive slot.

    analysisPersistenceService.markDirty(boardId);
    await nextTick();
    expect(fireCount).toBe(1);
    expect(lastVersion).toBe(1);

    analysisPersistenceService.markDirty(boardId);
    await nextTick();
    expect(fireCount).toBe(2);
    expect(lastVersion).toBe(2);

    stop();
  });

  it('per-board watchers for different boardIds fire independently', async () => {
    const a = uniqueBoardId();
    const b = uniqueBoardId();
    let aFires = 0;
    let bFires = 0;
    const stopA = watch(() => analysisPersistenceService.dirtyVersionFor(a), () => { aFires++; });
    const stopB = watch(() => analysisPersistenceService.dirtyVersionFor(b), () => { bFires++; });
    await nextTick();

    analysisPersistenceService.markDirty(a);
    await nextTick();
    expect(aFires).toBe(1);
    expect(bFires).toBe(0);

    analysisPersistenceService.markDirty(b);
    await nextTick();
    expect(aFires).toBe(1);
    expect(bFires).toBe(1);

    stopA();
    stopB();
  });
});
