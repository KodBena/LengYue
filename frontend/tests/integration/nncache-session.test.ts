/**
 * tests/integration/nncache-session.test.ts
 *
 * Tier-2 tests for the NN-cache-context session driver
 * (`src/services/nncache-session.ts`) against the fake
 * `analysisService` — attach-before-tag ordering, quiescence gating,
 * discard-on-disable, dump+detach on transition, and refusal
 * surfacing (ADR-0002: no retry loops; the checkbox reverts).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computed, ref } from 'vue';

// ── Fakes (hoisted per Vitest's vi.mock contract; see tests/CLAUDE.md) ───────

const fakeUsername = ref<string | null>('alice');

vi.mock('../../src/composables/auth-app/useAuth', () => ({
  useAuth: () => ({ username: computed(() => fakeUsername.value) }),
}));

vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

import { fakeAnalysisService, resetFakeAnalysisService } from '../fakes/analysis-service';
import { store } from '../../src/store';
import { activeAttachedContext, _resetAttachedContextForTesting } from '../../src/state/nncache-context';
import {
  enable,
  disable,
  transition,
  endSession,
  nncacheEnabled,
  nncacheStatus,
  _resetNncacheSessionForTesting,
} from '../../src/services/nncache-session';

function okActionResponse(extra: Record<string, unknown> = {}): unknown {
  return { id: 'x', action: 'cache_attach', ...extra };
}

function errorResponse(message: string, field?: string): unknown {
  return { id: 'x', error: message, ...(field ? { field } : {}) };
}

beforeEach(() => {
  resetFakeAnalysisService();
  _resetNncacheSessionForTesting();
  _resetAttachedContextForTesting();
  fakeUsername.value = 'alice';
  store.engine.messages.length = 0;
});

describe('nncache-session: enable', () => {
  it('quiesces (stopAllBoardAnalyses) BEFORE sending cache_attach', async () => {
    const order: string[] = [];
    fakeAnalysisService.stopAllBoardAnalyses.mockImplementation(() => { order.push('quiesce'); });
    fakeAnalysisService.sendActionCommand.mockImplementation(async () => {
      order.push('attach');
      return okActionResponse();
    });

    await enable('card-5');

    expect(order).toEqual(['quiesce', 'attach']);
  });

  it('on success: marks enabled, and the attached context is tagged BEFORE any later query would read it (attach-before-tag)', async () => {
    fakeAnalysisService.sendActionCommand.mockResolvedValue(okActionResponse());

    expect(activeAttachedContext.value).toBeNull();
    await enable('card-5');

    expect(nncacheEnabled.value).toBe(true);
    expect(nncacheStatus.value).toBe('attached');
    // The wire-legal, namespaced context is what's tagged, not the raw text.
    expect(activeAttachedContext.value).toBe('alice.card-5');
  });

  it('sends a bare attach: no level0 / level1Fill fields on the wire', async () => {
    fakeAnalysisService.sendActionCommand.mockResolvedValue(okActionResponse());
    await enable('card-5');
    const sent = fakeAnalysisService.sendActionCommand.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent.action).toBe('cache_attach');
    expect('level0' in sent).toBe(false);
    expect('level1Fill' in sent).toBe(false);
  });

  it('refuses locally (no wire call) when the context grammar is invalid', async () => {
    await enable('bad name!');
    expect(fakeAnalysisService.sendActionCommand).not.toHaveBeenCalled();
    expect(nncacheEnabled.value).toBe(false);
    expect(store.engine.messages.some(m => m.type === 'warning')).toBe(true);
  });

  it('refuses locally when no username is available', async () => {
    fakeUsername.value = null;
    await enable('card-5');
    expect(fakeAnalysisService.sendActionCommand).not.toHaveBeenCalled();
    expect(nncacheEnabled.value).toBe(false);
  });

  it('a wire refusal (KataErrorResponse) reverts enabled to false and surfaces the engine\'s teaching text — no retry', async () => {
    fakeAnalysisService.sendActionCommand.mockResolvedValue(
      errorResponse('the context is already attached', 'action'),
    );

    await enable('card-5');

    expect(nncacheEnabled.value).toBe(false);
    expect(nncacheStatus.value).toBe('idle');
    expect(activeAttachedContext.value).toBeNull();
    expect(fakeAnalysisService.sendActionCommand).toHaveBeenCalledTimes(1);
    const warning = store.engine.messages.find(m => m.type === 'warning');
    expect(warning?.text).toContain('the context is already attached');
  });
});

describe('nncache-session: disable', () => {
  it('is a no-op (no wire call) when nothing is attached', async () => {
    await disable();
    expect(fakeAnalysisService.sendActionCommand).not.toHaveBeenCalled();
  });

  it('sends cache_detach with discardUndumped:true, and clears attachment locally on a SUCCESSFUL detach', async () => {
    fakeAnalysisService.sendActionCommand.mockResolvedValue(okActionResponse());
    await enable('card-5');
    fakeAnalysisService.sendActionCommand.mockClear();
    fakeAnalysisService.sendActionCommand.mockResolvedValue(okActionResponse({ discardedUndumpedEntries: 3 }));

    await disable();

    const sent = fakeAnalysisService.sendActionCommand.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent.action).toBe('cache_detach');
    expect(sent.discardUndumped).toBe(true);
    expect(nncacheEnabled.value).toBe(false);
    expect(nncacheStatus.value).toBe('idle');
    expect(activeAttachedContext.value).toBeNull();
  });

  it('a REFUSED cache_detach leaves the context attached (engine truth mirrored), keeps stamping outgoing queries, and surfaces the refusal — never silently believed detached', async () => {
    fakeAnalysisService.sendActionCommand.mockResolvedValue(okActionResponse());
    await enable('card-5');
    fakeAnalysisService.sendActionCommand.mockClear();
    fakeAnalysisService.sendActionCommand.mockResolvedValue(errorResponse('1 request open', 'action'));

    await disable();

    // The engine refused to detach, so it is still attached to
    // 'alice.card-5' — the SPA's belief must not silently diverge
    // from that in the dangerous direction (untagged-but-attached).
    expect(nncacheEnabled.value).toBe(true);
    expect(nncacheStatus.value).toBe('attached');
    expect(activeAttachedContext.value).toBe('alice.card-5');
    const warning = store.engine.messages.find(m => m.type === 'warning');
    expect(warning?.text).toContain('1 request open');
    // No automatic retry (ADR-0002) — a second disable() call is a
    // fresh user-initiated attempt, not something this call schedules.
    expect(fakeAnalysisService.sendActionCommand).toHaveBeenCalledTimes(1);
  });
});

describe('nncache-session: transition', () => {
  it('when nothing is attached, transition behaves exactly like enable', async () => {
    fakeAnalysisService.sendActionCommand.mockResolvedValue(okActionResponse());
    await transition('card-7');
    expect(nncacheEnabled.value).toBe(true);
    expect(activeAttachedContext.value).toBe('alice.card-7');
    const sent = fakeAnalysisService.sendActionCommand.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent.action).toBe('cache_attach');
  });

  it('when a context IS attached: dump {what:"both"} then detach (discardUndumped:true, since the dump succeeded) then attach the new context, in order', async () => {
    fakeAnalysisService.sendActionCommand.mockResolvedValue(okActionResponse());
    await enable('card-5');
    fakeAnalysisService.sendActionCommand.mockClear();

    await transition('card-6');

    const calls = fakeAnalysisService.sendActionCommand.mock.calls.map(c => (c[0] as Record<string, unknown>).action);
    expect(calls).toEqual(['cache_dump', 'cache_detach', 'cache_attach']);

    const dumpQuery = fakeAnalysisService.sendActionCommand.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(dumpQuery.what).toBe('both');
    expect(dumpQuery.context).toBe('alice.card-5');

    // Per ledger row 2543: a SUCCESSFUL dump's follow-on detach discards
    // exactly what the admission policy itself refused to persist
    // (single-observation evals; the count is already on disk via the
    // dump's .nncounts leg, so a future session's re-observation still
    // promotes it).
    const detachQuery = fakeAnalysisService.sendActionCommand.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(detachQuery.discardUndumped).toBe(true);

    const attachQuery = fakeAnalysisService.sendActionCommand.mock.calls[2]?.[0] as Record<string, unknown>;
    expect(attachQuery.context).toBe('alice.card-6');

    expect(activeAttachedContext.value).toBe('alice.card-6');
  });

  it('a SUCCESSFUL dump followed by a plain-detach admission refusal ("N earned entries not on disk") now succeeds via discardUndumped:true, with the discard logged', async () => {
    fakeAnalysisService.sendActionCommand.mockResolvedValue(okActionResponse());
    await enable('card-5');
    fakeAnalysisService.sendActionCommand.mockClear();
    // dump succeeds; the ensuing cache_detach carries discardUndumped:true
    // per the fix, so the fake's admission-refusal branch is never hit —
    // this pins the outcome (transition completes) rather than re-deriving
    // the fake's refusal logic.
    fakeAnalysisService.sendActionCommand
      .mockResolvedValueOnce(okActionResponse()) // dump ok
      .mockResolvedValueOnce(okActionResponse({ discardedUndumpedEntries: 1 })) // detach ok (discard)
      .mockResolvedValueOnce(okActionResponse()); // attach ok

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await transition('card-6');

    const detachQuery = fakeAnalysisService.sendActionCommand.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(detachQuery.action).toBe('cache_detach');
    expect(detachQuery.discardUndumped).toBe(true);
    expect(activeAttachedContext.value).toBe('alice.card-6');
    expect(nncacheEnabled.value).toBe(true);
    expect(nncacheStatus.value).toBe('attached');
    expect(infoSpy.mock.calls.some(
      call => typeof call[0] === 'string' && call[0].includes('discarded post-dump admission-refused entries'),
    )).toBe(true);

    infoSpy.mockRestore();
  });

  it('a refused dump aborts the transition, surfaces the refusal, and leaves the OLD context attached (no attach attempted, never left half-tracked)', async () => {
    fakeAnalysisService.sendActionCommand.mockResolvedValue(okActionResponse());
    await enable('card-5');
    fakeAnalysisService.sendActionCommand.mockClear();
    fakeAnalysisService.sendActionCommand.mockResolvedValueOnce(errorResponse('open requests', 'action'));

    await transition('card-6');

    // dump only — detach/attach never sent, and the dump leg never
    // touches attach state, so the engine is still attached to
    // 'alice.card-5' exactly as it was before this call.
    expect(fakeAnalysisService.sendActionCommand).toHaveBeenCalledTimes(1);
    expect(nncacheEnabled.value).toBe(true);
    expect(nncacheStatus.value).toBe('attached');
    expect(activeAttachedContext.value).toBe('alice.card-5');
    expect(store.engine.messages.some(m => m.type === 'warning')).toBe(true);
  });

  it('a refused detach leaves the OLD context attached (engine truth mirrored) and does not attempt the new attach', async () => {
    fakeAnalysisService.sendActionCommand.mockResolvedValue(okActionResponse());
    await enable('card-5');
    fakeAnalysisService.sendActionCommand.mockClear();
    fakeAnalysisService.sendActionCommand
      .mockResolvedValueOnce(okActionResponse()) // dump ok
      .mockResolvedValueOnce(errorResponse('open requests', 'action')); // detach refused

    await transition('card-6');

    // dump + detach only — the new cache_attach for 'card-6' is never
    // sent, because the old context is still attached at the engine.
    expect(fakeAnalysisService.sendActionCommand).toHaveBeenCalledTimes(2);
    expect(activeAttachedContext.value).toBe('alice.card-5');
    expect(nncacheEnabled.value).toBe(true);
    expect(nncacheStatus.value).toBe('attached');
    const warning = store.engine.messages.find(m => m.type === 'warning');
    expect(warning?.text).toContain('open requests');
  });
});

describe('nncache-session: endSession', () => {
  it('is a no-op when nothing is attached', async () => {
    await endSession();
    expect(fakeAnalysisService.sendActionCommand).not.toHaveBeenCalled();
  });

  it('dumps then detaches with discardUndumped:true (post-dump admission-refused residue only — distinct from disable()\'s unconditional discard, which never dumps)', async () => {
    fakeAnalysisService.sendActionCommand.mockResolvedValue(okActionResponse());
    await enable('card-5');
    fakeAnalysisService.sendActionCommand.mockClear();

    await endSession();

    const calls = fakeAnalysisService.sendActionCommand.mock.calls.map(c => (c[0] as Record<string, unknown>).action);
    expect(calls).toEqual(['cache_dump', 'cache_detach']);
    const detachQuery = fakeAnalysisService.sendActionCommand.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(detachQuery.discardUndumped).toBe(true);
    expect(nncacheEnabled.value).toBe(false);
    expect(activeAttachedContext.value).toBeNull();
  });

  it('a FAILED dump keeps the current behavior exactly: reverts to attached, surfaces the refusal, and never attempts a detach', async () => {
    fakeAnalysisService.sendActionCommand.mockResolvedValue(okActionResponse());
    await enable('card-5');
    fakeAnalysisService.sendActionCommand.mockClear();
    fakeAnalysisService.sendActionCommand.mockResolvedValueOnce(errorResponse('open requests', 'action'));

    await endSession();

    expect(fakeAnalysisService.sendActionCommand).toHaveBeenCalledTimes(1);
    expect(fakeAnalysisService.sendActionCommand.mock.calls[0]?.[0]).toMatchObject({ action: 'cache_dump' });
    expect(nncacheEnabled.value).toBe(true);
    expect(nncacheStatus.value).toBe('attached');
    expect(activeAttachedContext.value).toBe('alice.card-5');
    expect(store.engine.messages.some(m => m.type === 'warning')).toBe(true);
  });
});
