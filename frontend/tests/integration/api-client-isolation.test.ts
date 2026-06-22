/**
 * tests/integration/api-client-isolation.test.ts
 *
 * Single-owner auth-state guards for the transport layer (work-status
 * item single-owner-auth-state; RFC-0001 open question 9). This file
 * deliberately imports api-client WITHOUT importing useAuth: the
 * owner's session-rejected watch is never installed, so every
 * assertion here observes what the transport does ON ITS OWN. The
 * load-bearing invariant: api-client throws on 401 and never mutates
 * auth-visible state (JWT / cached username in localStorage) on its
 * own initiative — it reports unrecovered rejections through the
 * read-only `authSessionRejections` counter and the useAuth owner
 * performs the transition (covered in auth-lifecycle.test.ts).
 *
 * Also pins the item-28 lineage (identity-honest single retry: the
 * re-login is attempted as the CACHED identity, never a substitute)
 * and the retirement of the `onTokenInvalidated` callback bridge
 * (export-surface tripwire).
 *
 * Network boundary is a stubbed global fetch; everything else
 * (api-client, the real store for system messages, real i18n) runs
 * for real.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isReadonly } from 'vue';
// The store registers the SystemMessageSink at module init; api-client's 401
// report path pushes through that sink. api-client no longer imports the store
// (the edge was broken behind the sink port — cycle-check ratchet, ADR-0011),
// so this test must load the store itself for the sink to be registered — the
// "real store for system messages" the header names, now an explicit import
// rather than a transitive one.
import '../../src/store';
import * as apiClientModule from '../../src/services/api-client';
import {
  api,
  ApiClient,
  ApiError,
  authSessionRejections,
} from '../../src/services/api-client';

// ── Fetch stub ────────────────────────────────────────────────────────────────

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status });

/** Paths fetched, in order, with the /auth/token form usernames recorded. */
let fetchedPaths: string[] = [];
let loginAttempts: string[] = [];

function installFetch(handler: (path: string, init?: RequestInit) => Promise<Response> | Response): void {
  vi.stubGlobal('fetch', vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    fetchedPaths.push(path);
    if (path === '/auth/token') {
      loginAttempts.push(new URLSearchParams(String(init?.body)).get('username') ?? '');
    }
    return handler(path, init);
  }));
}

beforeEach(() => {
  localStorage.clear();
  fetchedPaths = [];
  loginAttempts = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Bridge retirement (export-surface tripwire) ───────────────────────────────

describe('api-client export surface — the callback bridge is gone', () => {
  it('exports no auth-state mutation/notification hook (exact export set pinned)', () => {
    // Tripwire, same shape as the teardown-registry coverage pins:
    // fails the moment a new export (e.g. a re-introduced callback
    // registration) appears without a deliberate update here.
    expect(Object.keys(apiClientModule).sort()).toEqual([
      'ApiClient',
      'ApiError',
      'api',
      'authSessionRejections',
    ]);
    // The retired bridge specifically: no registration surface on the
    // instance or the class.
    expect('onTokenInvalidated' in api).toBe(false);
    expect(Object.getOwnPropertyNames(ApiClient.prototype)).not.toContain('onTokenInvalidated');
  });

  it('authSessionRejections is a read-only reactive report, not a writable slot', () => {
    expect(isReadonly(authSessionRejections)).toBe(true);
    expect(typeof authSessionRejections.value).toBe('number');
  });
});

// ── 401 behaviour: throw, report, never mutate ────────────────────────────────

describe('request() on 401 — throws and leaves auth storage untouched', () => {
  it('unrecovered non-auth 401: identity-honest retry, ApiError thrown, storage intact, one rejection reported', async () => {
    localStorage.setItem('auth_token', 'dead-token');
    localStorage.setItem('auth_username', 'bob');
    installFetch(() => json(401, { detail: 'could not validate credentials' }));

    const before = authSessionRejections.value;
    const err = await api.request('GET', '/cards/1').then(
      () => { throw new Error('expected rejection'); },
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);

    // Identity-honest retry (item 28): exactly one re-login attempt, as
    // the CACHED identity — never a silent substitution.
    expect(loginAttempts).toEqual(['bob']);

    // The single-owner invariant: the transport mutated NOTHING. (The
    // retired shape cleared auth_token here — this is the regression pin.)
    expect(localStorage.getItem('auth_token')).toBe('dead-token');
    expect(localStorage.getItem('auth_username')).toBe('bob');

    // The rejection is reported exactly once for the owner to consume.
    expect(authSessionRejections.value).toBe(before + 1);
  });

  it('recovered 401 (passwordless refresh): token replaced via login() under the same identity, no rejection reported', async () => {
    localStorage.setItem('auth_token', 'stale-token');
    localStorage.setItem('auth_username', 'bob');
    installFetch((path, init) => {
      if (path === '/auth/token') return json(200, { access_token: 'fresh-token', token_type: 'bearer' });
      const headers = (init?.headers ?? {}) as Record<string, string>;
      return headers['Authorization'] === 'Bearer fresh-token'
        ? json(200, { ok: true })
        : json(401, { detail: 'could not validate credentials' });
    });

    const before = authSessionRejections.value;
    await expect(api.request('GET', '/cards/1')).resolves.toEqual({ ok: true });

    expect(loginAttempts).toEqual(['bob']);
    // The sanctioned write: login() replacing the JWT under the SAME
    // cached identity (identity-preserving refresh, item 28 lineage).
    expect(localStorage.getItem('auth_token')).toBe('fresh-token');
    expect(localStorage.getItem('auth_username')).toBe('bob');
    expect(authSessionRejections.value).toBe(before);
  });

  it('401 with no cached identity: no retry, throw + report, storage stays empty', async () => {
    installFetch(() => json(401, { detail: 'could not validate credentials' }));

    const before = authSessionRejections.value;
    await expect(api.request('GET', '/cards/1')).rejects.toBeInstanceOf(ApiError);

    expect(loginAttempts).toEqual([]); // no cached username → no retry
    expect(fetchedPaths).toEqual(['/cards/1']); // exactly one wire attempt
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(authSessionRejections.value).toBe(before + 1);
  });

  it('auth-endpoint 401 never reports: the caller owns that transition', async () => {
    localStorage.setItem('auth_token', 'dead-token');
    localStorage.setItem('auth_username', 'bob');
    installFetch(() => json(401, { detail: 'could not validate credentials' }));

    const before = authSessionRejections.value;
    await expect(api.request('GET', '/auth/me')).rejects.toBeInstanceOf(ApiError);

    expect(loginAttempts).toEqual([]); // auth endpoints are never retried
    expect(localStorage.getItem('auth_token')).toBe('dead-token'); // untouched
    expect(authSessionRejections.value).toBe(before); // no report
  });

  it('a concurrent 401 while a re-auth is in flight defers to that retry\'s outcome (no premature report)', async () => {
    localStorage.setItem('auth_token', 'stale-token');
    localStorage.setItem('auth_username', 'bob');

    // /auth/token resolution is gated so the re-auth stays in flight
    // while the concurrent request observes its own 401.
    let resolveLogin!: (r: Response) => void;
    const loginGate = new Promise<Response>((res) => { resolveLogin = res; });
    installFetch((path) => {
      if (path === '/auth/token') return loginGate;
      return json(401, { detail: 'could not validate credentials' });
    });

    const before = authSessionRejections.value;

    // Request A hits its 401 and enters the retry; the login is pending.
    const pA = api.request('GET', '/a');
    await vi.waitFor(() => {
      expect(fetchedPaths).toContain('/auth/token');
    });

    // Request B 401s while A's re-auth is in flight: it throws to its
    // caller but does NOT report — A's outcome decides whether the
    // session is dead (if A's retry recovers, a report here would have
    // forced a false logout; the pre-refactor shape had exactly that
    // race via its unconditional clear+callback).
    const pB = api.request('GET', '/b');
    await expect(pB).rejects.toBeInstanceOf(ApiError);
    expect(authSessionRejections.value).toBe(before);

    // A's re-login fails → A's own fall-through 401 reports, exactly once.
    resolveLogin(json(401, { detail: 'could not validate credentials' }));
    await expect(pA).rejects.toBeInstanceOf(ApiError);
    expect(authSessionRejections.value).toBe(before + 1);

    // And still: no transport-side mutation anywhere in the interleaving.
    expect(localStorage.getItem('auth_token')).toBe('stale-token');
    expect(localStorage.getItem('auth_username')).toBe('bob');
  });
});
