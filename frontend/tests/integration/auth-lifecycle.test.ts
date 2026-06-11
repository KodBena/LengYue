/**
 * tests/integration/auth-lifecycle.test.ts
 *
 * Tier-3 integration coverage for the auth lifecycle under the
 * single-owner shape (work-status item single-owner-auth-state;
 * RFC-0001 open question 9): useAuth owns EVERY transition of the
 * nominal auth state; api-client only reports.
 *
 * Drives the REAL useAuth + REAL api-client + REAL SyncService + real
 * store against a stubbed global fetch (the network boundary) and the
 * established store-cleanup fakes (the same set as
 * store-mutators.test.ts) so `resetWorkspace`'s IDENTITY_SCOPED_CACHES
 * drain is observable as spies. The three pinned behaviours:
 *
 *   1. The auto-login path (ALLOW_PASSWORDLESS_LOGIN mode) is
 *      unchanged: tryAutoLogin lands 'authenticated' with the
 *      verified userId.
 *   2. An unrecovered 401 on a NON-auth endpoint forces the useAuth
 *      transition — identity-honest (the retry re-attempts the cached
 *      identity, never substitutes), owner-performed (storage cleared
 *      by useAuth, not the transport) — and the downstream
 *      identity-flip chain still fires end-to-end: SyncService's
 *      auth-state watcher → resetWorkspace → the IDENTITY_SCOPED_CACHES
 *      drain.
 *   3. Auth-endpoint 401s (the /auth/me verify path) transition via
 *      their caller's own branch without bumping the transport's
 *      rejection report (no double-transition source).
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store-cleanup boundaries, mocked exactly as in store-mutators.test.ts
// so resetWorkspace's registry drain records on spies instead of touching
// network / DOM dependencies.
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

vi.mock('../../src/composables/cards/useCardThumbnail', () => ({
  clearCardThumbnailCache: vi.fn(),
  getCardThumbnailSync: vi.fn(() => ''),
}));

// The purge surface moved to its owner module in the render-lifecycle
// consolidation (PR #413); mock BOTH paths so the registry's import is
// intercepted wherever it resolves (gate-411 finding 5: the prior
// hand-enumerated mock-path drifted exactly this way).
vi.mock('../../src/composables/cards/thumbnail-render-resources', () => ({
  purgeBoardThumbnails: vi.fn(),
  purgeAllThumbnails: vi.fn(),
}));
vi.mock('../../src/composables/cards/useThumbnailCache', () => ({
  useThumbnailCache: () => ({
    getThumbnailSvg: vi.fn(),
    getVariationThumbnail: vi.fn(),
    getSync: vi.fn(),
    warmPath: vi.fn(),
  }),
}));

vi.mock('../../src/composables/cards/board-card-trees', () => ({
  removeBoardCardTree: vi.fn(),
  clearAllBoardCardTrees: vi.fn(),
  getOrCreateBoardCardTree: vi.fn(),
  getBoardCardTree: vi.fn(() => null),
}));

import { flushPromises } from '@vue/test-utils';
// LOAD-BEARING IMPORT ORDER: `src/store` must initialize BEFORE the auth
// chain (useAuth → api-client). The analysis-persistence FAKE — loaded by
// its vi.mock factory while `src/store` itself initializes — statically
// imports api-client (for ApiError), and api-client statically imports
// the store. When the store branch leads (the order store-mutators.test.ts
// established), that loop runs through the branch's own await ancestry and
// the module runner resolves it as an ordinary cycle. When the auth chain
// leads instead (useAuth → api-client → store → mock factory → fake →
// api-client-still-in-flight), the factory's dynamic import awaits a
// module on a DIFFERENT branch and the worker deadlocks at collect time —
// verified empirically (2026-06-11): swapping this import above the store
// import hangs the run before any test executes.
import {
  store,
  resetWorkspace,
  clearSystemMessages,
  CURRENT_SCHEMA_VERSION,
  identityScopedCacheLabels,
} from '../../src/store';
import { useAuth } from '../../src/composables/auth-app/useAuth';
import { api, ApiError, authSessionRejections } from '../../src/services/api-client';
import { SyncService } from '../../src/services/sync-service';
import { ledger } from '../../src/services/analysis-ledger';
import { stabilityTrajectoryStore } from '../../src/services/stability-trajectory-store';
import { i18n } from '../../src/i18n';
import { fakeAnalysisService, resetFakeAnalysisService } from '../fakes/analysis-service';
import {
  fakeAnalysisPersistenceService,
  resetFakeAnalysisPersistenceService,
} from '../fakes/analysis-persistence-service';
import { clearCardThumbnailCache } from '../../src/composables/cards/useCardThumbnail';
import { purgeAllThumbnails } from '../../src/composables/cards/thumbnail-render-resources';
import { clearAllBoardCardTrees } from '../../src/composables/cards/board-card-trees';
import { withSetup } from './with-setup';
import type { MockInstance } from 'vitest';

const auth = useAuth();

// ── Registry-derived drain assertions (PR #411 out-of-frame gate, finding 5)
// The IDENTITY_SCOPED_CACHES drain pin asserts every registered cache's clear
// fired on identity flip. Deriving the asserted set from
// `identityScopedCacheLabels()` rather than hand-enumerating it means a
// NEW or RENAMED registry row fails this suite LOUDLY (with a clear message)
// instead of silently going unasserted — the structural fix for the
// hand-enumerated drift the coordinator's hotfix patched at one mock path.
//
// One spy per registry label, keyed by the label string. Two spy kinds:
// fakes / module mocks already in place above (read their recorded calls),
// and live singletons spied with vi.spyOn (ledger, stability-trajectories).
// `installDrainSpies` returns the live spies so the caller can restore them.
interface DrainSpies {
  /** label → a function reading that label's recorded call count. */
  callCountFor: (label: string) => number;
  restore: () => void;
}

function installDrainSpies(): DrainSpies {
  const ledgerSpy: MockInstance = vi.spyOn(ledger, 'purgeAll');
  const stabilitySpy: MockInstance = vi.spyOn(stabilityTrajectoryStore, 'purgeAll');

  // The label → call-count reader map. Every label IDENTITY_SCOPED_CACHES
  // registers must appear here; the assertion loop below verifies that, so a
  // new registry row with no mapped spy fails with a named gap rather than a
  // missing assertion.
  const counters: Record<string, () => number> = {
    'analysis:active-board-analyses': () => fakeAnalysisService.stopAllBoardAnalyses.mock.calls.length,
    'analysis-ledger': () => ledgerSpy.mock.calls.length,
    'stability-trajectories': () => stabilitySpy.mock.calls.length,
    'board-thumbnails': () => vi.mocked(purgeAllThumbnails).mock.calls.length,
    'card-thumbnails': () => vi.mocked(clearCardThumbnailCache).mock.calls.length,
    'board-card-trees': () => vi.mocked(clearAllBoardCardTrees).mock.calls.length,
    'analysis-bundle-summaries': () => fakeAnalysisPersistenceService.forgetAll.mock.calls.length,
  };

  return {
    callCountFor: (label: string): number => {
      const reader = counters[label];
      if (reader === undefined) {
        throw new Error(
          `auth-lifecycle drain pin: IDENTITY_SCOPED_CACHES registers label ` +
          `"${label}" but this test has no spy mapped for it. Add a spy to ` +
          `installDrainSpies() (a fake/mock call-count reader, or a vi.spyOn ` +
          `on the live singleton) so the registry-derived drain assertion ` +
          `covers it. Mapped labels: ${Object.keys(counters).join(', ')}.`,
        );
      }
      return reader();
    },
    restore: (): void => {
      ledgerSpy.mockRestore();
      stabilitySpy.mockRestore();
    },
  };
}

/**
 * Assert every registry label drained exactly once. Derives the label set
 * from `identityScopedCacheLabels()`, so a new/renamed entry fails loudly
 * (either here, with the per-label count, or in `callCountFor` with the
 * unmapped-label message above).
 */
function expectFullDrain(spies: DrainSpies): void {
  const labels = identityScopedCacheLabels();
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) {
    expect(
      spies.callCountFor(label),
      `IDENTITY_SCOPED_CACHES label "${label}" did not drain exactly once on ` +
      `identity flip`,
    ).toBe(1);
  }
}

// ── Fetch router ──────────────────────────────────────────────────────────────
// A minimal backend double for the two operating modes the Tenancy section
// names: 'healthy' serves logins/data for the configured users; 'rejecting'
// 401s every credentialed request (dead session + password account, so the
// item-28 re-login cannot recover). `rejectMe` isolates the /auth/me
// verify-401 path while logins still succeed.

interface RouterState {
  mode: 'healthy' | 'rejecting';
  rejectMe: boolean;
  loginAttempts: string[];
}

function installFetchRouter(users: Record<string, number>): RouterState {
  const state: RouterState = { mode: 'healthy', rejectMe: false, loginAttempts: [] };
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status });

  vi.stubGlobal('fetch', vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const bearer = headers['Authorization']?.startsWith('Bearer ')
      ? headers['Authorization'].slice('Bearer '.length)
      : null;
    const bearerUser = bearer?.startsWith('token-for-')
      ? bearer.slice('token-for-'.length)
      : null;

    if (path === '/auth/token') {
      const username = new URLSearchParams(String(init?.body)).get('username') ?? '';
      state.loginAttempts.push(username);
      if (state.mode === 'rejecting' || !(username in users)) {
        return json(401, { detail: 'invalid credentials' });
      }
      return json(200, { access_token: `token-for-${username}`, token_type: 'bearer' });
    }
    if (path === '/auth/register') {
      return json(200, { status: 'user created' });
    }
    if (path === '/auth/me') {
      if (state.mode === 'rejecting' || state.rejectMe || !bearerUser || !(bearerUser in users)) {
        return json(401, { detail: 'could not validate credentials' });
      }
      return json(200, { username: bearerUser, id: users[bearerUser] });
    }
    // Data endpoints: bearer-gated.
    if (state.mode === 'rejecting' || !bearerUser) {
      return json(401, { detail: 'could not validate credentials' });
    }
    if (path.startsWith('/documents/')) {
      // Current-schema empty workspace: hydration applies without
      // walking the migration chain (mirrors a fresh user document).
      return json(200, { data: { schemaVersion: CURRENT_SCHEMA_VERSION } });
    }
    return json(200, { ok: true });
  }));
  return state;
}

beforeEach(() => {
  localStorage.clear();
  // Module-scope auth state persists across tests in this file; route it
  // to a known baseline through the owner's own public transition.
  auth.logout();
  resetWorkspace();
  clearSystemMessages();
  // Clear the logout/reset baseline so per-test assertions are honest
  // (resetWorkspace fires every cleanup spy once — the store-mutators
  // double-reset pattern).
  resetFakeAnalysisService();
  resetFakeAnalysisPersistenceService();
  vi.mocked(clearCardThumbnailCache).mockReset();
  vi.mocked(purgeAllThumbnails).mockReset();
  vi.mocked(clearAllBoardCardTrees).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auto-login (passwordless / transparent-local-install mode)', () => {
  it('tryAutoLogin lands authenticated with the verified userId — the zero-friction path is unchanged', async () => {
    const router = installFetchRouter({ local_user: 1 });

    await auth.tryAutoLogin();

    expect(auth.state.value).toEqual({ kind: 'authenticated', username: 'local_user', userId: 1 });
    expect(router.loginAttempts).toEqual(['local_user']);
    expect(localStorage.getItem('auth_token')).toBe('token-for-local_user');
    expect(localStorage.getItem('auth_username')).toBe('local_user');
  });
});

describe('mid-session 401 on a non-auth endpoint (multi-tenant mode, dead session)', () => {
  it('forces the owner transition — identity-honest, storage cleared by useAuth — and the identity-scoped drain fires end-to-end', async () => {
    const router = installFetchRouter({ bob: 7 });

    // Establish identity + a hydrated SyncService (the watcher chain the
    // transition must drive). connect() registers watchers; withSetup
    // scopes them so they are reclaimed on test finish (pass or fail).
    await auth.login('bob', 'pw');
    expect(auth.state.value).toEqual({ kind: 'authenticated', username: 'bob', userId: 7 });

    const sync = new SyncService('user_workspace_01', auth);
    withSetup(() => { sync.connect(); });
    await flushPromises();
    // Hydration completed for bob — the precondition for the wipe branch.
    expect(store.engine.messages.some(
      (m) => m.text === i18n.global.t('sync.workspaceLoaded'),
    )).toBe(true);

    // Baseline after setup: no drain has fired yet.
    expect(fakeAnalysisService.stopAllBoardAnalyses).not.toHaveBeenCalled();
    // Registry-derived drain spies (gate-411 finding 5): one spy per
    // IDENTITY_SCOPED_CACHES label, asserted by deriving the label set from
    // the registry so a new/renamed entry fails loudly.
    const drainSpies = installDrainSpies();
    const attemptsBefore = router.loginAttempts.length;
    const rejectionsBefore = authSessionRejections.value;

    // The session dies server-side (password account: re-login cannot
    // recover). The next data request observes the unrecovered 401.
    router.mode = 'rejecting';
    await expect(api.request('GET', '/cards/probe')).rejects.toBeInstanceOf(ApiError);

    // Identity-honest: the one recovery attempt was as the cached 'bob' —
    // never a silent substitution of a different identity.
    expect(router.loginAttempts.slice(attemptsBefore)).toEqual(['bob']);
    expect(authSessionRejections.value).toBe(rejectionsBefore + 1);

    // The OWNER transition (flush: 'sync' — observable immediately after
    // the rejection): state flipped, warning surfaced, storage cleared by
    // useAuth via api.clearToken().
    expect(auth.state.value).toEqual({ kind: 'unauthenticated' });
    expect(store.engine.messages.some(
      (m) => m.type === 'warning' && m.text === i18n.global.t('auth.sessionExpired'),
    )).toBe(true);
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('auth_username')).toBeNull();

    // Downstream: SyncService's auth-state watcher (flush 'pre') runs
    // resetWorkspace, which drains the IDENTITY_SCOPED_CACHES registry —
    // the tenancy wipe pinned end-to-end from the 401. Asserted by deriving
    // the label set from the registry: EVERY registered cache drained once,
    // including stability-trajectories (the entry the prior hand-enumerated
    // assertion list silently omitted — gate-411 finding 5).
    await flushPromises();
    expectFullDrain(drainSpies);

    drainSpies.restore();
  });

  it('a burst of rejected requests transitions once (owner reaction is idempotent)', async () => {
    const router = installFetchRouter({ bob: 7 });
    await auth.login('bob', 'pw');

    router.mode = 'rejecting';
    await expect(api.request('GET', '/cards/a')).rejects.toBeInstanceOf(ApiError);
    clearSystemMessages();
    await expect(api.request('GET', '/cards/b')).rejects.toBeInstanceOf(ApiError);

    // Second rejection: state already 'unauthenticated', kind-guard
    // short-circuits — no duplicate warning.
    expect(auth.state.value).toEqual({ kind: 'unauthenticated' });
    expect(store.engine.messages.some(
      (m) => m.text === i18n.global.t('auth.sessionExpired'),
    )).toBe(false);
  });
});

describe("failed login/register ATTEMPT against a still-valid prior session (delta-c)", () => {
  // PR #411 worklog behavioural delta 2 / gate finding 1: a failed
  // login/register attempt no longer strips a still-valid prior session's
  // JWT. A 401 from /auth/token is an AUTH-endpoint rejection — it never
  // bumps the transport's rejection counter, and api.login throws before
  // writing any token, so the prior identity's storage survives untouched.
  // The state goes to 'error'; storage is the recovery source of truth for
  // tryAutoLogin, so a reload would resurrect the prior identity. This pins
  // that policy so a future "consistency" edit re-adding a storage clear to
  // the 'error' paths goes red here.
  it('a failed login attempt leaves the prior identity in storage (state error, prior JWT survives a reload-shaped read)', async () => {
    const router = installFetchRouter({ alice: 3 });

    // Establish the valid prior session as alice.
    await auth.login('alice', 'pw');
    expect(auth.state.value).toEqual({ kind: 'authenticated', username: 'alice', userId: 3 });
    expect(localStorage.getItem('auth_token')).toBe('token-for-alice');

    const rejectionsBefore = authSessionRejections.value;

    // Attempt to switch to 'bob' with a wrong/unknown credential: /auth/token
    // 401s, api.login throws BEFORE writing a token, login() routes to 'error'.
    await expect(auth.login('bob', 'wrongpw')).rejects.toBeInstanceOf(ApiError);
    expect(auth.state.value.kind).toBe('error');

    // The auth-endpoint 401 did NOT bump the rejection counter (no
    // double-transition source; the watch's storage clear never engaged).
    expect(authSessionRejections.value).toBe(rejectionsBefore);

    // Reload-shaped read: storage still holds alice's valid session, so a
    // fresh page load (tryAutoLogin reading cachedUsername + the JWT) would
    // recover her — the failed switch did NOT log her out.
    expect(localStorage.getItem('auth_token')).toBe('token-for-alice');
    expect(api.cachedUsername()).toBe('alice');
  });

  it('a failed register attempt likewise leaves the prior identity in storage', async () => {
    const router = installFetchRouter({ alice: 3 });
    await auth.login('alice', 'pw');
    expect(localStorage.getItem('auth_token')).toBe('token-for-alice');

    const rejectionsBefore = authSessionRejections.value;

    // register('carol') succeeds (router serves 200), but the follow-on
    // login('carol') 401s in 'rejecting' mode → 'error', prior JWT survives.
    router.mode = 'rejecting';
    await expect(auth.register('carol', 'pw')).rejects.toBeInstanceOf(ApiError);
    expect(auth.state.value.kind).toBe('error');
    expect(authSessionRejections.value).toBe(rejectionsBefore);
    expect(localStorage.getItem('auth_token')).toBe('token-for-alice');
    expect(api.cachedUsername()).toBe('alice');
  });
});

describe("dead-token-in-error-state — the undisclosed fourth delta's corner (gate-411)", () => {
  // PR #411 out-of-frame gate, the undisclosed fourth delta: with the
  // transport's unconditional 401-clear retired and the owner's clear behind
  // the kind-guard, a non-'authenticated' state + a stored (rejected) token
  // would leave a dead token re-entering the futile re-login retry loop. The
  // fix: the rejection watch ALSO clears storage when a token is stored and
  // the state is non-'authenticated' (the in-flight-reauth skip is preserved
  // at the transport's bump guard). This pins that the rejection clears
  // storage and the loop does not recur.
  it('a rejection in a non-authenticated state clears the dead token and stops the retry loop', async () => {
    const router = installFetchRouter({ bob: 7 });

    // Authenticate as bob: token stored, state authenticated.
    await auth.login('bob', 'pw');
    expect(localStorage.getItem('auth_token')).toBe('token-for-bob');

    // A failed switch-to-ghost leaves state 'error' with bob's token still in
    // storage (the delta-c shape) — the precondition for the corner.
    await expect(auth.login('ghost', 'pw')).rejects.toBeInstanceOf(ApiError);
    expect(auth.state.value.kind).toBe('error');
    expect(localStorage.getItem('auth_token')).toBe('token-for-bob');
    expect(api.cachedUsername()).toBe('bob');

    // The session dies server-side. The next data request observes the
    // unrecovered 401 (one identity-honest retry as bob, which also 401s).
    router.mode = 'rejecting';
    const attemptsBefore = router.loginAttempts.length;
    await expect(api.request('GET', '/cards/probe')).rejects.toBeInstanceOf(ApiError);

    // The watch, seeing state 'error' (non-'authenticated') + a stored
    // identity, cleared BOTH storage keys — the dead token is gone.
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(api.cachedUsername()).toBeNull();
    // State is NOT re-flipped (the corner clears storage only; 'error'
    // may carry a message the user is acting on).
    expect(auth.state.value.kind).toBe('error');

    // No retry loop: the request fired exactly one re-login attempt (bob),
    // and with storage now clear a SUBSEQUENT request fails fast with ZERO
    // further re-login attempts.
    expect(router.loginAttempts.slice(attemptsBefore)).toEqual(['bob']);
    const attemptsAfterFirst = router.loginAttempts.length;
    await expect(api.request('GET', '/cards/probe2')).rejects.toBeInstanceOf(ApiError);
    expect(router.loginAttempts.slice(attemptsAfterFirst)).toEqual([]);
  });
});

describe('verify-401 (/auth/me) — the auth-endpoint skip', () => {
  it('transitions via the verify branch without bumping the transport report (no double-transition source)', async () => {
    const router = installFetchRouter({ bob: 7 });
    router.rejectMe = true;

    const rejectionsBefore = authSessionRejections.value;
    await auth.login('bob', 'pw');

    // Login succeeded but the verify step 401'd: the verify branch owns
    // this transition (clear + unauthenticated + warning)…
    expect(auth.state.value).toEqual({ kind: 'unauthenticated' });
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(store.engine.messages.some(
      (m) => m.type === 'warning' && m.text === i18n.global.t('auth.sessionNotRecognised'),
    )).toBe(true);
    // …and the transport never reported it (auth endpoints are the
    // caller's to handle — a bump here would have double-transitioned).
    expect(authSessionRejections.value).toBe(rejectionsBefore);
  });
});
