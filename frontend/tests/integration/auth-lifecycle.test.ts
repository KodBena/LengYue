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

vi.mock('../../src/composables/cards/useThumbnailCache', () => ({
  purgeBoardThumbnails: vi.fn(),
  purgeAllThumbnails: vi.fn(),
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
import { store, resetWorkspace, clearSystemMessages, CURRENT_SCHEMA_VERSION } from '../../src/store';
import { useAuth } from '../../src/composables/auth-app/useAuth';
import { api, ApiError, authSessionRejections } from '../../src/services/api-client';
import { SyncService } from '../../src/services/sync-service';
import { ledger } from '../../src/services/analysis-ledger';
import { i18n } from '../../src/i18n';
import { fakeAnalysisService, resetFakeAnalysisService } from '../fakes/analysis-service';
import {
  fakeAnalysisPersistenceService,
  resetFakeAnalysisPersistenceService,
} from '../fakes/analysis-persistence-service';
import { clearCardThumbnailCache } from '../../src/composables/cards/useCardThumbnail';
import { purgeAllThumbnails } from '../../src/composables/cards/useThumbnailCache';
import { clearAllBoardCardTrees } from '../../src/composables/cards/board-card-trees';
import { withSetup } from './with-setup';

const auth = useAuth();

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
    const purgeAllSpy = vi.spyOn(ledger, 'purgeAll');
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
    // the tenancy wipe pinned end-to-end from the 401.
    await flushPromises();
    expect(fakeAnalysisService.stopAllBoardAnalyses).toHaveBeenCalledTimes(1);
    expect(purgeAllSpy).toHaveBeenCalledTimes(1);
    expect(purgeAllThumbnails).toHaveBeenCalledTimes(1);
    expect(clearCardThumbnailCache).toHaveBeenCalledTimes(1);
    expect(clearAllBoardCardTrees).toHaveBeenCalledTimes(1);
    expect(fakeAnalysisPersistenceService.forgetAll).toHaveBeenCalledTimes(1);

    purgeAllSpy.mockRestore();
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
